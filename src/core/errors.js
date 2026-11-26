/**
 * Structured resolver errors.
 *
 * Previously every failure ended up as a free-text line in the UI ("failed").
 * With an error code the pipeline can decide whether a fallback makes
 * any sense at all (e.g. AUTH_REQUIRED: a second attempt without
 * cookies gains nothing) and the UI can offer targeted help.
 */

const ResolveErrorCode = {
  UNSUPPORTED_URL: "UNSUPPORTED_URL",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  CAPTCHA_REQUIRED: "CAPTCHA_REQUIRED",
  GEO_RESTRICTED: "GEO_RESTRICTED",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  EXTRACTION_FAILED: "EXTRACTION_FAILED",
  NETWORK_ERROR: "NETWORK_ERROR",
  // Additions for the existing flows of this project:
  DEPENDENCY_MISSING: "DEPENDENCY_MISSING", // yt-dlp/ffmpeg/Playwright missing (ENOENT)
  CANCELLED: "CANCELLED"                    // User cancelled
};

/**
 * Order for aggregating several failed attempts: whatever comes first
 * is the more useful statement for the user. "Login required" helps
 * more than the generic "extraction failed" of a second resolver.
 */
const ERROR_PRIORITY = [
  ResolveErrorCode.CANCELLED,
  ResolveErrorCode.AUTH_REQUIRED,
  ResolveErrorCode.SESSION_EXPIRED,
  ResolveErrorCode.CAPTCHA_REQUIRED,
  ResolveErrorCode.GEO_RESTRICTED,
  ResolveErrorCode.DEPENDENCY_MISSING,
  ResolveErrorCode.NETWORK_ERROR,
  ResolveErrorCode.PROVIDER_ERROR,
  ResolveErrorCode.EXTRACTION_FAILED,
  ResolveErrorCode.UNSUPPORTED_URL
];

/**
 * Error codes for which further resolver/fallback stages gain nothing:
 * cancelled is cancelled, and without login/captcha a different
 * extraction method does not change the missing permission.
 */
const TERMINAL_CODES = new Set([
  ResolveErrorCode.CANCELLED
]);

class ResolveError extends Error {
  /**
   * @param {string} code    Value from ResolveErrorCode
   * @param {string} message Human-readable message (no secrets!)
   * @param {{ resolver?: string, url?: string, cause?: any, details?: Object, retryable?: boolean }} [options]
   */
  constructor(code, message, options = {}) {
    super(message || code);
    this.name = "ResolveError";
    this.code = ResolveErrorCode[code] ? code : ResolveErrorCode.EXTRACTION_FAILED;
    if (options.resolver) this.resolver = options.resolver;
    if (options.url) this.url = options.url;
    if (options.cause !== undefined) this.cause = options.cause;
    if (options.details) this.details = options.details;
    this.retryable = options.retryable !== undefined
      ? !!options.retryable
      : !TERMINAL_CODES.has(this.code);
  }

  /** Compact, log-safe representation (contains only code, resolver, message). */
  toLogObject() {
    return {
      code: this.code,
      resolver: this.resolver || null,
      message: this.message
    };
  }
}

/**
 * Heuristic from the existing main.js: does the message look like an
 * access/anti-bot block (403/410/429/451, Cloudflare ...)? If so, a retry
 * with browser impersonation is worthwhile, across sites.
 * Deliberately carried over unchanged so the existing tips stay the same.
 * @param {string} msg
 */
const looksLikeBlock = (msg) => !!msg && /HTTP Error (4|5)\d\d|\b4(0[39]|10|29|51)\b|forbidden|blocked|cloudflare|captcha|Unable to download webpage|TLS|SSL|Got error/i.test(msg);

/** yt-dlp reports "Unsupported URL" when no extractor matches. */
const isUnsupportedUrl = (msg) => !!msg && /unsupported url/i.test(msg);

/**
 * Maps a raw error message (yt-dlp line, fetch error ...) to a
 * structured code. The order of the checks matters: the more
 * specific cases first, the generic block case last.
 * @param {string} msg
 * @returns {string} ResolveErrorCode
 */
const classifyMessage = (msg) => {
  const text = String(msg || "");
  if (!text.trim()) return ResolveErrorCode.EXTRACTION_FAILED;

  if (/\babort(ed)?\b|abgebrochen|cancell?ed/i.test(text)) return ResolveErrorCode.CANCELLED;

  // Check captcha/bot check before auth: "Sign in to confirm you're not a bot"
  // contains both signal words, but is a bot check.
  if (/captcha|not a bot|recaptcha|hcaptcha|challenge required/i.test(text)) {
    return ResolveErrorCode.CAPTCHA_REQUIRED;
  }
  if (/session (has )?expired|cookies are no longer valid|token (has )?expired|invalid session|HTTP Error 401|\b401\b/i.test(text)) {
    return ResolveErrorCode.SESSION_EXPIRED;
  }
  if (/sign in|log ?in required|login required|requires authentication|members?-only|private (video|album|content)|is private|account|--cookies|age.?restricted|confirm your age|premium/i.test(text)) {
    return ResolveErrorCode.AUTH_REQUIRED;
  }
  if (/available in your country|geo.?restrict|geo.?block|HTTP Error 451|\b451\b|blocked in your/i.test(text)) {
    return ResolveErrorCode.GEO_RESTRICTED;
  }
  if (isUnsupportedUrl(text) || /no video (formats )?found|there.?s no video|no media found/i.test(text)) {
    return ResolveErrorCode.UNSUPPORTED_URL;
  }
  if (/ENOENT|wurde nicht gefunden|not installed|command not found|is not recognized/i.test(text)) {
    return ResolveErrorCode.DEPENDENCY_MISSING;
  }
  if (/ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|getaddrinfo|network|timed? ?out|fetch failed|nicht erreichbar/i.test(text)) {
    return ResolveErrorCode.NETWORK_ERROR;
  }
  if (looksLikeBlock(text)) return ResolveErrorCode.PROVIDER_ERROR;

  return ResolveErrorCode.EXTRACTION_FAILED;
};

/**
 * Turns any thrown value into a ResolveError.
 * Already structured errors stay unchanged (including their code).
 * @param {any} err
 * @param {{ resolver?: string, url?: string, code?: string }} [options]
 * @returns {ResolveError}
 */
const toResolveError = (err, options = {}) => {
  if (err instanceof ResolveError) {
    if (options.resolver && !err.resolver) err.resolver = options.resolver;
    if (options.url && !err.url) err.url = options.url;
    return err;
  }
  const message = err && err.message ? err.message : String(err || "Unbekannter Fehler");
  // Node error codes (ENOENT, ECONNRESET ...) feed into the classification.
  const nodeCode = err && typeof err.code === "string" ? err.code : "";
  const code = options.code
    || (ResolveErrorCode[nodeCode] ? nodeCode : classifyMessage(`${nodeCode} ${message}`));
  return new ResolveError(code, message, {
    resolver: options.resolver,
    url: options.url,
    cause: err
  });
};

/**
 * Picks the most meaningful error from several failed attempts.
 * @param {ResolveError[]} errors
 * @returns {ResolveError|null}
 */
const pickMostRelevantError = (errors) => {
  const list = (errors || []).filter(Boolean);
  if (list.length === 0) return null;
  let best = list[0];
  let bestRank = ERROR_PRIORITY.indexOf(best.code);
  for (const err of list.slice(1)) {
    const rank = ERROR_PRIORITY.indexOf(err.code);
    if (rank !== -1 && (bestRank === -1 || rank < bestRank)) {
      best = err;
      bestRank = rank;
    }
  }
  return best;
};

/** Convenience for resolvers: "I could, but only with login". */
const authRequired = (message, options = {}) =>
  new ResolveError(ResolveErrorCode.AUTH_REQUIRED, message, options);

/** Convenience for resolvers: "this URL is not my concern". */
const unsupported = (message, options = {}) =>
  new ResolveError(ResolveErrorCode.UNSUPPORTED_URL, message, options);

module.exports = {
  ResolveError,
  ResolveErrorCode,
  ERROR_PRIORITY,
  TERMINAL_CODES,
  looksLikeBlock,
  isUnsupportedUrl,
  classifyMessage,
  toResolveError,
  pickMostRelevantError,
  authRequired,
  unsupported
};

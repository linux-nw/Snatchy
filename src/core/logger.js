/**
 * Structured logging of the resolution pipeline.
 *
 * Every step (input -> site detected -> provider detected -> resolver
 * tried -> success/error -> fallback -> result) is logged as an object
 * and additionally formatted as one line, so the app's existing
 * "download:log" display can keep being used unchanged.
 *
 * Security: cookies, tokens, passwords and authorization headers are removed or
 * masked before output. This happens centrally here so that no
 * single resolver can forget it.
 */

const STEP = {
  INPUT: "input",
  SITE_DETECTED: "site-detected",
  PROVIDER_DETECTED: "provider-detected",
  RESOLVER_TRY: "resolver-try",
  RESOLVER_OK: "resolver-ok",
  RESOLVER_FAIL: "resolver-fail",
  FALLBACK: "fallback",
  RESULT: "result",
  CACHE_HIT: "cache-hit"
};

const REDACTED = "[redacted]";

/** Query parameters that typically carry signatures/tokens. */
const SENSITIVE_QUERY_PARAMS = [
  "token", "access_token", "auth", "authorization", "sig", "signature",
  "key", "apikey", "api_key", "password", "passwd", "pwd", "session",
  "sessionid", "hash", "policy", "credential", "x-amz-signature"
];

/** Header names whose values are never logged. */
const SENSITIVE_HEADERS = new Set([
  "cookie", "set-cookie", "authorization", "proxy-authorization",
  "x-api-key", "x-auth-token", "x-csrf-token"
]);

/** Object keys that must never appear in the log. */
const SENSITIVE_KEYS = /^(cookies?|token|access_?token|refresh_?token|password|passwd|pwd|secret|authorization|auth_?header|session_?id|api_?key|credential)s?$/i;

/**
 * Removes signature/token parameters from a URL. Invalid URLs are returned
 * unchanged (then it is not a query string anyway).
 * @param {string} url
 */
const redactUrl = (url) => {
  if (typeof url !== "string" || !url) return url;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  let touched = false;
  for (const key of [...parsed.searchParams.keys()]) {
    if (SENSITIVE_QUERY_PARAMS.includes(key.toLowerCase())) {
      parsed.searchParams.set(key, REDACTED);
      touched = true;
    }
  }
  // Also remove userinfo (https://user:pass@host).
  if (parsed.username || parsed.password) {
    parsed.username = "";
    parsed.password = "";
    touched = true;
  }
  return touched ? parsed.toString() : url;
};

/**
 * Sanitize a header map for output: sensitive values are masked, the
 * names stay visible (useful for troubleshooting, reveals nothing).
 * @param {Record<string,string>} headers
 */
const redactHeaders = (headers) => {
  if (!headers || typeof headers !== "object") return headers;
  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    out[name] = SENSITIVE_HEADERS.has(String(name).toLowerCase()) ? REDACTED : value;
  }
  return out;
};

/**
 * Recursive sanitizing of any log payload.
 * @param {any} value
 * @param {number} [depth]
 */
const redact = (value, depth = 0) => {
  if (depth > 6) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactUrl(value);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, code: value.code || null, message: redactUrl(value.message) };
  }

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_KEYS.test(key)) {
      // Count instead of content: helps debugging without revealing anything.
      out[key] = Array.isArray(val) ? `${REDACTED} (${val.length})` : REDACTED;
      continue;
    }
    if (String(key).toLowerCase() === "headers") {
      out[key] = redactHeaders(val);
      continue;
    }
    out[key] = redact(val, depth + 1);
  }
  return out;
};

/** Single-line, human-readable representation of a step. */
const formatEntry = (entry) => {
  const parts = [`[resolve] ${entry.step}`];
  if (entry.resolver) parts.push(`resolver=${entry.resolver}`);
  if (entry.provider) parts.push(`provider=${entry.provider}`);
  if (entry.site) parts.push(`site=${entry.site}`);
  if (entry.url) parts.push(`url=${entry.url}`);
  if (entry.count !== undefined) parts.push(`count=${entry.count}`);
  if (entry.code) parts.push(`code=${entry.code}`);
  if (entry.ms !== undefined) parts.push(`${entry.ms}ms`);
  if (entry.message) parts.push(`- ${entry.message}`);
  return parts.join(" ");
};

/**
 * @param {{ sink?: (line: string, entry: Object) => void, runId?: string, enabled?: boolean }} [options]
 */
const createLogger = (options = {}) => {
  const sink = typeof options.sink === "function" ? options.sink : null;
  const enabled = options.enabled !== false;
  const runId = options.runId || null;
  /** @type {Object[]} */
  const entries = [];

  /**
   * @param {string} step  Value from STEP
   * @param {Object} [data]
   */
  const step = (stepName, data = {}) => {
    const entry = redact({ ...data, step: stepName });
    if (runId) entry.runId = runId;
    entry.ts = Date.now();
    entries.push(entry);
    if (enabled && sink) {
      try {
        sink(formatEntry(entry), entry);
      } catch {
        // Logging must never crash the resolution.
      }
    }
    return entry;
  };

  return {
    STEP,
    step,
    /** All entries collected so far (already sanitized). */
    entries: () => entries.slice(),
    /** Child logger with the same sink, e.g. per candidate. */
    child: (childOptions = {}) => createLogger({ sink, enabled, runId, ...childOptions })
  };
};

/** Logger that outputs nothing but collects entries (tests, default). */
const nullLogger = () => createLogger({ enabled: false });

module.exports = {
  STEP,
  REDACTED,
  SENSITIVE_HEADERS,
  SENSITIVE_QUERY_PARAMS,
  redact,
  redactUrl,
  redactHeaders,
  formatEntry,
  createLogger,
  nullLogger
};

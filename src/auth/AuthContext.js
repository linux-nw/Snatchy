/**
 * AuthContext: deliberately separate from the resolver.
 *
 * A resolver only receives auth as part of the ResolveContext and
 * stores nothing of it. Passwords deliberately do not exist here as a
 * field: the app never logs in by itself, it uses either no auth
 * at all, already existing cookies or a session reference.
 */

const { ResolveError, ResolveErrorCode } = require("../core/errors");

const AUTH_TYPES = new Set(["none", "cookies", "session"]);

/** Fields that must never belong in an AuthContext. */
const FORBIDDEN_FIELDS = ["password", "passwd", "pwd", "secret", "apiKey", "api_key", "token"];

/**
 * Normalizes a single cookie to {name, value, domain?, path?, expires?}.
 * @param {any} raw
 */
const normalizeCookie = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;
  const cookie = { name, value: typeof raw.value === "string" ? raw.value : "" };
  if (typeof raw.domain === "string" && raw.domain) cookie.domain = raw.domain;
  if (typeof raw.path === "string" && raw.path) cookie.path = raw.path;
  if (Number.isFinite(raw.expires)) cookie.expires = raw.expires;
  return cookie;
};

/**
 * Creates a validated AuthContext.
 *
 * @param {{ type?: string, cookies?: Array, sessionId?: string, cookiesFromBrowser?: string }} [input]
 * @returns {{ type: string, cookies?: Array, sessionId?: string, cookiesFromBrowser?: string }}
 */
const createAuthContext = (input = {}) => {
  for (const field of FORBIDDEN_FIELDS) {
    if (input && Object.prototype.hasOwnProperty.call(input, field)) {
      throw new TypeError(
        `AuthContext: field "${field}" is not allowed. Credentials are not kept in the resolver.`
      );
    }
  }

  const type = AUTH_TYPES.has(input.type) ? input.type : "none";
  const auth = { type };

  if (type === "cookies") {
    const cookies = Array.isArray(input.cookies)
      ? input.cookies.map(normalizeCookie).filter(Boolean)
      : [];
    if (cookies.length) auth.cookies = cookies;
    // Reference to a browser from which yt-dlp reads the cookies itself.
    // This is only a name ("chrome", "firefox" ...), not a secret.
    if (typeof input.cookiesFromBrowser === "string" && input.cookiesFromBrowser
      && input.cookiesFromBrowser !== "none") {
      auth.cookiesFromBrowser = input.cookiesFromBrowser;
    }
  }

  if (type === "session") {
    if (typeof input.sessionId !== "string" || !input.sessionId.trim()) {
      throw new TypeError('AuthContext: type "session" benötigt eine sessionId.');
    }
    auth.sessionId = input.sessionId.trim();
  }

  return auth;
};

/** The default: no login, no cookies. */
const NO_AUTH = Object.freeze({ type: "none" });

/**
 * @param {{type: string}} [auth]
 * @returns {boolean} true if any auth material is present at all.
 */
const hasAuth = (auth) => !!auth && auth.type !== "none";

/**
 * Log-safe representation: only kind and count, never values.
 * @param {Object} [auth]
 */
const describeAuth = (auth) => {
  if (!auth || auth.type === "none") return { type: "none" };
  const out = { type: auth.type };
  if (Array.isArray(auth.cookies)) out.cookieCount = auth.cookies.length;
  if (auth.cookiesFromBrowser) out.cookiesFromBrowser = auth.cookiesFromBrowser;
  if (auth.sessionId) out.hasSession = true;
  return out;
};

/**
 * Error with which a resolver signals: "works, but only with login".
 * @param {string} [message]
 * @param {{ resolver?: string, url?: string, needs?: string }} [options]
 */
const requireAuth = (message, options = {}) => new ResolveError(
  ResolveErrorCode.AUTH_REQUIRED,
  message || "Für diese Quelle wird eine Anmeldung benötigt.",
  { resolver: options.resolver, url: options.url, details: { needs: options.needs || "cookies" } }
);

/**
 * Error with which a resolver signals: "the session has expired".
 * @param {string} [message]
 * @param {{ resolver?: string, url?: string }} [options]
 */
const sessionExpired = (message, options = {}) => new ResolveError(
  ResolveErrorCode.SESSION_EXPIRED,
  message || "Die gespeicherte Session ist abgelaufen.",
  options
);

module.exports = {
  AUTH_TYPES,
  NO_AUTH,
  createAuthContext,
  normalizeCookie,
  hasAuth,
  describeAuth,
  requireAuth,
  sessionExpired
};

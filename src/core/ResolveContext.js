/**
 * ResolveContext: everything a resolver needs from the outside, in one place.
 *
 * Deliberately contains no business logic. Auth is its own field and
 * is not "baked into" the resolver. HTTP access and the Playwright
 * stream finder come in as injected services (this makes them testable and
 * keeps Electron dependencies out of the resolvers).
 */

const { NO_AUTH, describeAuth, createAuthContext } = require("../auth/AuthContext");
const { nullLogger } = require("./logger");
const { ResolveError, ResolveErrorCode } = require("./errors");

/** Normalize header names to lowercase, values to strings. */
const normalizeHeaders = (headers) => {
  if (!headers || typeof headers !== "object") return {};
  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    if (typeof name !== "string" || !name.trim()) continue;
    if (value === undefined || value === null) continue;
    out[name.trim().toLowerCase()] = String(value);
  }
  return out;
};

/**
 * @param {Object} [input]
 * @param {Object} [input.auth]        AuthContext (default: {type:"none"})
 * @param {Object} [input.headers]     Additional HTTP headers
 * @param {Array}  [input.cookies]     Cookies for unauthenticated extra info
 * @param {string} [input.userAgent]
 * @param {AbortSignal} [input.signal]
 * @param {Object} [input.flags]       Feature switches (playwrightFallback ...)
 * @param {Object} [input.services]    { http, findStream, sessionStore, ... }
 * @param {Object} [input.logger]
 * @param {Object} [input.cache]
 */
const createResolveContext = (input = {}) => {
  const auth = input.auth ? createAuthContext(input.auth) : NO_AUTH;
  const headers = normalizeHeaders(input.headers);
  if (typeof input.userAgent === "string" && input.userAgent.trim() && !headers["user-agent"]) {
    headers["user-agent"] = input.userAgent.trim();
  }

  const context = {
    auth,
    headers,
    cookies: Array.isArray(input.cookies) ? input.cookies : undefined,
    userAgent: headers["user-agent"],
    signal: input.signal,
    flags: { ...(input.flags || {}) },
    services: { ...(input.services || {}) },
    logger: input.logger || nullLogger(),
    cache: input.cache || null
  };

  /** true if the operation was cancelled. */
  context.isAborted = () => !!(context.signal && context.signal.aborted);

  /** Throws a CANCELLED error as soon as the operation was cancelled. */
  context.throwIfAborted = () => {
    if (context.isAborted()) {
      throw new ResolveError(ResolveErrorCode.CANCELLED, "Vorgang abgebrochen.");
    }
  };

  /**
   * HTTP access for resolvers. Uses the injected client (tests) or the
   * global fetch. Headers and user agent from the context are added.
   * @param {string} url
   * @param {RequestInit} [options]
   */
  context.fetch = (url, options = {}) => {
    const client = typeof context.services.http === "function" ? context.services.http : globalThis.fetch;
    if (typeof client !== "function") {
      throw new ResolveError(ResolveErrorCode.NETWORK_ERROR, "Kein HTTP-Client verfügbar.");
    }
    return client(url, {
      ...options,
      signal: options.signal || context.signal,
      headers: { ...context.headers, ...normalizeHeaders(options.headers) }
    });
  };

  /** Copy with changed fields (e.g. a different logger per resolver). */
  context.with = (overrides = {}) => createResolveContext({
    auth: overrides.auth || context.auth,
    headers: overrides.headers || context.headers,
    cookies: overrides.cookies || context.cookies,
    userAgent: overrides.userAgent || context.userAgent,
    signal: overrides.signal || context.signal,
    flags: { ...context.flags, ...(overrides.flags || {}) },
    services: { ...context.services, ...(overrides.services || {}) },
    logger: overrides.logger || context.logger,
    cache: overrides.cache !== undefined ? overrides.cache : context.cache
  });

  return context;
};

/**
 * Log-safe summary of a context: no cookie values, no
 * header values, only names and counts.
 * @param {Object} context
 */
const describeContext = (context) => {
  if (!context) return { auth: { type: "none" } };
  return {
    auth: describeAuth(context.auth),
    headerNames: Object.keys(context.headers || {}).sort(),
    hasUserAgent: !!(context.headers && context.headers["user-agent"]),
    flags: { ...(context.flags || {}) },
    aborted: typeof context.isAborted === "function" ? context.isAborted() : false
  };
};

module.exports = {
  createResolveContext,
  describeContext,
  normalizeHeaders
};

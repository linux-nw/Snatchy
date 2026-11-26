/**
 * ResolverCache: short-lived in-memory cache for resolution.
 *
 * Cacheable: detected site/provider resolver (practically static),
 * metadata and short-lived resolution results (signed media URLs expire
 * quickly, so the TTL is deliberately small).
 *
 * Not cacheable: anything auth-related. set() rejects values that contain
 * cookies/tokens/sessions, and results from authenticated
 * contexts are not even offered by the ResolverManager.
 */

const SENSITIVE_KEY = /^(cookies?|token|access_?token|refresh_?token|password|passwd|secret|authorization|session_?id|api_?key|credential)s?$/i;

const DEFAULTS = {
  ttlMs: 5 * 60 * 1000,      // 5 minutes for results
  detectionTtlMs: 60 * 60 * 1000, // 1 hour for "which resolver fits"
  maxEntries: 200
};

/** Throws if auth material is hidden anywhere in the value. */
const assertCacheable = (value, path = "value", depth = 0) => {
  if (depth > 6 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertCacheable(v, `${path}[${i}]`, depth + 1));
    return;
  }
  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) {
      throw new TypeError(`ResolverCache: "${path}.${key}" contains auth material and is not cached.`);
    }
    assertCacheable(val, `${path}.${key}`, depth + 1);
  }
};

class ResolverCache {
  /**
   * @param {{ ttlMs?: number, detectionTtlMs?: number, maxEntries?: number, now?: () => number }} [options]
   */
  constructor(options = {}) {
    this.ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : DEFAULTS.ttlMs;
    this.detectionTtlMs = Number.isFinite(options.detectionTtlMs) ? options.detectionTtlMs : DEFAULTS.detectionTtlMs;
    this.maxEntries = Number.isFinite(options.maxEntries) ? options.maxEntries : DEFAULTS.maxEntries;
    this._now = typeof options.now === "function" ? options.now : () => Date.now();
    /** @type {Map<string, {expiresAt: number, value: any}>} */
    this._entries = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Key from kind and URL. The fragment part is dropped, the rest stays
   * unchanged (the cache only lives in memory, nothing is written).
   * @param {string} kind  e.g. "site", "provider", "meta"
   * @param {string} url
   */
  static keyFor(kind, url) {
    return `${kind}:${String(url || "").split("#")[0]}`;
  }

  /**
   * @param {string} key
   * @returns {any|undefined}
   */
  get(key) {
    const entry = this._entries.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (entry.expiresAt <= this._now()) {
      this._entries.delete(key);
      this.misses++;
      return undefined;
    }
    this.hits++;
    // Return a copy so callers cannot modify the cache content.
    return typeof entry.value === "object" && entry.value !== null
      ? structuredClone(entry.value)
      : entry.value;
  }

  /**
   * @param {string} key
   * @param {any} value
   * @param {{ ttlMs?: number }} [options]
   */
  set(key, value, options = {}) {
    assertCacheable(value);
    if (this._entries.size >= this.maxEntries && !this._entries.has(key)) {
      const oldest = this._entries.keys().next();
      if (!oldest.done) this._entries.delete(oldest.value);
    }
    const ttl = Number.isFinite(options.ttlMs) ? options.ttlMs : this.ttlMs;
    if (ttl <= 0) return value;
    this._entries.set(key, {
      expiresAt: this._now() + ttl,
      value: typeof value === "object" && value !== null ? structuredClone(value) : value
    });
    return value;
  }

  /** Remembers which resolver was responsible for a URL (long TTL). */
  rememberDetection(kind, url, resolverName) {
    return this.set(ResolverCache.keyFor(`detect-${kind}`, url), resolverName, { ttlMs: this.detectionTtlMs });
  }

  /** @returns {string|undefined} */
  recallDetection(kind, url) {
    return this.get(ResolverCache.keyFor(`detect-${kind}`, url));
  }

  delete(key) {
    return this._entries.delete(key);
  }

  clear() {
    this._entries.clear();
    this.hits = 0;
    this.misses = 0;
  }

  stats() {
    return { size: this._entries.size, hits: this.hits, misses: this.misses };
  }
}

module.exports = { ResolverCache, assertCacheable, CACHE_DEFAULTS: DEFAULTS };

/**
 * SessionStore: short-lived session references, in memory only.
 *
 * Deliberate restrictions:
 * - no persistence to disk (nothing survives an app restart),
 * - TTL for every entry, after which it is discarded,
 * - no passwords, only already existing session material,
 * - toJSON/inspect never reveal values.
 *
 * A resolver only gets the sessionId in the ResolveContext and asks
 * here with it. This keeps the material in exactly one place instead of in every
 * resolver.
 */

const crypto = require("node:crypto");

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

class SessionStore {
  /**
   * @param {{ ttlMs?: number, maxEntries?: number, now?: () => number }} [options]
   */
  constructor(options = {}) {
    this.ttlMs = Number.isFinite(options.ttlMs) && options.ttlMs > 0 ? options.ttlMs : DEFAULT_TTL_MS;
    this.maxEntries = Number.isFinite(options.maxEntries) && options.maxEntries > 0 ? options.maxEntries : 20;
    this._now = typeof options.now === "function" ? options.now : () => Date.now();
    /** @type {Map<string, {expiresAt: number, data: Object}>} */
    this._entries = new Map();
  }

  /**
   * Creates a session and returns its id.
   * @param {{ cookies?: Array, headers?: Object, userAgent?: string, origin?: string }} data
   * @param {{ ttlMs?: number }} [options]
   * @returns {string} sessionId
   */
  create(data = {}, options = {}) {
    const id = crypto.randomUUID();
    this.set(id, data, options);
    return id;
  }

  /**
   * @param {string} sessionId
   * @param {Object} data
   * @param {{ ttlMs?: number }} [options]
   */
  set(sessionId, data = {}, options = {}) {
    if (typeof sessionId !== "string" || !sessionId) {
      throw new TypeError("SessionStore.set: sessionId missing.");
    }
    this._evictExpired();
    if (this._entries.size >= this.maxEntries && !this._entries.has(sessionId)) {
      // Evict the oldest entry (Map keeps insertion order).
      const oldest = this._entries.keys().next();
      if (!oldest.done) this._entries.delete(oldest.value);
    }
    const ttl = Number.isFinite(options.ttlMs) && options.ttlMs > 0 ? options.ttlMs : this.ttlMs;
    this._entries.set(sessionId, { expiresAt: this._now() + ttl, data: { ...data } });
    return sessionId;
  }

  /**
   * @param {string} sessionId
   * @returns {Object|null} Session data or null (unknown/expired).
   */
  get(sessionId) {
    const entry = this._entries.get(sessionId);
    if (!entry) return null;
    if (entry.expiresAt <= this._now()) {
      this._entries.delete(sessionId);
      return null;
    }
    return entry.data;
  }

  /** @param {string} sessionId */
  has(sessionId) {
    return this.get(sessionId) !== null;
  }

  /** @param {string} sessionId */
  delete(sessionId) {
    return this._entries.delete(sessionId);
  }

  /** Discard everything, e.g. when the app quits. */
  clear() {
    this._entries.clear();
  }

  /** Number of valid sessions (also removes expired ones). */
  size() {
    this._evictExpired();
    return this._entries.size;
  }

  _evictExpired() {
    const now = this._now();
    for (const [id, entry] of this._entries) {
      if (entry.expiresAt <= now) this._entries.delete(id);
    }
  }

  /** Never serialize contents. */
  toJSON() {
    return { sessions: this._entries.size, persisted: false };
  }
}

module.exports = { SessionStore, DEFAULT_TTL_MS };

/**
 * ResolverManager: wires up the pipeline
 *
 *   Input URL -> SiteResolver -> Provider-URL(s) -> ProviderResolver
 *             -> ResolvedMedia[] -> Downloader
 *
 * Responsibilities according to the architecture:
 * - find the matching site/provider resolver automatically (via the registry),
 * - try resolvers by priority,
 * - isolate errors of individual resolvers (FallbackManager),
 * - support several candidates per site,
 * - normalize results to ResolvedMedia,
 * - cache intermediate results as long as no auth is involved.
 */

const { ResolverRegistry } = require("./registry");
const { FallbackManager } = require("./FallbackManager");
const { STEP, nullLogger } = require("./logger");
const { normalizeMedia, isHttpUrl, downloadUrlOf } = require("./types");
const {
  ResolveError,
  ResolveErrorCode,
  toResolveError,
  pickMostRelevantError
} = require("./errors");
const { hasAuth } = require("../auth/AuthContext");
const { ResolverCache } = require("../cache/ResolverCache");

/**
 * Merges the reference from the SiteResolver with the provider result.
 * Title, thumbnail and metadata of the page are kept, the
 * provider result wins on conflicts. The source always stays the
 * original page, not the host URL.
 *
 * @param {Object} base     Reference from the SiteResolver (may be empty)
 * @param {Object} resolved Result of the ProviderResolver
 * @param {string} url      resolved provider URL
 */
const mergeWithBase = (base, resolved, url) => normalizeMedia(
  {
    ...base,
    ...resolved,
    sourceUrl: base.sourceUrl || resolved.sourceUrl || url,
    meta: (base.meta || resolved.meta) ? { ...base.meta, ...resolved.meta } : undefined
  },
  { sourceUrl: url }
);

class ResolverManager {
  /**
   * @param {Object} [options]
   * @param {ResolverRegistry} [options.sites]
   * @param {ResolverRegistry} [options.providers]
   * @param {ResolverCache|null} [options.cache]
   * @param {Object} [options.logger]
   */
  constructor(options = {}) {
    this.sites = options.sites || new ResolverRegistry({ kind: "SiteResolver" });
    this.providers = options.providers || new ResolverRegistry({ kind: "ProviderResolver" });
    this.cache = options.cache === undefined ? null : options.cache;
    this.logger = options.logger || nullLogger();
  }

  /** Shorthand for registration when the app is set up. */
  registerSite(resolver, options) {
    this.sites.register(resolver, options);
    return this;
  }

  registerProvider(resolver, options) {
    this.providers.register(resolver, options);
    return this;
  }

  /** Diagnostics: what is registered, in which order it is tested. */
  describe() {
    return { sites: this.sites.describe(), providers: this.providers.describe() };
  }

  _loggerFor(context) {
    return (context && context.logger) || this.logger;
  }

  /** Only use the cache when no auth material is involved. */
  _cacheFor(context) {
    if (!this.cache) return null;
    if (context && hasAuth(context.auth)) return null;
    return this.cache;
  }

  /**
   * Step 1: detect the page and extract provider references.
   *
   * @param {string} url
   * @param {Object} context ResolveContext
   * @returns {Promise<import("./types").ResolvedMedia[]>}
   */
  async resolveSite(url, context = {}, options = {}) {
    const logger = this._loggerFor(context);
    this._assertUsableUrl(url);

    const candidates = this._pickResolvers(this.sites, url, context, options);
    if (candidates.length === 0) {
      throw new ResolveError(
        ResolveErrorCode.UNSUPPORTED_URL,
        "Kein SiteResolver für diese URL registriert.",
        { url }
      );
    }

    const fallback = new FallbackManager({ logger });
    const result = await fallback.run(candidates.map((resolver) => ({
      name: resolver.name,
      run: async () => {
        if (context.throwIfAborted) context.throwIfAborted();
        const raw = await resolver.resolve(url, context);
        const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
        const media = list.map((item) => normalizeMedia(item, {
          sourceUrl: url,
          resolver: resolver.name
        }));
        return media.length ? media : null;
      }
    })));

    if (!result.ok) {
      throw result.error || new ResolveError(
        ResolveErrorCode.EXTRACTION_FAILED,
        "Kein SiteResolver konnte die Seite auswerten.",
        { url }
      );
    }

    logger.step(STEP.SITE_DETECTED, {
      site: result.stage,
      url,
      count: result.value.length
    });

    const cache = this._cacheFor(context);
    if (cache) cache.rememberDetection("site", url, result.stage);

    return result.value;
  }

  /**
   * Step 2: resolve a single provider/host URL to a media URL.
   *
   * @param {string} url
   * @param {Object} context
   * @param {{ base?: Object }} [options] base = reference from the SiteResolver
   * @returns {Promise<import("./types").ResolvedMedia>}
   */
  async resolveProvider(url, context = {}, options = {}) {
    const logger = this._loggerFor(context);
    this._assertUsableUrl(url);
    const base = options.base || {};

    const cache = this._cacheFor(context);
    const cacheKey = ResolverCache.keyFor("provider", url);
    if (cache) {
      const cached = cache.get(cacheKey);
      if (cached) {
        logger.step(STEP.CACHE_HIT, { url, provider: cached.provider || null });
        return mergeWithBase(base, cached, url);
      }
    }

    const candidates = this._pickResolvers(this.providers, url, context, options);
    if (candidates.length === 0) {
      throw new ResolveError(
        ResolveErrorCode.UNSUPPORTED_URL,
        "Kein ProviderResolver für diese URL registriert.",
        { url }
      );
    }

    const fallback = new FallbackManager({ logger });
    const result = await fallback.run(candidates.map((resolver) => ({
      name: resolver.name,
      run: async () => {
        if (context.throwIfAborted) context.throwIfAborted();
        const raw = await resolver.resolve(url, context);
        if (!raw) return null;
        return normalizeMedia(raw, {
          sourceUrl: base.sourceUrl || url,
          resolver: resolver.name
        });
      }
    })));

    if (!result.ok) {
      throw result.error || new ResolveError(
        ResolveErrorCode.EXTRACTION_FAILED,
        "Kein ProviderResolver konnte die URL auflösen.",
        { url }
      );
    }

    const media = mergeWithBase(base, result.value, url);

    logger.step(STEP.PROVIDER_DETECTED, {
      resolver: result.stage,
      provider: media.provider || null,
      url: media.mediaUrl || url
    });

    if (cache && !media.requiresAuth) cache.set(cacheKey, media);
    return media;
  }

  /**
   * Complete pipeline: URL -> site -> provider -> normalized results.
   *
   * Individual candidates may fail without dragging down the rest. Only when
   * no single candidate can be resolved does the method throw the
   * most meaningful error.
   *
   * @param {string} url
   * @param {Object} context
   * @returns {Promise<import("./types").ResolvedMedia[]>}
   */
  async resolve(url, context = {}, options = {}) {
    const logger = this._loggerFor(context);
    logger.step(STEP.INPUT, { url });

    const references = await this.resolveSite(url, context, { only: options.sites });

    const resolved = [];
    const errors = [];
    for (const reference of references) {
      if (context.throwIfAborted) context.throwIfAborted();
      // If the SiteResolver already delivered a direct media URL, no
      // provider step is needed (e.g. embedded direct file).
      if (reference.mediaUrl) {
        resolved.push(reference);
        continue;
      }
      const target = reference.providerUrl || reference.sourceUrl;
      try {
        resolved.push(await this.resolveProvider(target, context, {
          base: reference,
          only: options.providers
        }));
      } catch (err) {
        const error = toResolveError(err, { url: target });
        errors.push(error);
        logger.step(STEP.RESOLVER_FAIL, {
          url: target,
          code: error.code,
          message: error.message
        });
        if (error.code === ResolveErrorCode.CANCELLED) throw error;
      }
    }

    if (resolved.length === 0) {
      throw pickMostRelevantError(errors) || new ResolveError(
        ResolveErrorCode.EXTRACTION_FAILED,
        "Es konnte kein Medium aufgelöst werden.",
        { url }
      );
    }

    logger.step(STEP.RESULT, {
      url,
      count: resolved.length,
      provider: resolved[0].provider || null,
      message: errors.length ? `${errors.length} Kandidat(en) fehlgeschlagen` : undefined
    });

    return resolved;
  }

  /**
   * Convenience for the download: exactly one result (the first).
   * @param {string} url
   * @param {Object} context
   * @returns {Promise<import("./types").ResolvedMedia>}
   */
  async resolveOne(url, context = {}, options = {}) {
    const list = await this.resolve(url, context, options);
    return list[0];
  }

  _assertUsableUrl(url) {
    if (typeof url !== "string" || !url.trim()) {
      throw new ResolveError(ResolveErrorCode.UNSUPPORTED_URL, "Es wurde keine URL übergeben.");
    }
    if (!isHttpUrl(url)) {
      throw new ResolveError(
        ResolveErrorCode.UNSUPPORTED_URL,
        `Keine gültige http(s)-URL: ${url}`,
        { url }
      );
    }
  }

  /**
   * Get candidates from a registry, sorted by priority.
   *
   * options.only restricts to specific resolvers. The app needs this
   * when a specific flow is meant (read podcast feed, trigger the
   * browser extraction explicitly) and falling back to the generic
   * resolver would give a wrong result.
   *
   * @param {Object} registry
   * @param {string} url
   * @param {Object} context
   * @param {{ only?: string[] }} [options]
   */
  _pickResolvers(registry, url, context, options = {}) {
    const logger = this._loggerFor(context);
    const matches = registry.match(url, { logger });
    const only = Array.isArray(options.only) ? options.only : null;
    if (!only || only.length === 0) return matches;

    const selected = only
      .map((name) => matches.find((r) => r.name === name) || registry.get(name))
      .filter(Boolean);
    return selected;
  }
}

module.exports = { ResolverManager, downloadUrlOf };

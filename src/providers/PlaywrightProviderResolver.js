/**
 * ProviderResolver for JS-rendered pages: a headless browser loads the
 * page and the stream URL that is actually requested is captured.
 *
 * This is the most expensive method (browser start, wait times), therefore:
 * - lowest priority,
 * - only active if the user enables the fallback in the settings
 *   (context.flags.playwrightFallback),
 * - in the download cascade only as the last stage.
 */

const { ProviderResolver } = require("./ProviderResolver");
const { isHttpUrl } = require("../core/types");
const { ResolveError, ResolveErrorCode } = require("../core/errors");
const { findStreamWithPlaywright } = require("./playwrightStreamFinder");

/** Map Playwright setup errors to structured codes. */
const mapPlaywrightError = (err, url, name) => {
  const code = err && err.code;
  if (code === "PLAYWRIGHT_MISSING" || code === "PLAYWRIGHT_CHROMIUM_MISSING") {
    return new ResolveError(ResolveErrorCode.DEPENDENCY_MISSING, err.message, {
      resolver: name, url, cause: err, details: { setup: code }
    });
  }
  return new ResolveError(
    ResolveErrorCode.EXTRACTION_FAILED,
    err && err.message ? err.message : "Browser-Extraktion fehlgeschlagen.",
    { resolver: name, url, cause: err }
  );
};

class PlaywrightProviderResolver extends ProviderResolver {
  /**
   * @param {{ findStream?: (url: string, log: Function) => Promise<string|null> }} [options]
   */
  constructor(options = {}) {
    super({ name: "playwright-sniffer", priority: 5 });
    this._findStream = typeof options.findStream === "function"
      ? options.findStream
      : findStreamWithPlaywright;
  }

  canHandle(url) {
    return isHttpUrl(url);
  }

  /**
   * @param {string} url
   * @param {Object} context ResolveContext
   * @returns {Promise<Object>} ResolvedMedia
   */
  async resolve(url, context = {}) {
    const flags = context.flags || {};
    if (!flags.playwrightFallback) {
      throw new ResolveError(
        ResolveErrorCode.UNSUPPORTED_URL,
        "Playwright-Fallback ist nicht aktiviert.",
        { resolver: this.name, url }
      );
    }
    if (context.throwIfAborted) context.throwIfAborted();

    // An injected finder (tests, alternative browser session) takes precedence.
    const findStream = typeof (context.services || {}).findStream === "function"
      ? context.services.findStream
      : this._findStream;
    const log = (message) => {
      if (context.logger) context.logger.step("resolver-try", { resolver: this.name, message });
    };

    let streamUrl;
    try {
      streamUrl = await findStream(url, log);
    } catch (err) {
      throw mapPlaywrightError(err, url, this.name);
    }

    if (!streamUrl) {
      throw new ResolveError(
        ResolveErrorCode.EXTRACTION_FAILED,
        "Kein Stream gefunden",
        { resolver: this.name, url, details: { reason: "PLAYWRIGHT_NO_STREAM" } }
      );
    }

    return {
      sourceUrl: url,
      mediaUrl: streamUrl,
      provider: "playwright",
      meta: { method: "network-sniffing" }
    };
  }
}

module.exports = { PlaywrightProviderResolver, mapPlaywrightError };

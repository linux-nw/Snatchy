/**
 * Base for SiteResolver.
 *
 * A SiteResolver recognizes an overview or video page and extracts
 * the actual video/provider links from it. It downloads nothing and
 * does not resolve a media URL either, but returns normalized references:
 *
 *   { sourceUrl, providerUrl, title?, thumbnail?, duration?, meta? }
 *
 * Several hits on one page are explicitly allowed (several hosts
 * for the same episode, episode lists ...). The rest is handled by the
 * ProviderResolver.
 *
 * A new SiteResolver only needs name, priority, canHandle and resolve,
 * see ARCHITECTURE.md.
 */

const { isHttpUrl } = require("../core/types");

class SiteResolver {
  /**
   * @param {{ name: string, priority?: number }} options
   */
  constructor(options = {}) {
    if (!options.name) throw new TypeError("SiteResolver: name missing.");
    this.name = options.name;
    this.priority = Number.isFinite(options.priority) ? options.priority : 50;
  }

  /**
   * @param {string} url
   * @returns {boolean}
   */
  canHandle(url) {
    return isHttpUrl(url);
  }

  /**
   * @param {string} _url
   * @param {Object} _context ResolveContext
   * @returns {Promise<Array>} Media-Referenzen
   */
  async resolve(_url, _context) {
    throw new Error(`SiteResolver "${this.name}": resolve() is not implemented.`);
  }
}

module.exports = { SiteResolver };

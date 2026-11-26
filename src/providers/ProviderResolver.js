/**
 * Base for ProviderResolver.
 *
 * A ProviderResolver gets a host/streaming URL (usually found by the
 * SiteResolver) and returns exactly one normalized result:
 *
 *   { sourceUrl, mediaUrl, title?, formats?, provider, requiresAuth? }
 *
 * Rules:
 * - do not store credentials in the resolver, auth comes from the context,
 * - missing permission is reported as AUTH_REQUIRED/SESSION_EXPIRED,
 *   not as a general error,
 * - no circumvention of access protection and no DRM decryption.
 */

const { isHttpUrl } = require("../core/types");

class ProviderResolver {
  /**
   * @param {{ name: string, priority?: number }} options
   */
  constructor(options = {}) {
    if (!options.name) throw new TypeError("ProviderResolver: name missing.");
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
   * @returns {Promise<Object>} ResolvedMedia
   */
  async resolve(_url, _context) {
    throw new Error(`ProviderResolver "${this.name}": resolve() is not implemented.`);
  }
}

module.exports = { ProviderResolver };

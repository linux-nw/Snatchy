/**
 * Generic SiteResolver: the URL already is the video page.
 *
 * This is the behavior of the app before the switch: an entered URL
 * went straight to yt-dlp. This keeps YouTube & co. exactly as fast as
 * before (no additional network access) and the new pipeline still has
 * a defined entry point for every URL.
 *
 * Priority deliberately at the very bottom: every specialized SiteResolver
 * goes first, this one catches the rest.
 */

const { SiteResolver } = require("./SiteResolver");
const { isHttpUrl } = require("../core/types");

class GenericPageSiteResolver extends SiteResolver {
  constructor() {
    super({ name: "generic-page", priority: 1 });
  }

  canHandle(url) {
    return isHttpUrl(url);
  }

  /**
   * @param {string} url
   * @returns {Promise<Array>} exactly one reference: the URL itself
   */
  async resolve(url) {
    return [{ sourceUrl: url, providerUrl: url }];
  }
}

module.exports = { GenericPageSiteResolver };

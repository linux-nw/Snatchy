/**
 * ProviderResolver that hands the resolution over to yt-dlp.
 *
 * yt-dlp ships with over 1000 extractors - for the vast majority of sites
 * "give the URL to yt-dlp" is the right answer. This resolver turns it into
 * a regular ResolvedMedia without starting a metadata fetch beforehand:
 * that was already the behavior of the app before, and every additional call
 * would make every download take seconds longer.
 *
 * It is therefore the catch-all resolver with low priority. Whoever can do
 * something better for a site registers a resolver with higher priority.
 */

const { ProviderResolver } = require("./ProviderResolver");
const { isHttpUrl } = require("../core/types");

class YtDlpProviderResolver extends ProviderResolver {
  constructor() {
    super({ name: "yt-dlp", priority: 10 });
  }

  canHandle(url) {
    return isHttpUrl(url);
  }

  /**
   * @param {string} url
   * @param {Object} [context]
   * @returns {Promise<Object>} ResolvedMedia
   */
  async resolve(url, context = {}) {
    const auth = context.auth || { type: "none" };
    return {
      sourceUrl: url,
      mediaUrl: url,
      provider: "yt-dlp",
      // The actual format choice is made by yt-dlp at download time based on the
      // user settings (quality, mp3/mp4), not by this resolver.
      meta: {
        handoff: "yt-dlp",
        // Only the kind of auth, never its content.
        authType: auth.type
      }
    };
  }
}

module.exports = { YtDlpProviderResolver };

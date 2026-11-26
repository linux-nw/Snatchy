/**
 * ProviderResolver for directly linked media files and manifests.
 *
 * Responsible for everything that already is a media URL: podcast enclosures
 * (mp3/m4a), direct mp4 links, HLS playlists (m3u8) and DASH manifests (mpd).
 * There is nothing to extract here, the URL is only normalized and given a
 * format.
 *
 * Note: encrypted (DRM-protected) streams are not handled.
 * Nothing is decrypted and no access protection is circumvented; such
 * sources deliberately fail further down in the downloader.
 */

const { ProviderResolver } = require("./ProviderResolver");
const { parseUrl, isHttpUrl } = require("../core/types");

const AUDIO_EXT = ["mp3", "m4a", "aac", "opus", "ogg", "oga", "flac", "wav"];
const VIDEO_EXT = ["mp4", "m4v", "webm", "mov", "mkv", "ts"];
const MANIFEST_EXT = ["m3u8", "mpd"];
const ALL_EXT = [...AUDIO_EXT, ...VIDEO_EXT, ...MANIFEST_EXT];

/** Extension from the path (without query), lowercase, or "". */
const extensionOf = (url) => {
  const parsed = parseUrl(url);
  if (!parsed) return "";
  const match = parsed.pathname.match(/\.([a-z0-9]{2,5})$/i);
  return match ? match[1].toLowerCase() : "";
};

class DirectMediaProviderResolver extends ProviderResolver {
  constructor() {
    // High priority: if the URL already is a media file, no
    // other resolver needs to guess any more.
    super({ name: "direct-media", priority: 80 });
  }

  canHandle(url) {
    return isHttpUrl(url) && ALL_EXT.includes(extensionOf(url));
  }

  /**
   * @param {string} url
   * @returns {Promise<Object>} ResolvedMedia
   */
  async resolve(url) {
    const ext = extensionOf(url);
    return {
      sourceUrl: url,
      mediaUrl: url,
      provider: "direct",
      formats: [{
        url,
        ext,
        note: MANIFEST_EXT.includes(ext)
          ? "Manifest (adaptive Streams)"
          : (AUDIO_EXT.includes(ext) ? "Direkte Audiodatei" : "Direkte Videodatei")
      }]
    };
  }
}

module.exports = {
  DirectMediaProviderResolver,
  extensionOf,
  AUDIO_EXT,
  VIDEO_EXT,
  MANIFEST_EXT
};

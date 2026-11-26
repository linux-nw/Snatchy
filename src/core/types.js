/**
 * Shared type definitions of the resolver architecture.
 *
 * The project is deliberately plain CommonJS without a build step, so the "interfaces"
 * are JSDoc typedefs plus the normalization functions in this file.
 *
 * @typedef {Object} MediaFormat
 * @property {string} [formatId]   Identifier of the format at the provider
 * @property {string} [url]        Direct media URL of this format
 * @property {string} [ext]        Container/extension (mp4, m4a, m3u8 ...)
 * @property {number} [height]     Video height in pixels
 * @property {number} [tbr]        Total bitrate in kbit/s
 * @property {string} [vcodec]
 * @property {string} [acodec]
 * @property {string} [note]
 *
 * @typedef {Object} ResolvedMedia
 * @property {string}  sourceUrl        Original page/URL the reference comes from
 * @property {string}  [providerUrl]    Host/provider URL found by a SiteResolver.
 *                                      Intermediate step: not a download yet, only a reference.
 * @property {string}  [mediaUrl]       Downloadable URL resolved by the ProviderResolver
 * @property {string}  [title]
 * @property {string}  [thumbnail]
 * @property {number}  [duration]       Seconds
 * @property {MediaFormat[]} [formats]
 * @property {string}  [provider]       Name of the provider ("yt-dlp", "direct", "podcast-rss" ...)
 * @property {boolean} [requiresAuth]   Provider signals: not playable without auth
 * @property {string}  [resolver]       Name of the resolver that delivered the result
 * @property {Object}  [meta]           Free, non-sensitive extra data (e.g. pubDate)
 *
 * @typedef {Object} Cookie
 * @property {string} name
 * @property {string} value
 * @property {string} [domain]
 * @property {string} [path]
 * @property {number} [expires]
 *
 * @typedef {Object} AuthContext
 * @property {"none"|"cookies"|"session"} type
 * @property {Cookie[]} [cookies]
 * @property {string}   [sessionId]
 * @property {string}   [cookiesFromBrowser] Reference to a browser from which cookies
 *                                           are read only at runtime (not a secret).
 *
 * @typedef {Object} ResolveContext
 * @property {AuthContext} [auth]
 * @property {Record<string,string>} [headers]
 * @property {Cookie[]} [cookies]
 * @property {string} [userAgent]
 * @property {AbortSignal} [signal]
 * @property {Object} [flags]     Feature switches (e.g. playwrightFallback)
 * @property {Object} [services]  Injected dependencies (http, findStream ...)
 * @property {Object} [logger]
 * @property {Object} [cache]
 *
 * @typedef {Object} SiteResolver
 * @property {string} name
 * @property {number} [priority]
 * @property {(url: string) => boolean} canHandle
 * @property {(url: string, context: ResolveContext) => Promise<ResolvedMedia[]>} resolve
 *
 * @typedef {Object} ProviderResolver
 * @property {string} name
 * @property {number} [priority]
 * @property {(url: string) => boolean} canHandle
 * @property {(url: string, context: ResolveContext) => Promise<ResolvedMedia>} resolve
 */

/** Allowed protocols for resolver inputs. */
const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Tolerant URL parsing: returns the URL object or null (instead of throwing).
 * @param {string} url
 * @returns {URL|null}
 */
const parseUrl = (url) => {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    return new URL(url.trim());
  } catch {
    return null;
  }
};

/**
 * @param {string} url
 * @returns {boolean} true if it is an absolute http(s) URL.
 */
const isHttpUrl = (url) => {
  const parsed = parseUrl(url);
  return !!parsed && SUPPORTED_PROTOCOLS.has(parsed.protocol);
};

/**
 * Hostname in lowercase without a leading "www.", or "" for an invalid URL.
 * @param {string} url
 */
const hostOf = (url) => {
  const parsed = parseUrl(url);
  return parsed ? parsed.hostname.toLowerCase().replace(/^www\./, "") : "";
};

/**
 * Checks whether the host equals a domain or is a subdomain of it.
 * @param {string} url
 * @param {string[]} domains
 */
const hostMatches = (url, domains) => {
  const host = hostOf(url);
  if (!host) return false;
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
};

const toFiniteNumber = (value) => {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  return Number.isFinite(n) ? n : undefined;
};

const toCleanString = (value) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

/**
 * Normalizes a single format to the MediaFormat structure.
 * @param {any} raw
 * @returns {MediaFormat|null}
 */
const normalizeFormat = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  /** @type {MediaFormat} */
  const format = {};
  const formatId = toCleanString(raw.formatId !== undefined ? raw.formatId : raw.format_id);
  if (formatId) format.formatId = formatId;
  const url = toCleanString(raw.url);
  if (url) format.url = url;
  const ext = toCleanString(raw.ext);
  if (ext) format.ext = ext;
  const height = toFiniteNumber(raw.height);
  if (height !== undefined) format.height = height;
  const tbr = toFiniteNumber(raw.tbr);
  if (tbr !== undefined) format.tbr = tbr;
  const vcodec = toCleanString(raw.vcodec);
  if (vcodec) format.vcodec = vcodec;
  const acodec = toCleanString(raw.acodec);
  if (acodec) format.acodec = acodec;
  const note = toCleanString(raw.note !== undefined ? raw.note : raw.format_note);
  if (note) format.note = note;
  return Object.keys(format).length ? format : null;
};

/**
 * Brings any resolver result into the uniform ResolvedMedia form.
 * Unknown fields are dropped so the downloader layer really only works
 * with the normalized result and knows nothing about provider internals.
 *
 * @param {any} raw
 * @param {{ sourceUrl?: string, resolver?: string, provider?: string }} [defaults]
 * @returns {ResolvedMedia}
 */
const normalizeMedia = (raw, defaults = {}) => {
  if (!raw || typeof raw !== "object") {
    throw new TypeError("normalizeMedia: object expected.");
  }
  const sourceUrl = toCleanString(raw.sourceUrl) || toCleanString(defaults.sourceUrl);
  if (!sourceUrl) {
    throw new TypeError("normalizeMedia: sourceUrl missing.");
  }

  /** @type {ResolvedMedia} */
  const media = { sourceUrl };

  const providerUrl = toCleanString(raw.providerUrl);
  if (providerUrl) media.providerUrl = providerUrl;
  const mediaUrl = toCleanString(raw.mediaUrl);
  if (mediaUrl) media.mediaUrl = mediaUrl;
  const title = toCleanString(raw.title);
  if (title) media.title = title;
  const thumbnail = toCleanString(raw.thumbnail);
  if (thumbnail) media.thumbnail = thumbnail;
  const duration = toFiniteNumber(raw.duration);
  if (duration !== undefined) media.duration = duration;

  if (Array.isArray(raw.formats)) {
    const formats = raw.formats.map(normalizeFormat).filter(Boolean);
    if (formats.length) media.formats = formats;
  }

  const provider = toCleanString(raw.provider) || toCleanString(defaults.provider);
  if (provider) media.provider = provider;
  const resolver = toCleanString(raw.resolver) || toCleanString(defaults.resolver);
  if (resolver) media.resolver = resolver;
  if (raw.requiresAuth !== undefined) media.requiresAuth = !!raw.requiresAuth;
  if (raw.meta && typeof raw.meta === "object") media.meta = { ...raw.meta };

  return media;
};

/**
 * The URL the downloader layer works with: resolved media URL,
 * otherwise the provider reference, otherwise the source.
 * @param {ResolvedMedia} media
 * @returns {string}
 */
const downloadUrlOf = (media) => media.mediaUrl || media.providerUrl || media.sourceUrl;

/**
 * A result counts as "resolved" when a concrete media URL is present.
 * @param {ResolvedMedia} media
 */
const isResolved = (media) => !!(media && media.mediaUrl);

module.exports = {
  SUPPORTED_PROTOCOLS,
  parseUrl,
  isHttpUrl,
  hostOf,
  hostMatches,
  normalizeFormat,
  normalizeMedia,
  downloadUrlOf,
  isResolved
};

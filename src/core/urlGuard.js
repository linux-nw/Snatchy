"use strict";
/**
 * Validates inputs for downloads. Exactly two forms are allowed:
 *
 * 1. http and https URLs (normalizeHttpUrl).
 * 2. yt-dlp searches in the fixed pattern "ytsearch:text" or "ytsearchN:text"
 *    (normalizeYtSearch). N is optional, 1 to 50. The search text must not
 *    contain line breaks or control characters, and the whole input must be at most
 *    200 characters long. Other yt-dlp prefixes (ytsearchall:, ytsearchdate:,
 *    different capitalization) are NOT allowed.
 *
 * Local paths, file: URLs and anything starting with "-" (yt-dlp options)
 * are rejected. For both forms it also holds that the input always comes after
 * "--" in the yt-dlp argument list (see src/downloader/ytDlpArgs.js), so it is
 * never read as an option.
 */

const YTSEARCH_MAX_LENGTH = 200;
const YTSEARCH_MAX_RESULTS = 50;
const YTSEARCH_PATTERN = /^ytsearch(\d{1,2})?:([^\r\n\u0000-\u001f\u007f]+)$/;

/** http/https URL: returns the trimmed URL or null. */
const normalizeHttpUrl = (input) => {
  if (typeof input !== "string") return null;
  const text = input.trim();
  if (!text || text.startsWith("-") || /[\u0000-\u001f\u007f]/.test(text)) return null;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:" ? text : null;
};

/** ytsearch[N]:text: returns the trimmed input or null. */
const normalizeYtSearch = (input) => {
  if (typeof input !== "string") return null;
  const text = input.trim();
  if (!text || text.length > YTSEARCH_MAX_LENGTH) return null;
  const match = YTSEARCH_PATTERN.exec(text);
  if (!match) return null;
  if (match[1] !== undefined) {
    const count = Number(match[1]);
    if (count < 1 || count > YTSEARCH_MAX_RESULTS) return null;
  }
  return match[2].trim() ? text : null;
};

/** Input for download:start: http(s) URL or strict ytsearch form, otherwise null. */
const normalizeDownloadInput = (input) => normalizeHttpUrl(input) || normalizeYtSearch(input);

module.exports = { normalizeHttpUrl, normalizeYtSearch, normalizeDownloadInput, YTSEARCH_MAX_LENGTH, YTSEARCH_MAX_RESULTS };

"use strict";
/**
 * Prueft Eingaben fuer Downloads. Erlaubt sind genau zwei Formen:
 *
 * 1. http- und https-URLs (normalizeHttpUrl).
 * 2. yt-dlp-Suchen im festen Muster "ytsearch:Suchtext" oder "ytsearchN:Suchtext"
 *    (normalizeYtSearch). N ist optional, 1 bis 50. Der Suchtext darf keine
 *    Zeilenumbrueche und keine Steuerzeichen enthalten, die ganze Eingabe hoechstens
 *    200 Zeichen lang sein. Andere yt-dlp-Praefixe (ytsearchall:, ytsearchdate:,
 *    Gross-/Kleinschreibung abweichend) sind NICHT erlaubt.
 *
 * Lokale Pfade, file:-URLs und alles, was mit "-" beginnt (yt-dlp-Optionen),
 * werden abgelehnt. Fuer beide Formen gilt ausserdem: die Eingabe steht in der
 * yt-dlp-Argumentliste immer hinter "--" (siehe src/downloader/ytDlpArgs.js), wird
 * also nie als Option gelesen.
 */

const YTSEARCH_MAX_LENGTH = 200;
const YTSEARCH_MAX_RESULTS = 50;
const YTSEARCH_PATTERN = /^ytsearch(\d{1,2})?:([^\r\n\u0000-\u001f\u007f]+)$/;

/** http/https-URL: gibt die getrimmte URL zurueck oder null. */
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

/** ytsearch[N]:Suchtext: gibt die getrimmte Eingabe zurueck oder null. */
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

/** Eingabe fuer download:start: http(s)-URL oder strenge ytsearch-Form, sonst null. */
const normalizeDownloadInput = (input) => normalizeHttpUrl(input) || normalizeYtSearch(input);

module.exports = { normalizeHttpUrl, normalizeYtSearch, normalizeDownloadInput, YTSEARCH_MAX_LENGTH, YTSEARCH_MAX_RESULTS };

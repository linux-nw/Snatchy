/**
 * Construction of the yt-dlp command line.
 *
 * Extracted unchanged from main.js so the arguments can be tested without Electron.
 * The downloader layer works with a ready URL from
 * a ResolvedMedia and knows nothing about providers.
 */

// Allowed character sets for file names (= Python codec names, passed to PYTHONIOENCODING).
// "system" leaves the environment untouched. Unknown values -> utf-8.
const ALLOWED_ENCODINGS = new Set([
  "system", "utf-8", "utf-8-sig", "utf-16", "ascii",
  "cp1252", "latin-1", "iso-8859-15", "cp437", "cp850", "mac-roman"
]);
const normalizeEncoding = (enc) => (ALLOWED_ENCODINGS.has(enc) ? enc : "utf-8");

// Browsers whose cookies yt-dlp can read via --cookies-from-browser.
const ALLOWED_BROWSERS = new Set([
  "none", "chrome", "firefox", "edge", "brave", "opera", "vivaldi", "chromium", "safari", "whale"
]);

// Whisper models (speech -> text). Larger = more accurate but slower. Default: base.
const ALLOWED_WHISPER_MODELS = new Set(["tiny", "base", "small", "medium", "large"]);
const normalizeWhisperModel = (m) => (ALLOWED_WHISPER_MODELS.has(m) ? m : "base");

/**
 * Returns domain-specific extractor-args for stage 2 of the retry cascade,
 * or null if no matching age-gate bypass is known for this URL.
 * @param {string} url
 * @returns {string[]|null}
 */
const getAgeGateExtraArgs = (url) => {
  if (/(?:^|\.)youtube\.com|youtu\.be/i.test(url)) {
    return ["--extractor-args", "youtube:skip=age_gate"];
  }
  return null;
};

/**
 * Preparation for the yt-dlp download.
 * @param {Object} options
 * @returns {string[]}
 */
const buildYtDlpArgs = ({ url, format, quality, audioQuality, playlistMode, outputFolder, cookiesBrowser, impersonate, embedCoverArt, aria2Path }) => {
  const args = [
    "--newline",
    "--no-colors",
    "--ignore-config",
    "--retries",
    "10",
    "--fragment-retries",
    "10",
    // Since 2026.08 yt-dlp needs a real JS interpreter to solve the YouTube
    // signature cipher (n-sig); without it streams stay throttled
    // hard on the server side (short burst, then hardly any throughput). "deno" is
    // the default but rarely present - "node" works practically everywhere
    // Node.js is already installed, and is otherwise ignored without effect.
    "--js-runtimes",
    "node",
    // Download several segments at once instead of one after another: YouTube throttles
    // per segment after a short burst (ramp throttle), many parallel
    // segments add up their burst phases to noticeably more throughput.
    "--concurrent-fragments",
    "16",
    // Smaller chunks = more frequent resets of the throttling before it kicks in.
    "--http-chunk-size",
    "2M",
    "--paths",
    outputFolder,
    "--output",
    "%(title).180B.%(ext)s",
    "--progress-template",
    "download:%(progress._percent_str)s|%(progress._downloaded_bytes_str)s|%(progress._total_bytes_str)s|%(progress._speed_str)s|%(progress._eta_str)s"
  ];

  if (format === "mp3") {
    args.push(
      "--format",
      "bestaudio/best",
      "--extract-audio",
      "--audio-format",
      "mp3",
      "--audio-quality",
      audioQuality && audioQuality !== "undefined" ? audioQuality : "0"
    );
    // Embed the video thumbnail as cover art in the MP3 (ID3 APIC), if requested.
    if (embedCoverArt) {
      args.push("--embed-thumbnail");
    }
  } else if (format === "audio-raw") {
    // Only for the internal Whisper preparation: best audio without ffmpeg re-encode.
    // Whisper downsamples to 16 kHz mono internally anyway, an MP3 re-encode
    // at best quality beforehand only costs time without any benefit.
    args.push("--format", "bestaudio/best");
  } else {
    // Robust format selection with several fallbacks (separated by "/") so that
    // as many sites as possible work, including those without separate video/audio
    // streams or without a height value (Pornhub, GayForFans, generic extractor):
    //   1. best video up to the desired height + best audio (separate streams)
    //   2. best single format up to the desired height (progressive)
    //   3. best video + best audio without height limit
    //   4. any best format ("best" / "b")
    let formatString = "bestvideo*+bestaudio/best";
    if (quality && quality !== "best" && quality !== "undefined") {
      formatString = `bestvideo*[height<=${quality}]+bestaudio/best[height<=${quality}]/bestvideo*+bestaudio/best`;
    }
    args.push(
      "--format",
      formatString,
      "--merge-output-format",
      "mp4"
    );
    // --embed-chapters embeds chapter marks where the site provides them
    // (e.g. YouTube chapters, Twitch VOD markers), no-op otherwise, costs nothing.
    args.push("--embed-subs", "--embed-metadata", "--embed-chapters");
    // Embed the video thumbnail as cover art (attached-pic stream in the MP4),
    // just like with MP3. The same setting applies to both formats.
    if (embedCoverArt) {
      args.push("--embed-thumbnail");
    }
  }

  if (playlistMode === "single-video") {
    args.push("--no-playlist");
  }

  if (playlistMode === "playlist-combined") {
    args.push("--yes-playlist", "--concat-playlist", "always");
  }

  if (playlistMode === "playlist-items") {
    args.push("--yes-playlist");
  }

  // aria2c with several real parallel TCP connections for plain HTTP/FTP
  // downloads. A single stream often does not come close to using the line over the distance to
  // the Google CDN (RTT/TCP window limit). 16 parallel
  // connections gave ~80-90 Mbit/s in testing instead of ~10 Mbit/s with a
  // single stream, without being blocked by YouTube. dash/m3u8 (HLS sites like
  // Twitch) stay with the native downloader, since many small
  // segments already run individually there and aria2c would only add overhead per segment.
  if (aria2Path) {
    args.push(
      "--downloader", aria2Path,
      "--downloader", "dash,m3u8:native",
      "--downloader-args", "aria2c:-x 16 -s 16 -k 1M"
    );
  }

  // Generic levers for broad site compatibility:
  // - Browser impersonation mimics a real browser (TLS/HTTP2 fingerprint)
  //   and thereby gets around anti-bot/Cloudflare blocks (403/410/429 ...) on many sites.
  // - Cookies from the browser unlock login/age restrictions.
  if (impersonate) {
    args.push("--impersonate", "chrome");
  }
  if (cookiesBrowser && cookiesBrowser !== "none") {
    args.push("--cookies-from-browser", cookiesBrowser);
  }

  args.push("--", url); // "--": the URL is never read as an option
  return args;
};

/**
 * Arguments for the subtitle fetch (stage 1 of the transcript pipeline).
 * @param {Object} options
 * @returns {string[]}
 */
const buildSubtitleArgs = ({ url, subLangs, outputFolder, cookiesBrowser, impersonate }) => {
  const args = [
    "--newline",
    "--no-colors",
    "--ignore-config",
    "--no-playlist",
    "--skip-download",
    "--write-subs",
    "--write-auto-subs",
    "--sub-langs",
    subLangs,
    "--sub-format",
    "vtt/srt/best",
    "--paths",
    outputFolder,
    "--output",
    "%(title).180B.%(ext)s"
  ];
  if (impersonate) args.push("--impersonate", "chrome");
  if (cookiesBrowser && cookiesBrowser !== "none") args.push("--cookies-from-browser", cookiesBrowser);
  args.push("--", url); // "--": the URL is never read as an option
  return args;
};

/**
 * Arguments for a pure metadata fetch (--print), e.g. thumbnail URL
 * or video language.
 * @param {{ field: string, url: string, cookiesBrowser?: string, impersonate?: boolean }} options
 * @returns {string[]}
 */
const buildPrintArgs = ({ field, url, cookiesBrowser, impersonate }) => {
  const args = ["--skip-download", "--no-playlist", "--print", field];
  if (impersonate) args.push("--impersonate", "chrome");
  if (cookiesBrowser && cookiesBrowser !== "none") args.push("--cookies-from-browser", cookiesBrowser);
  args.push("--", url); // "--": the URL is never read as an option
  return args;
};

module.exports = {
  ALLOWED_ENCODINGS,
  ALLOWED_BROWSERS,
  ALLOWED_WHISPER_MODELS,
  normalizeEncoding,
  normalizeWhisperModel,
  getAgeGateExtraArgs,
  buildYtDlpArgs,
  buildSubtitleArgs,
  buildPrintArgs
};

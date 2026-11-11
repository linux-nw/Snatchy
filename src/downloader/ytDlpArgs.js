/**
 * Aufbau der yt-dlp-Kommandozeile.
 *
 * Unverändert aus main.js herausgelöst, damit die Argumente ohne Electron
 * testbar sind. Die Downloader-Schicht arbeitet mit einer fertigen URL aus
 * einem ResolvedMedia und weiß nichts über Provider.
 */

// Erlaubte Zeichensätze für Dateinamen (= Python-Codec-Namen, an PYTHONIOENCODING).
// "system" lässt die Umgebung unberührt. Unbekannte Werte -> utf-8.
const ALLOWED_ENCODINGS = new Set([
  "system", "utf-8", "utf-8-sig", "utf-16", "ascii",
  "cp1252", "latin-1", "iso-8859-15", "cp437", "cp850", "mac-roman"
]);
const normalizeEncoding = (enc) => (ALLOWED_ENCODINGS.has(enc) ? enc : "utf-8");

// Browser, deren Cookies yt-dlp via --cookies-from-browser auslesen kann.
const ALLOWED_BROWSERS = new Set([
  "none", "chrome", "firefox", "edge", "brave", "opera", "vivaldi", "chromium", "safari", "whale"
]);

// Whisper-Modelle (Sprache -> Text). Größer = genauer aber langsamer. Default: base.
const ALLOWED_WHISPER_MODELS = new Set(["tiny", "base", "small", "medium", "large"]);
const normalizeWhisperModel = (m) => (ALLOWED_WHISPER_MODELS.has(m) ? m : "base");

/**
 * Liefert domain-spezifische extractor-args für Stufe 2 der Retry-Kaskade,
 * oder null wenn für diese URL kein passender Age-Gate-Bypass bekannt ist.
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
 * Vorbereitung für yt-dlp Download.
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
    // yt-dlp braucht seit 2026.08 einen echten JS-Interpreter, um YouTubes
    // Signatur-Cipher (n-sig) zu lösen; ohne ihn bleiben Streams serverseitig
    // hart gedrosselt (kurzer Burst, dann kaum noch Durchsatz). "deno" ist
    // Standard, aber selten vorhanden – "node" läuft praktisch überall, wo
    // schon Node.js installiert ist, und wird sonst folgenlos ignoriert.
    "--js-runtimes",
    "node",
    // Mehrere Segmente gleichzeitig laden statt nacheinander: YouTube drosselt
    // pro Segment nach einem kurzen Burst (Ramp-Throttle), viele parallele
    // Segmente summieren ihre Burst-Phasen zu spürbar mehr Durchsatz.
    "--concurrent-fragments",
    "16",
    // Kleinere Chunks = häufigere Resets der Drosselung, bevor sie greift.
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
    // Video-Thumbnail als Cover-Art in die MP3 (ID3 APIC) einbetten, wenn gewünscht.
    if (embedCoverArt) {
      args.push("--embed-thumbnail");
    }
  } else if (format === "audio-raw") {
    // Nur für die interne Whisper-Vorbereitung: bestes Audio ohne ffmpeg-Reencode.
    // Whisper sampelt intern ohnehin auf 16 kHz Mono herunter, ein MP3-Reencode
    // mit Bestqualität davor kostet nur Zeit ohne jeden Nutzen.
    args.push("--format", "bestaudio/best");
  } else {
    // Robuste Format-Auswahl mit mehreren Fallbacks (durch "/" getrennt), damit
    // möglichst viele Seiten klappen – auch solche ohne getrennte Video/Audio-
    // Streams oder ohne height-Angabe (Pornhub, GayForFans, generischer Extractor):
    //   1. bestes Video ≤ Wunschhöhe + bestes Audio (getrennte Streams)
    //   2. bestes Einzelformat ≤ Wunschhöhe (progressiv)
    //   3. bestes Video + bestes Audio ohne Höhenlimit
    //   4. irgendein bestes Format ("best" / "b")
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
    // --embed-chapters bettet Kapitelmarken ein, wo die Seite sie liefert
    // (z. B. YouTube-Kapitel, Twitch-VOD-Marker) – no-op sonst, kostet nichts.
    args.push("--embed-subs", "--embed-metadata", "--embed-chapters");
    // Video-Thumbnail als Cover-Art einbetten (attached-pic Stream im MP4),
    // genau wie bei MP3 – dieselbe Einstellung gilt für beide Formate.
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

  // aria2c mit mehreren echten parallelen TCP-Verbindungen für reine HTTP/FTP-
  // Downloads. Ein einzelner Stream schöpft die Leitung über die Distanz zu
  // Googles CDN oft nicht annähernd aus (RTT/TCP-Fenster-Limit) – 16 parallele
  // Verbindungen brachten im Test ~80-90 Mbit/s statt ~10 Mbit/s mit einem
  // Stream, ohne von YouTube blockiert zu werden. dash/m3u8 (HLS-Seiten wie
  // Twitch) bleiben beim nativen Downloader, da dort schon viele kleine
  // Segmente einzeln laufen und aria2c pro Segment nur Overhead wäre.
  if (aria2Path) {
    args.push(
      "--downloader", aria2Path,
      "--downloader", "dash,m3u8:native",
      "--downloader-args", "aria2c:-x 16 -s 16 -k 1M"
    );
  }

  // Generische Hebel für breite Seiten-Kompatibilität:
  // - Browser-Impersonation ahmt einen echten Browser nach (TLS/HTTP2-Fingerprint)
  //   und umgeht damit Anti-Bot/Cloudflare-Blocks (403/410/429 …) auf vielen Seiten.
  // - Cookies aus dem Browser schalten Login-/Altersschranken frei.
  if (impersonate) {
    args.push("--impersonate", "chrome");
  }
  if (cookiesBrowser && cookiesBrowser !== "none") {
    args.push("--cookies-from-browser", cookiesBrowser);
  }

  args.push("--", url); // "--": die URL wird nie als Option gelesen
  return args;
};

/**
 * Argumente für den Untertitel-Abruf (Stufe 1 der Transkript-Pipeline).
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
  args.push("--", url); // "--": die URL wird nie als Option gelesen
  return args;
};

/**
 * Argumente für einen reinen Metadaten-Abruf (--print), z. B. Thumbnail-URL
 * oder Videosprache.
 * @param {{ field: string, url: string, cookiesBrowser?: string, impersonate?: boolean }} options
 * @returns {string[]}
 */
const buildPrintArgs = ({ field, url, cookiesBrowser, impersonate }) => {
  const args = ["--skip-download", "--no-playlist", "--print", field];
  if (impersonate) args.push("--impersonate", "chrome");
  if (cookiesBrowser && cookiesBrowser !== "none") args.push("--cookies-from-browser", cookiesBrowser);
  args.push("--", url); // "--": die URL wird nie als Option gelesen
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

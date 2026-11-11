const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildYtDlpArgs,
  buildSubtitleArgs,
  buildPrintArgs,
  getAgeGateExtraArgs,
  normalizeEncoding,
  normalizeWhisperModel,
  ALLOWED_BROWSERS
} = require("../src/downloader/ytDlpArgs");

const basis = {
  url: "https://www.youtube.com/watch?v=abc",
  outputFolder: "C:/Downloads",
  playlistMode: "single-video"
};

/** Wert des Arguments nach dem Schalter, oder undefined. */
const valueOf = (args, flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};

test("MP4: Formatkette mit Höhenlimit und Fallbacks", () => {
  const args = buildYtDlpArgs({ ...basis, format: "mp4", quality: "1080" });
  assert.equal(
    valueOf(args, "--format"),
    "bestvideo*[height<=1080]+bestaudio/best[height<=1080]/bestvideo*+bestaudio/best"
  );
  assert.equal(valueOf(args, "--merge-output-format"), "mp4");
  assert.ok(args.includes("--embed-subs"));
  assert.ok(args.includes("--embed-metadata"));
  assert.ok(args.includes("--embed-chapters"));
  assert.ok(args.includes("--no-playlist"));
  assert.equal(args[args.length - 1], basis.url, "die URL steht immer am Ende");
  assert.equal(args[args.length - 2], "--", "vor der URL steht --, damit sie nie als Option gelesen wird");
});

test("MP4 ohne Qualitätswunsch nimmt das beste Format", () => {
  const args = buildYtDlpArgs({ ...basis, format: "mp4", quality: "best" });
  assert.equal(valueOf(args, "--format"), "bestvideo*+bestaudio/best");
});

test("MP3: Audioextraktion mit Qualität", () => {
  const args = buildYtDlpArgs({ ...basis, format: "mp3", audioQuality: "5" });
  assert.equal(valueOf(args, "--format"), "bestaudio/best");
  assert.ok(args.includes("--extract-audio"));
  assert.equal(valueOf(args, "--audio-format"), "mp3");
  assert.equal(valueOf(args, "--audio-quality"), "5");
  assert.ok(!args.includes("--merge-output-format"));
});

test("audio-raw lädt Audio ohne Reencode (Whisper-Vorbereitung)", () => {
  const args = buildYtDlpArgs({ ...basis, format: "audio-raw" });
  assert.equal(valueOf(args, "--format"), "bestaudio/best");
  assert.ok(!args.includes("--extract-audio"));
});

test("Cover-Art wird nur auf Wunsch eingebettet", () => {
  assert.ok(!buildYtDlpArgs({ ...basis, format: "mp3" }).includes("--embed-thumbnail"));
  assert.ok(buildYtDlpArgs({ ...basis, format: "mp3", embedCoverArt: true }).includes("--embed-thumbnail"));
  assert.ok(buildYtDlpArgs({ ...basis, format: "mp4", embedCoverArt: true }).includes("--embed-thumbnail"));
});

test("Playlist-Modi setzen die passenden Schalter", () => {
  assert.ok(buildYtDlpArgs({ ...basis, format: "mp4" }).includes("--no-playlist"));
  const kombiniert = buildYtDlpArgs({ ...basis, format: "mp4", playlistMode: "playlist-combined" });
  assert.ok(kombiniert.includes("--yes-playlist"));
  assert.equal(valueOf(kombiniert, "--concat-playlist"), "always");
  const einzeln = buildYtDlpArgs({ ...basis, format: "mp4", playlistMode: "playlist-items" });
  assert.ok(einzeln.includes("--yes-playlist"));
  assert.ok(!einzeln.includes("--concat-playlist"));
});

test("Impersonation und Browser-Cookies sind optional", () => {
  const ohne = buildYtDlpArgs({ ...basis, format: "mp4", cookiesBrowser: "none" });
  assert.ok(!ohne.includes("--impersonate"));
  assert.ok(!ohne.includes("--cookies-from-browser"));

  const mit = buildYtDlpArgs({ ...basis, format: "mp4", impersonate: true, cookiesBrowser: "firefox" });
  assert.equal(valueOf(mit, "--impersonate"), "chrome");
  assert.equal(valueOf(mit, "--cookies-from-browser"), "firefox");
});

test("Age-Gate-Bypass gibt es nur für YouTube", () => {
  assert.deepEqual(
    getAgeGateExtraArgs("https://www.youtube.com/watch?v=abc"),
    ["--extractor-args", "youtube:skip=age_gate"]
  );
  assert.deepEqual(getAgeGateExtraArgs("https://youtu.be/abc"), ["--extractor-args", "youtube:skip=age_gate"]);
  assert.equal(getAgeGateExtraArgs("https://example.com/video"), null);
});

test("Untertitel-Argumente bleiben unverändert", () => {
  const args = buildSubtitleArgs({
    url: basis.url,
    subLangs: "de.*",
    outputFolder: "C:/Downloads",
    cookiesBrowser: "chrome",
    impersonate: true
  });
  assert.ok(args.includes("--skip-download"));
  assert.ok(args.includes("--write-subs"));
  assert.ok(args.includes("--write-auto-subs"));
  assert.equal(valueOf(args, "--sub-langs"), "de.*");
  assert.equal(valueOf(args, "--sub-format"), "vtt/srt/best");
  assert.equal(valueOf(args, "--cookies-from-browser"), "chrome");
  assert.equal(args[args.length - 1], basis.url);
  assert.equal(args[args.length - 2], "--");
});

test("Metadaten-Abruf nutzt --print", () => {
  const args = buildPrintArgs({ field: "%(thumbnail)s", url: basis.url, impersonate: true, cookiesBrowser: "edge" });
  assert.deepEqual(args.slice(0, 4), ["--skip-download", "--no-playlist", "--print", "%(thumbnail)s"]);
  assert.equal(valueOf(args, "--impersonate"), "chrome");
  assert.equal(valueOf(args, "--cookies-from-browser"), "edge");
  assert.equal(args[args.length - 1], basis.url);
  assert.equal(args[args.length - 2], "--");
});

test("Eingaben werden auf erlaubte Werte begrenzt", () => {
  assert.equal(normalizeEncoding("cp1252"), "cp1252");
  assert.equal(normalizeEncoding("quatsch"), "utf-8");
  assert.equal(normalizeEncoding("system"), "system");
  assert.equal(normalizeWhisperModel("small"), "small");
  assert.equal(normalizeWhisperModel("riesig"), "base");
  assert.equal(ALLOWED_BROWSERS.has("firefox"), true);
  assert.equal(ALLOWED_BROWSERS.has("netscape"), false);
});

test("ytsearch-Eingabe steht hinter -- und nie als Option", () => {
  const eingabe = "ytsearch5:katzen videos";
  const args = buildYtDlpArgs({ ...basis, url: eingabe });
  assert.equal(args[args.length - 1], eingabe);
  assert.equal(args[args.length - 2], "--");
  assert.equal(args.filter((a) => a === "--").length, 1, "genau ein --");
});
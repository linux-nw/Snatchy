const test = require("node:test");
const assert = require("node:assert/strict");

const { runDownloadCascade, buildFailureMessage } = require("../src/downloader/YtDlpDownloader");

const KANDIDATEN = [
  { command: "yt-dlp", argsPrefix: [] },
  { command: "python", argsPrefix: ["-m", "yt_dlp"] }
];

const optionen = {
  url: "https://www.youtube.com/watch?v=abc",
  format: "mp4",
  outputFolder: "C:/Downloads",
  playlistMode: "single-video",
  playwrightFallback: false
};

const mediaFuer = (url) => ({ sourceUrl: url, mediaUrl: url, provider: "yt-dlp" });

/**
 * Builds a runDownload replacement that records the calls and returns
 * the next result from `verlauf` on each call (Error = throw).
 */
const fakeRunner = (verlauf) => {
  const aufrufe = [];
  let i = 0;
  const runDownload = async (candidate, opts, runOpts) => {
    aufrufe.push({ command: candidate.command, url: opts.url, ...runOpts });
    const ergebnis = verlauf[Math.min(i++, verlauf.length - 1)];
    if (ergebnis instanceof Error) throw ergebnis;
    return ergebnis;
  };
  return { runDownload, aufrufe };
};

const fehler = (message, code) => Object.assign(new Error(message), code ? { code } : {});

test("Stage 1: success with the first candidate, no further stages", async () => {
  const { runDownload, aufrufe } = fakeRunner(["C:/Downloads/video.mp4"]);
  const logs = [];
  const result = await runDownloadCascade({
    media: mediaFuer(optionen.url),
    options: optionen,
    deps: { impersonateAvailable: true, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload,
    log: (l) => logs.push(l)
  });

  assert.equal(result.ok, true);
  assert.equal(result.filePath, "C:/Downloads/video.mp4");
  assert.equal(result.candidate.command, "yt-dlp");
  assert.equal(aufrufe.length, 1);
  assert.equal(aufrufe[0].impersonate, true);
  assert.match(logs[0], /^\[Stufe 1\/5\] Starte mit yt-dlp \(Impersonation: chrome\)$/);
});

test("Stage 1: missing yt-dlp leads to the next candidate", async () => {
  const { runDownload, aufrufe } = fakeRunner([
    fehler("yt-dlp wurde nicht gefunden.", "ENOENT"),
    "C:/Downloads/video.mp4"
  ]);
  const result = await runDownloadCascade({
    media: mediaFuer(optionen.url),
    options: optionen,
    deps: { impersonateAvailable: false, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload
  });

  assert.equal(result.ok, true);
  assert.deepEqual(aufrufe.map((a) => a.command), ["yt-dlp", "python"]);
});

test("no yt-dlp found at all: ENOENT is preserved", async () => {
  const { runDownload } = fakeRunner([fehler("nicht gefunden", "ENOENT")]);
  const result = await runDownloadCascade({
    media: mediaFuer(optionen.url),
    options: optionen,
    deps: { impersonateAvailable: false, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "ENOENT");
  assert.match(buildFailureMessage(result.error, { options: optionen, deps: {} }), /yt-dlp wurde nicht gefunden/);
});

test("Stages 2 and 3: age-gate bypass, then without impersonation", async () => {
  const { runDownload, aufrufe } = fakeRunner([
    fehler("ERROR: Sign in to confirm your age"),
    fehler("ERROR: Sign in to confirm your age"),
    "C:/Downloads/video.mp4"
  ]);
  const logs = [];
  const result = await runDownloadCascade({
    media: mediaFuer("https://www.youtube.com/watch?v=abc"),
    options: optionen,
    deps: { impersonateAvailable: true, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload,
    log: (l) => logs.push(l)
  });

  assert.equal(result.ok, true);
  assert.equal(aufrufe.length, 3);
  assert.deepEqual(aufrufe[1].extraArgs, ["--extractor-args", "youtube:skip=age_gate"]);
  assert.equal(aufrufe[2].impersonate, false);
  assert.ok(logs.some((l) => l.startsWith("[Stufe 2/5]")));
  assert.ok(logs.some((l) => l.startsWith("[Stufe 3/5]")));
});

test("without a known age-gate bypass stage 2 is skipped", async () => {
  const { runDownload, aufrufe } = fakeRunner([
    fehler("HTTP Error 410: Gone"),
    "C:/Downloads/video.mp4"
  ]);
  const logs = [];
  await runDownloadCascade({
    media: mediaFuer("https://beispiel.example/video/1"),
    options: optionen,
    deps: { impersonateAvailable: true, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload,
    log: (l) => logs.push(l)
  });

  assert.equal(aufrufe.length, 2);
  assert.ok(!logs.some((l) => l.startsWith("[Stufe 2/5]")));
  assert.ok(logs.some((l) => l.startsWith("[Stufe 3/5]")));
});

test("without impersonation stages 2 and 3 are dropped", async () => {
  const { runDownload, aufrufe } = fakeRunner([fehler("HTTP Error 403: Forbidden")]);
  const logs = [];
  const result = await runDownloadCascade({
    media: mediaFuer("https://www.youtube.com/watch?v=abc"),
    options: optionen,
    deps: { impersonateAvailable: false, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload,
    log: (l) => logs.push(l)
  });

  assert.equal(result.ok, false);
  assert.equal(aufrufe.length, 1);
  assert.ok(!logs.some((l) => l.startsWith("[Stufe 2/5]") || l.startsWith("[Stufe 3/5]")));
});

test("Stage 4 only applies on Unsupported URL", async () => {
  const { runDownload, aufrufe } = fakeRunner([
    fehler("ERROR: Unsupported URL: https://beispiel.example/video/1"),
    fehler("ERROR: Unsupported URL: https://beispiel.example/video/1"),
    "C:/Downloads/video.mp4"
  ]);
  const logs = [];
  const result = await runDownloadCascade({
    media: mediaFuer("https://beispiel.example/video/1"),
    options: optionen,
    deps: { impersonateAvailable: true, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload,
    log: (l) => logs.push(l)
  });

  assert.equal(result.ok, true);
  assert.deepEqual(aufrufe[2].extraArgs, ["--force-generic-extractor"]);
  assert.ok(logs.some((l) => l.startsWith("[Stufe 4/5]")));
});

test("Stage 5 uses the resolved stream URL", async () => {
  const nichtUnterstuetzt = fehler("ERROR: Unsupported URL: https://beispiel.example/video/1");
  const { runDownload, aufrufe } = fakeRunner([
    nichtUnterstuetzt, nichtUnterstuetzt, nichtUnterstuetzt, "C:/Downloads/video.mp4"
  ]);
  const logs = [];
  const result = await runDownloadCascade({
    media: mediaFuer("https://beispiel.example/video/1"),
    options: { ...optionen, playwrightFallback: true },
    deps: { impersonateAvailable: true, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload,
    resolveStream: async () => ({
      sourceUrl: "https://beispiel.example/video/1",
      mediaUrl: "https://cdn.beispiel.example/stream.m3u8",
      provider: "playwright"
    }),
    log: (l) => logs.push(l)
  });

  assert.equal(result.ok, true);
  assert.equal(aufrufe[3].url, "https://cdn.beispiel.example/stream.m3u8");
  assert.ok(logs.some((l) => l.startsWith("[Stufe 5/5]")));
});

test("Stage 5 stays off when the fallback is not enabled", async () => {
  let gefragt = false;
  const { runDownload } = fakeRunner([fehler("ERROR: Unsupported URL: x")]);
  const result = await runDownloadCascade({
    media: mediaFuer("https://beispiel.example/video/1"),
    options: { ...optionen, playwrightFallback: false },
    deps: { impersonateAvailable: false, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload,
    resolveStream: async () => { gefragt = true; return null; }
  });

  assert.equal(result.ok, false);
  assert.equal(gefragt, false);
});

test("no stream found gives the matching message", async () => {
  const nichtUnterstuetzt = fehler("ERROR: Unsupported URL: x");
  const { runDownload } = fakeRunner([nichtUnterstuetzt]);
  const result = await runDownloadCascade({
    media: mediaFuer("https://beispiel.example/video/1"),
    options: { ...optionen, playwrightFallback: true },
    deps: { impersonateAvailable: false, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload,
    resolveStream: async () => null
  });

  assert.equal(result.ok, false);
  assert.equal(
    buildFailureMessage(result.error, { options: optionen, deps: {} }),
    "Seite nicht unterstützt (JS-Rendering, kein Stream gefunden)."
  );
});

test("Error message: unsupported site with hint about the fallback", () => {
  const message = buildFailureMessage(fehler("ERROR: Unsupported URL: x"), {
    options: { playwrightFallback: false },
    deps: { ffmpegAvailable: true }
  });
  assert.match(message, /wird von yt-dlp nicht unterstützt/);
  assert.match(message, /Playwright-Fallback in den Einstellungen aktivieren/);

  const ohneHinweis = buildFailureMessage(fehler("ERROR: Unsupported URL: x"), {
    options: { playwrightFallback: true },
    deps: { ffmpegAvailable: true }
  });
  assert.doesNotMatch(ohneHinweis, /Playwright-Fallback in den Einstellungen/);
});

test("Error message: missing ffmpeg and block tips", () => {
  const message = buildFailureMessage(fehler("HTTP Error 403: Forbidden"), {
    options: { playwrightFallback: false },
    deps: { ffmpegAvailable: false }
  });
  assert.match(message, /ffmpeg wurde nicht gefunden/);
  assert.match(message, /Browser-Impersonation aktivieren/);
});

test("Error message: Playwright setup error is passed through", () => {
  const setupFehler = Object.assign(new Error("Playwright nicht installiert. Bitte ausführen: npm install playwright"), {
    code: "EXTRACTION_FAILED",
    details: { setup: "PLAYWRIGHT_MISSING" }
  });
  assert.equal(
    buildFailureMessage(setupFehler, { options: {}, deps: {} }),
    "Playwright nicht installiert. Bitte ausführen: npm install playwright"
  );
});

test("Stage 5 also runs when stage 4 fails with a different message", async () => {
  // Exactly the case from practice: stage 4 finds an embedded video and
  // fails at it; the message has nothing to do with "Unsupported URL" any more.
  // The browser stage must still get its turn.
  let aufruf = 0;
  const aufrufe = [];
  const result = await runDownloadCascade({
    media: mediaFuer("https://beispiel.example/video/1"),
    options: { ...optionen, playwrightFallback: true },
    deps: { impersonateAvailable: false, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload: async (_c, opts, runOpts) => {
      aufrufe.push({ url: opts.url, ...runOpts });
      aufruf++;
      if (aufruf === 1) throw fehler("ERROR: Unsupported URL: https://beispiel.example/video/1");
      if (aufruf === 2) throw fehler("[youtube] Su1LOpjvdZ4: This video is not available");
      return "C:/Downloads/video.mp4";
    },
    resolveStream: async () => ({
      sourceUrl: "https://beispiel.example/video/1",
      mediaUrl: "https://cdn.beispiel.example/stream.m3u8"
    })
  });

  assert.equal(result.ok, true);
  assert.equal(aufrufe.length, 3);
  assert.deepEqual(aufrufe[1].extraArgs, ["--force-generic-extractor"]);
  assert.equal(aufrufe[2].url, "https://cdn.beispiel.example/stream.m3u8");
});

test("without a hint of a missing extractor stages 4 and 5 stay off", async () => {
  let gefragt = false;
  const { runDownload, aufrufe } = fakeRunner([fehler("HTTP Error 403: Forbidden")]);
  const result = await runDownloadCascade({
    media: mediaFuer("https://beispiel.example/video/1"),
    options: { ...optionen, playwrightFallback: true },
    deps: { impersonateAvailable: false, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload,
    resolveStream: async () => { gefragt = true; return null; }
  });

  assert.equal(result.ok, false);
  assert.equal(aufrufe.length, 1);
  assert.equal(gefragt, false);
});

test("a cancellation stops the cascade instead of starting the next stage", async () => {
  let abgebrochen = false;
  const aufrufe = [];
  const result = await runDownloadCascade({
    media: mediaFuer("https://www.youtube.com/watch?v=abc"),
    options: optionen,
    deps: { impersonateAvailable: true, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload: async (_c, opts) => {
      aufrufe.push(opts.url);
      abgebrochen = true; // the user clicks Cancel during the download
      throw fehler("yt-dlp wurde mit Code 1 beendet.");
    },
    isCancelled: () => abgebrochen
  });

  assert.equal(result.ok, false);
  assert.equal(aufrufe.length, 1, "no further stage after the cancellation");
});

test("after a cancellation no further yt-dlp candidate is tried", async () => {
  let abgebrochen = false;
  const aufrufe = [];
  await runDownloadCascade({
    media: mediaFuer("https://www.youtube.com/watch?v=abc"),
    options: optionen,
    deps: { impersonateAvailable: false, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload: async (candidate) => {
      aufrufe.push(candidate.command);
      abgebrochen = true;
      throw fehler("yt-dlp wurde nicht gefunden.", "ENOENT");
    },
    isCancelled: () => abgebrochen
  });

  assert.deepEqual(aufrufe, ["yt-dlp"]);
});

test("the downloader layer uses the media URL, not the source URL", async () => {
  const { runDownload, aufrufe } = fakeRunner(["C:/Downloads/folge1.mp3"]);
  await runDownloadCascade({
    media: {
      sourceUrl: "https://feeds.example.com/show",
      providerUrl: "https://cdn.example.com/folge1.mp3",
      mediaUrl: "https://cdn.example.com/folge1.mp3",
      provider: "direct"
    },
    options: { ...optionen, format: "mp3" },
    deps: { impersonateAvailable: false, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload
  });

  assert.equal(aufrufe[0].url, "https://cdn.example.com/folge1.mp3");
});

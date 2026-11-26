/**
 * Integration tests over the complete chain:
 *   Input URL -> SiteResolver -> ProviderResolver -> ResolvedMedia -> Downloader
 *
 * They replicate the flows that main.js triggers (download:start and
 * podcast:resolve) without starting Electron.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { createDefaultResolverManager } = require("../src/core/setup");
const { createResolveContext } = require("../src/core/ResolveContext");
const { createLogger } = require("../src/core/logger");
const { runDownloadCascade } = require("../src/downloader/YtDlpDownloader");
const { downloadUrlOf } = require("../src/core/types");
const { ResolveErrorCode } = require("../src/core/errors");
const { SiteResolver } = require("../src/sites/SiteResolver");

const KANDIDATEN = [{ command: "yt-dlp", argsPrefix: [] }];
const DEPS = { impersonateAvailable: true, ffmpegAvailable: true };

const FEED = `<rss><channel>
  <item><title>Folge 2</title><pubDate>Tue, 05 Aug 2025</pubDate>
    <enclosure url="https://cdn.example.com/folge2.mp3"/></item>
  <item><title>Folge 1</title><pubDate>Tue, 29 Jul 2025</pubDate>
    <enclosure url="https://cdn.example.com/folge1.mp3"/></item>
</channel></rss>`;

const optionen = {
  format: "mp3",
  outputFolder: "C:/Downloads",
  playlistMode: "single-video",
  playwrightFallback: false
};

const runnerDer = (dateipfad) => {
  const aufrufe = [];
  return {
    aufrufe,
    runDownload: async (candidate, opts, runOpts) => {
      aufrufe.push({ url: opts.url, format: opts.format, ...runOpts });
      return dateipfad;
    }
  };
};

test("YouTube workflow: URL goes to yt-dlp unchanged", async () => {
  const manager = createDefaultResolverManager({ cache: null });
  const context = createResolveContext({});
  const media = await manager.resolveOne("https://www.youtube.com/watch?v=abc", context);
  const { runDownload, aufrufe } = runnerDer("C:/Downloads/video.mp4");

  const result = await runDownloadCascade({
    media,
    options: { ...optionen, format: "mp4" },
    deps: DEPS,
    candidates: KANDIDATEN,
    runDownload
  });

  assert.equal(result.ok, true);
  assert.equal(aufrufe[0].url, "https://www.youtube.com/watch?v=abc");
  assert.equal(aufrufe[0].impersonate, true);
});

test("Podcast workflow: feed returns several episodes, download takes the episode", async () => {
  const manager = createDefaultResolverManager({ cache: null });
  const context = createResolveContext({
    services: { http: async () => ({ ok: true, status: 200, text: async () => FEED }) }
  });

  // 1. podcast:resolve
  const referenzen = await manager.resolveSite("https://feeds.example.com/show", context, {
    only: ["podcast-rss"]
  });
  const episoden = referenzen.map((media) => ({
    title: media.title,
    audioUrl: downloadUrlOf(media),
    pubDate: (media.meta && media.meta.pubDate) || null
  }));
  assert.deepEqual(episoden, [
    { title: "Folge 2", audioUrl: "https://cdn.example.com/folge2.mp3", pubDate: "Tue, 05 Aug 2025" },
    { title: "Folge 1", audioUrl: "https://cdn.example.com/folge1.mp3", pubDate: "Tue, 29 Jul 2025" }
  ]);

  // 2. download:start with the chosen episode
  const media = await manager.resolveOne(episoden[1].audioUrl, createResolveContext({}));
  assert.equal(media.provider, "direct");

  const { runDownload, aufrufe } = runnerDer("C:/Downloads/folge1.mp3");
  const result = await runDownloadCascade({
    media, options: optionen, deps: DEPS, candidates: KANDIDATEN, runDownload
  });

  assert.equal(result.ok, true);
  assert.equal(aufrufe[0].url, "https://cdn.example.com/folge1.mp3");
  assert.equal(aufrufe[0].format, "mp3");
});

test("a new site is added without changing the downloader", async () => {
  // A site resolver that finds two host links on an overview page.
  class BeispielSeite extends SiteResolver {
    constructor() { super({ name: "beispiel-seite", priority: 80 }); }
    canHandle(url) { return /(^|\.)beispiel\.example$/.test(new URL(url).hostname); }
    async resolve(url) {
      return [
        { sourceUrl: url, providerUrl: "https://cdn.beispiel.example/teil1.mp4", title: "Teil 1" },
        { sourceUrl: url, providerUrl: "https://cdn.beispiel.example/teil2.mp4", title: "Teil 2" }
      ];
    }
  }

  const manager = createDefaultResolverManager({ cache: null, extraSites: [new BeispielSeite()] });
  const alle = await manager.resolve("https://beispiel.example/serie/1", createResolveContext({}));

  assert.equal(alle.length, 2);
  assert.equal(alle[0].provider, "direct", "the default provider recognizes the direct files");
  assert.equal(alle[0].sourceUrl, "https://beispiel.example/serie/1");

  const { runDownload, aufrufe } = runnerDer("C:/Downloads/teil1.mp4");
  await runDownloadCascade({
    media: alle[0], options: { ...optionen, format: "mp4" }, deps: DEPS, candidates: KANDIDATEN, runDownload
  });
  assert.equal(aufrufe[0].url, "https://cdn.beispiel.example/teil1.mp4");
});

test("Browser fallback: stage 5 explicitly requests the browser extraction", async () => {
  const manager = createDefaultResolverManager({
    cache: null,
    findStream: async () => "https://cdn.beispiel.example/live.m3u8"
  });
  const context = createResolveContext({ flags: { playwrightFallback: true } });
  const media = await manager.resolveOne("https://js-seite.example/player", context);
  assert.equal(media.provider, "yt-dlp", "it still tries yt-dlp first");

  const nichtUnterstuetzt = new Error("ERROR: Unsupported URL: https://js-seite.example/player");
  let aufruf = 0;
  const aufrufe = [];
  const result = await runDownloadCascade({
    media,
    options: { ...optionen, format: "mp4", playwrightFallback: true },
    deps: { impersonateAvailable: false, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload: async (_candidate, opts) => {
      aufrufe.push(opts.url);
      if (++aufruf <= 2) throw nichtUnterstuetzt;
      return "C:/Downloads/live.mp4";
    },
    resolveStream: (url) => manager.resolveProvider(url, context, { only: ["playwright-sniffer"] })
  });

  assert.equal(result.ok, true);
  assert.deepEqual(aufrufe, [
    "https://js-seite.example/player",
    "https://js-seite.example/player",
    "https://cdn.beispiel.example/live.m3u8"
  ]);
});

test("unresolvable inputs report UNSUPPORTED_URL (main.js then passes them to yt-dlp)", async () => {
  const manager = createDefaultResolverManager({ cache: null });
  await assert.rejects(
    () => manager.resolveOne("ytsearch:katzenvideos", createResolveContext({})),
    (err) => err.code === ResolveErrorCode.UNSUPPORTED_URL
  );
});

test("the complete flow is logged without secrets", async () => {
  const zeilen = [];
  const logger = createLogger({ sink: (line) => zeilen.push(line) });
  const manager = createDefaultResolverManager({ cache: null });
  await manager.resolve("https://www.youtube.com/watch?v=abc&token=eyJhbGciOi", createResolveContext({
    logger,
    auth: { type: "cookies", cookiesFromBrowser: "chrome" }
  }));

  const text = zeilen.join("\n");
  assert.doesNotMatch(text, /eyJhbGciOi/);
  assert.deepEqual(
    logger.entries().map((e) => e.step).filter((s) => !s.startsWith("resolver-")),
    ["input", "site-detected", "provider-detected", "result"]
  );
});

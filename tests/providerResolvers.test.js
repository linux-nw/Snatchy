const test = require("node:test");
const assert = require("node:assert/strict");

const { DirectMediaProviderResolver } = require("../src/providers/DirectMediaProviderResolver");
const { YtDlpProviderResolver } = require("../src/providers/YtDlpProviderResolver");
const { PlaywrightProviderResolver } = require("../src/providers/PlaywrightProviderResolver");
const { createProviderRegistry } = require("../src/providers");
const { createResolveContext } = require("../src/core/ResolveContext");
const { ResolveErrorCode } = require("../src/core/errors");

test("ProviderResolver detection: direct media files", () => {
  const resolver = new DirectMediaProviderResolver();
  for (const url of [
    "https://cdn.example.com/folge1.mp3",
    "https://cdn.example.com/clip.mp4",
    "https://cdn.example.com/stream.m3u8",
    "https://cdn.example.com/stream.mpd?token=abc",
    "https://cdn.example.com/audio.m4a"
  ]) {
    assert.equal(resolver.canHandle(url), true, url);
  }
  for (const url of [
    "https://www.youtube.com/watch?v=abc",
    "https://example.com/seite.html",
    "https://example.com/",
    "kein-url-string"
  ]) {
    assert.equal(resolver.canHandle(url), false, url);
  }
});

test("direct media are normalized to ResolvedMedia", async () => {
  const resolver = new DirectMediaProviderResolver();
  const media = await resolver.resolve("https://cdn.example.com/folge1.mp3");
  assert.equal(media.mediaUrl, "https://cdn.example.com/folge1.mp3");
  assert.equal(media.provider, "direct");
  assert.equal(media.formats[0].ext, "mp3");
});

test("the yt-dlp resolver passes the URL unchanged and does not probe", async () => {
  const resolver = new YtDlpProviderResolver();
  assert.equal(resolver.canHandle("https://www.youtube.com/watch?v=abc"), true);
  const media = await resolver.resolve("https://www.youtube.com/watch?v=abc", { auth: { type: "cookies" } });
  assert.equal(media.mediaUrl, "https://www.youtube.com/watch?v=abc");
  assert.equal(media.provider, "yt-dlp");
  // Only the kind of auth, never its content.
  assert.equal(media.meta.authType, "cookies");
  assert.equal(media.meta.cookies, undefined);
});

test("the browser extraction only runs with the switch enabled", async () => {
  const resolver = new PlaywrightProviderResolver({
    findStream: async () => "https://cdn.example.com/live.m3u8"
  });
  const aus = createResolveContext({ flags: { playwrightFallback: false } });
  await assert.rejects(
    () => resolver.resolve("https://example.com/video", aus),
    (err) => err.code === ResolveErrorCode.UNSUPPORTED_URL
  );

  const an = createResolveContext({ flags: { playwrightFallback: true } });
  const media = await resolver.resolve("https://example.com/video", an);
  assert.equal(media.mediaUrl, "https://cdn.example.com/live.m3u8");
  assert.equal(media.provider, "playwright");
});

test("no stream found stays distinguishable", async () => {
  const resolver = new PlaywrightProviderResolver({ findStream: async () => null });
  const context = createResolveContext({ flags: { playwrightFallback: true } });
  await assert.rejects(
    () => resolver.resolve("https://example.com/video", context),
    (err) => {
      assert.equal(err.code, ResolveErrorCode.EXTRACTION_FAILED);
      assert.equal(err.details.reason, "PLAYWRIGHT_NO_STREAM");
      return true;
    }
  );
});

test("missing Playwright setup is reported as DEPENDENCY_MISSING", async () => {
  const resolver = new PlaywrightProviderResolver({
    findStream: async () => {
      throw Object.assign(new Error("Playwright nicht installiert."), { code: "PLAYWRIGHT_MISSING" });
    }
  });
  const context = createResolveContext({ flags: { playwrightFallback: true } });
  await assert.rejects(
    () => resolver.resolve("https://example.com/video", context),
    (err) => {
      assert.equal(err.code, ResolveErrorCode.DEPENDENCY_MISSING);
      assert.equal(err.details.setup, "PLAYWRIGHT_MISSING");
      return true;
    }
  );
});

test("a cancelled operation does not start a browser", async () => {
  let gestartet = false;
  const resolver = new PlaywrightProviderResolver({
    findStream: async () => { gestartet = true; return null; }
  });
  const controller = new AbortController();
  controller.abort();
  const context = createResolveContext({
    flags: { playwrightFallback: true },
    signal: controller.signal
  });
  await assert.rejects(
    () => resolver.resolve("https://example.com/video", context),
    (err) => err.code === ResolveErrorCode.CANCELLED
  );
  assert.equal(gestartet, false);
});

test("Provider priority: direct before yt-dlp before browser", () => {
  const registry = createProviderRegistry();
  assert.deepEqual(
    registry.match("https://cdn.example.com/folge1.mp3").map((r) => r.name),
    ["direct-media", "yt-dlp", "playwright-sniffer"]
  );
  assert.deepEqual(
    registry.match("https://www.youtube.com/watch?v=abc").map((r) => r.name),
    ["yt-dlp", "playwright-sniffer"]
  );
});

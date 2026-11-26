const test = require("node:test");
const assert = require("node:assert/strict");

const { ResolverManager } = require("../src/core/ResolverManager");
const { createDefaultResolverManager } = require("../src/core/setup");
const { ResolverRegistry } = require("../src/core/registry");
const { ResolverCache } = require("../src/cache/ResolverCache");
const { createResolveContext } = require("../src/core/ResolveContext");
const { createLogger } = require("../src/core/logger");
const { ResolveError, ResolveErrorCode } = require("../src/core/errors");

const siteStub = (name, priority, resolve, canHandle = () => true) => ({
  name, priority, canHandle, resolve
});

const managerWith = (sites, providers, options = {}) => new ResolverManager({
  sites: new ResolverRegistry({ kind: "SiteResolver" }).registerAll(sites),
  providers: new ResolverRegistry({ kind: "ProviderResolver" }).registerAll(providers),
  cache: options.cache === undefined ? null : options.cache
});

test("the pipeline normalizes site and provider result to ResolvedMedia", async () => {
  const manager = managerWith(
    [siteStub("site", 50, async (url) => [{
      sourceUrl: url,
      providerUrl: "https://hoster.example/embed/1",
      title: "Titel von der Seite",
      unbekanntesFeld: "wird verworfen"
    }])],
    [siteStub("hoster", 50, async (url) => ({
      sourceUrl: url,
      mediaUrl: "https://cdn.example/1.mp4",
      provider: "hoster",
      duration: "125.5",
      formats: [{ format_id: "hd", ext: "mp4", height: "1080" }]
    }))]
  );

  const media = await manager.resolveOne("https://seite.example/video/1", createResolveContext({}));
  assert.deepEqual(media, {
    sourceUrl: "https://seite.example/video/1",
    providerUrl: "https://hoster.example/embed/1",
    mediaUrl: "https://cdn.example/1.mp4",
    title: "Titel von der Seite",
    duration: 125.5,
    formats: [{ formatId: "hd", ext: "mp4", height: 1080 }],
    provider: "hoster",
    resolver: "hoster"
  });
});

test("several providers on one page are all resolved", async () => {
  const manager = managerWith(
    [siteStub("site", 50, async (url) => [
      { sourceUrl: url, providerUrl: "https://a.example/1", title: "Teil 1" },
      { sourceUrl: url, providerUrl: "https://b.example/2", title: "Teil 2" },
      { sourceUrl: url, providerUrl: "https://c.example/3", title: "Teil 3" }
    ])],
    [siteStub("hoster", 50, async (url) => ({ sourceUrl: url, mediaUrl: `${url}.mp4`, provider: "hoster" }))]
  );

  const media = await manager.resolve("https://seite.example/folge", createResolveContext({}));
  assert.equal(media.length, 3);
  assert.deepEqual(media.map((m) => m.title), ["Teil 1", "Teil 2", "Teil 3"]);
  assert.deepEqual(media.map((m) => m.mediaUrl), [
    "https://a.example/1.mp4",
    "https://b.example/2.mp4",
    "https://c.example/3.mp4"
  ]);
});

test("a single broken candidate does not drag the others down", async () => {
  const manager = managerWith(
    [siteStub("site", 50, async (url) => [
      { sourceUrl: url, providerUrl: "https://kaputt.example/1" },
      { sourceUrl: url, providerUrl: "https://gut.example/2" }
    ])],
    [siteStub("hoster", 50, async (url) => {
      if (url.includes("kaputt")) throw new Error("HTTP Error 500");
      return { sourceUrl: url, mediaUrl: `${url}.mp4`, provider: "hoster" };
    })]
  );

  const media = await manager.resolve("https://seite.example/folge", createResolveContext({}));
  assert.equal(media.length, 1);
  assert.equal(media[0].mediaUrl, "https://gut.example/2.mp4");
});

test("resolvers are tested by priority, the first hit wins", async () => {
  const versuche = [];
  const manager = managerWith(
    [
      siteStub("spezial", 90, async (url) => { versuche.push("spezial"); return [{ sourceUrl: url, mediaUrl: `${url}#spezial` }]; }),
      siteStub("generisch", 1, async (url) => { versuche.push("generisch"); return [{ sourceUrl: url, mediaUrl: url }]; })
    ],
    [siteStub("p", 50, async (url) => ({ sourceUrl: url, mediaUrl: url }))]
  );

  const media = await manager.resolveOne("https://seite.example/x", createResolveContext({}));
  assert.deepEqual(versuche, ["spezial"]);
  assert.match(media.mediaUrl, /#spezial$/);
});

test("if a resolver fails, the next one takes over (fallback)", async () => {
  const versuche = [];
  const manager = managerWith(
    [
      siteStub("spezial", 90, async () => { versuche.push("spezial"); throw new Error("Unable to download webpage"); }),
      siteStub("generisch", 1, async (url) => { versuche.push("generisch"); return [{ sourceUrl: url, providerUrl: url }]; })
    ],
    [siteStub("p", 50, async (url) => ({ sourceUrl: url, mediaUrl: url, provider: "p" }))]
  );

  const media = await manager.resolveOne("https://seite.example/x", createResolveContext({}));
  assert.deepEqual(versuche, ["spezial", "generisch"]);
  assert.equal(media.provider, "p");
});

test("AUTH_REQUIRED is preserved up to the caller", async () => {
  const manager = managerWith(
    [siteStub("site", 50, async (url) => [{ sourceUrl: url, providerUrl: url }])],
    [
      siteStub("hoster", 50, async () => {
        throw new ResolveError(ResolveErrorCode.AUTH_REQUIRED, "Für dieses Video ist eine Anmeldung nötig.");
      }),
      siteStub("notnagel", 10, async () => {
        throw new ResolveError(ResolveErrorCode.EXTRACTION_FAILED, "nichts gefunden");
      })
    ]
  );

  await assert.rejects(
    () => manager.resolve("https://seite.example/privat", createResolveContext({})),
    (err) => {
      assert.equal(err.code, ResolveErrorCode.AUTH_REQUIRED);
      assert.match(err.message, /Anmeldung/);
      return true;
    }
  );
});

test("SESSION_EXPIRED is not watered down to a general error", async () => {
  const manager = managerWith(
    [siteStub("site", 50, async (url) => [{ sourceUrl: url, providerUrl: url }])],
    [siteStub("hoster", 50, async () => {
      throw new ResolveError(ResolveErrorCode.SESSION_EXPIRED, "Die gespeicherte Session ist abgelaufen.");
    })]
  );

  await assert.rejects(
    () => manager.resolve("https://seite.example/x", createResolveContext({})),
    (err) => err.code === ResolveErrorCode.SESSION_EXPIRED
  );
});

test("network errors of a resolver keep their code", async () => {
  const manager = managerWith(
    [siteStub("site", 50, async () => { throw new Error("getaddrinfo ENOTFOUND seite.example"); })],
    [siteStub("hoster", 50, async (url) => ({ sourceUrl: url, mediaUrl: url }))]
  );

  await assert.rejects(
    () => manager.resolve("https://seite.example/x", createResolveContext({})),
    (err) => err.code === ResolveErrorCode.NETWORK_ERROR
  );
});

test("invalid URLs are rejected", async () => {
  const manager = createDefaultResolverManager({ cache: null });
  for (const url of ["", "   ", "nur-text", "ftp://example.com/x", "javascript:alert(1)"]) {
    await assert.rejects(
      () => manager.resolve(url, createResolveContext({})),
      (err) => err.code === ResolveErrorCode.UNSUPPORTED_URL,
      `sollte abgelehnt werden: ${url}`
    );
  }
});

test("without a matching resolver there is UNSUPPORTED_URL", async () => {
  const manager = managerWith(
    [siteStub("site", 50, async (url) => [{ sourceUrl: url, providerUrl: url }], (url) => url.includes("seite.example"))],
    [siteStub("hoster", 50, async (url) => ({ sourceUrl: url, mediaUrl: url }), () => false)]
  );

  await assert.rejects(
    () => manager.resolve("https://andere.example/x", createResolveContext({})),
    (err) => err.code === ResolveErrorCode.UNSUPPORTED_URL
  );
});

test("only restricts to a specific resolver", async () => {
  const versuche = [];
  const manager = managerWith(
    [
      siteStub("podcast", 90, async () => { versuche.push("podcast"); throw new Error("kein Feed"); }),
      siteStub("generisch", 1, async (url) => { versuche.push("generisch"); return [{ sourceUrl: url, providerUrl: url }]; })
    ],
    [siteStub("p", 50, async (url) => ({ sourceUrl: url, mediaUrl: url }))]
  );

  await assert.rejects(
    () => manager.resolveSite("https://seite.example/x", createResolveContext({}), { only: ["podcast"] })
  );
  assert.deepEqual(versuche, ["podcast"], "no fallback to the generic resolver");
});

test("the flow is logged step by step", async () => {
  const logger = createLogger({ sink: () => {} });
  const manager = managerWith(
    [siteStub("site", 50, async (url) => [{ sourceUrl: url, providerUrl: "https://hoster.example/1" }])],
    [siteStub("hoster", 50, async (url) => ({ sourceUrl: url, mediaUrl: `${url}.mp4`, provider: "hoster" }))]
  );

  await manager.resolve("https://seite.example/x", createResolveContext({ logger }));
  const steps = logger.entries().map((e) => e.step);
  assert.deepEqual(steps.filter((s) => !s.startsWith("resolver-")), [
    "input", "site-detected", "provider-detected", "result"
  ]);
});

test("results are cached, but not with active auth", async () => {
  let aufrufe = 0;
  const cache = new ResolverCache();
  const manager = managerWith(
    [siteStub("site", 50, async (url) => [{ sourceUrl: url, providerUrl: "https://hoster.example/1" }])],
    [siteStub("hoster", 50, async (url) => { aufrufe++; return { sourceUrl: url, mediaUrl: `${url}.mp4` }; })],
    { cache }
  );

  await manager.resolve("https://seite.example/x", createResolveContext({}));
  await manager.resolve("https://seite.example/x", createResolveContext({}));
  assert.equal(aufrufe, 1, "second run comes from the cache");

  await manager.resolve("https://seite.example/x", createResolveContext({
    auth: { type: "cookies", cookiesFromBrowser: "chrome" }
  }));
  assert.equal(aufrufe, 2, "with auth the cache is bypassed");
});

test("the default pipeline passes a video URL to yt-dlp unchanged", async () => {
  const manager = createDefaultResolverManager({ cache: null });
  const media = await manager.resolveOne(
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    createResolveContext({})
  );
  assert.equal(media.mediaUrl, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(media.provider, "yt-dlp");
});

test("the default pipeline recognizes a direct media file", async () => {
  const manager = createDefaultResolverManager({ cache: null });
  const media = await manager.resolveOne("https://cdn.example.com/folge1.mp3", createResolveContext({}));
  assert.equal(media.provider, "direct");
  assert.equal(media.mediaUrl, "https://cdn.example.com/folge1.mp3");
});

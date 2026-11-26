const test = require("node:test");
const assert = require("node:assert/strict");

const { createLogger, redact, redactUrl, redactHeaders, REDACTED } = require("../src/core/logger");
const { createResolveContext } = require("../src/core/ResolveContext");
const { ResolverManager } = require("../src/core/ResolverManager");
const { ResolverRegistry } = require("../src/core/registry");

const GEHEIMNISSE = ["streng-geheim", "sid=abc123", "Bearer xyz", "hunter2", "eyJhbGciOi"];

const enthaeltKeinGeheimnis = (text) => {
  for (const geheim of GEHEIMNISSE) {
    assert.doesNotMatch(text, new RegExp(geheim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Secret in log: ${geheim}`);
  }
};

test("signatures and tokens are removed from URLs", () => {
  const url = redactUrl("https://cdn.example.com/v.m3u8?token=eyJhbGciOi&sig=abc&expires=123");
  assert.match(url, /token=%5Bredacted%5D|token=\[redacted\]/);
  assert.match(url, /sig=%5Bredacted%5D|sig=\[redacted\]/);
  assert.match(url, /expires=123/, "harmless parameters are kept");
});

test("credentials in the URL are removed", () => {
  assert.equal(
    redactUrl("https://nutzer:hunter2@example.com/feed.xml"),
    "https://example.com/feed.xml"
  );
});

test("sensitive headers are masked, the names stay", () => {
  const headers = redactHeaders({ cookie: "sid=abc123", authorization: "Bearer xyz", accept: "*/*" });
  assert.equal(headers.cookie, REDACTED);
  assert.equal(headers.authorization, REDACTED);
  assert.equal(headers.accept, "*/*");
});

test("redact cleans up nested structures", () => {
  const gesaeubert = redact({
    url: "https://example.com/x?token=eyJhbGciOi",
    auth: { type: "cookies", cookies: [{ name: "sid", value: "streng-geheim" }] },
    headers: { cookie: "sid=abc123" },
    verschachtelt: { password: "hunter2", harmlos: 1 }
  });

  enthaeltKeinGeheimnis(JSON.stringify(gesaeubert));
  assert.equal(gesaeubert.auth.cookies, `${REDACTED} (1)`);
  assert.equal(gesaeubert.verschachtelt.password, REDACTED);
  assert.equal(gesaeubert.verschachtelt.harmlos, 1);
});

test("the logger writes lines without secrets into the sink", () => {
  const zeilen = [];
  const logger = createLogger({ sink: (line) => zeilen.push(line) });
  logger.step("resolver-try", {
    resolver: "hoster",
    url: "https://cdn.example.com/v.m3u8?token=eyJhbGciOi",
    headers: { cookie: "sid=abc123" },
    auth: { type: "cookies", cookies: [{ name: "sid", value: "streng-geheim" }] }
  });

  const text = zeilen.join("\n") + JSON.stringify(logger.entries());
  enthaeltKeinGeheimnis(text);
  assert.match(zeilen[0], /resolver=hoster/);
});

test("a faulty sink does not crash the resolution", () => {
  const logger = createLogger({ sink: () => { throw new Error("Senke kaputt"); } });
  assert.doesNotThrow(() => logger.step("input", { url: "https://example.com" }));
  assert.equal(logger.entries().length, 1);
});

test("a complete run does not log cookies", async () => {
  const zeilen = [];
  const logger = createLogger({ sink: (line) => zeilen.push(line) });
  const manager = new ResolverManager({
    sites: new ResolverRegistry().register({
      name: "site",
      priority: 50,
      canHandle: () => true,
      resolve: async (url) => [{ sourceUrl: url, providerUrl: "https://hoster.example/1?sig=abc" }]
    }),
    providers: new ResolverRegistry().register({
      name: "hoster",
      priority: 50,
      canHandle: () => true,
      resolve: async (url) => ({
        sourceUrl: url,
        mediaUrl: "https://cdn.example.com/v.m3u8?token=eyJhbGciOi",
        provider: "hoster"
      })
    }),
    cache: null
  });

  const context = createResolveContext({
    logger,
    auth: { type: "cookies", cookies: [{ name: "sid", value: "streng-geheim" }], cookiesFromBrowser: "chrome" },
    headers: { cookie: "sid=abc123" }
  });
  await manager.resolve("https://seite.example/x", context);

  const text = zeilen.join("\n") + JSON.stringify(logger.entries());
  enthaeltKeinGeheimnis(text);
  assert.ok(zeilen.some((l) => l.includes("site-detected")));
  assert.ok(zeilen.some((l) => l.includes("result")));
});

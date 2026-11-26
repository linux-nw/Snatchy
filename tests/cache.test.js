const test = require("node:test");
const assert = require("node:assert/strict");

const { ResolverCache, assertCacheable } = require("../src/cache/ResolverCache");

test("values expire after the TTL", () => {
  let jetzt = 0;
  const cache = new ResolverCache({ ttlMs: 100, now: () => jetzt });
  cache.set("provider:https://x.de/1", { provider: "direct" });

  assert.deepEqual(cache.get("provider:https://x.de/1"), { provider: "direct" });
  jetzt = 101;
  assert.equal(cache.get("provider:https://x.de/1"), undefined);
});

test("the detected responsibility lasts longer than the result", () => {
  let jetzt = 0;
  const cache = new ResolverCache({ ttlMs: 100, detectionTtlMs: 10_000, now: () => jetzt });
  cache.set("provider:https://x.de/1", { provider: "direct" });
  cache.rememberDetection("site", "https://x.de/1", "podcast-rss");

  jetzt = 500;
  assert.equal(cache.get("provider:https://x.de/1"), undefined);
  assert.equal(cache.recallDetection("site", "https://x.de/1"), "podcast-rss");
});

test("auth material is not cached", () => {
  const cache = new ResolverCache();
  assert.throws(() => cache.set("k", { cookies: [{ name: "sid", value: "x" }] }), /auth material/);
  assert.throws(() => cache.set("k", { meta: { token: "abc" } }), /auth material/);
  assert.throws(() => cache.set("k", { a: { b: { sessionId: "s" } } }), /auth material/);
  assert.doesNotThrow(() => cache.set("k", { provider: "direct", title: "Folge 1" }));
});

test("assertCacheable also checks lists", () => {
  assert.throws(() => assertCacheable([{ ok: 1 }, { password: "x" }]), /auth material/);
});

test("the cache returns copies", () => {
  const cache = new ResolverCache();
  const original = { provider: "direct", formats: [{ ext: "mp4" }] };
  cache.set("k", original);
  const geholt = cache.get("k");
  geholt.formats[0].ext = "verändert";
  assert.equal(cache.get("k").formats[0].ext, "mp4");
});

test("the cache limits its size", () => {
  const cache = new ResolverCache({ maxEntries: 3 });
  for (let i = 0; i < 5; i++) cache.set(`k${i}`, { i });
  assert.equal(cache.stats().size, 3);
  assert.equal(cache.get("k0"), undefined);
  assert.deepEqual(cache.get("k4"), { i: 4 });
});

test("hits and misses are counted", () => {
  const cache = new ResolverCache();
  cache.set("k", { a: 1 });
  cache.get("k");
  cache.get("weg");
  assert.deepEqual(cache.stats(), { size: 1, hits: 1, misses: 1 });
  cache.clear();
  assert.deepEqual(cache.stats(), { size: 0, hits: 0, misses: 0 });
});

test("the key ignores the fragment", () => {
  assert.equal(
    ResolverCache.keyFor("site", "https://x.de/1#t=10"),
    ResolverCache.keyFor("site", "https://x.de/1")
  );
});

test("TTL 0 stores nothing", () => {
  const cache = new ResolverCache({ ttlMs: 0 });
  cache.set("k", { a: 1 });
  assert.equal(cache.get("k"), undefined);
});

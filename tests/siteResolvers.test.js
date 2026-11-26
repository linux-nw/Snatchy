const test = require("node:test");
const assert = require("node:assert/strict");

const { PodcastFeedSiteResolver, looksLikePodcastFeed } = require("../src/sites/PodcastFeedSiteResolver");
const { GenericPageSiteResolver } = require("../src/sites/GenericPageSiteResolver");
const { createSiteRegistry } = require("../src/sites");
const { createResolveContext } = require("../src/core/ResolveContext");
const { ResolveErrorCode } = require("../src/core/errors");

const FEED_XML = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Beispiel-Podcast</title>
    <itunes:image href="https://cdn.example.com/cover.jpg"/>
    <item>
      <title><![CDATA[Folge 2 & mehr]]></title>
      <pubDate>Tue, 05 Aug 2025 06:00:00 +0000</pubDate>
      <itunes:duration>01:02:03</itunes:duration>
      <enclosure url="https://cdn.example.com/folge2.mp3" type="audio/mpeg"/>
    </item>
    <item>
      <title>Folge 1</title>
      <pubDate>Tue, 29 Jul 2025 06:00:00 +0000</pubDate>
      <itunes:duration>95</itunes:duration>
      <enclosure url="https://cdn.example.com/folge1.mp3" type="audio/mpeg"/>
    </item>
    <item>
      <title>Ohne Audio</title>
    </item>
  </channel>
</rss>`;

const feedContext = (impl) => createResolveContext({ services: { http: impl } });
const okResponse = (body) => async () => ({ ok: true, status: 200, text: async () => body });

test("SiteResolver detection: feeds are detected, video pages are not", () => {
  const resolver = new PodcastFeedSiteResolver();
  for (const url of [
    "https://feeds.example.com/show",
    "https://feed.example.com/show",
    "https://example.com/podcast.xml",
    "https://example.com/show/rss",
    "https://anchor.fm/s/1234/podcast/rss"
  ]) {
    assert.equal(resolver.canHandle(url), true, url);
  }
  for (const url of [
    "https://www.youtube.com/watch?v=abc",
    "https://example.com/video/123",
    "nicht-mal-eine-url",
    ""
  ]) {
    assert.equal(resolver.canHandle(url), false, url);
  }
  assert.equal(looksLikePodcastFeed("https://feeds.example.com/show"), true);
});

test("several provider references from one page", async () => {
  const resolver = new PodcastFeedSiteResolver();
  const media = await resolver.resolve("https://feeds.example.com/show", feedContext(okResponse(FEED_XML)));

  assert.equal(media.length, 2, "the entry without enclosure is skipped");
  assert.equal(media[0].title, "Folge 2 & mehr");
  assert.equal(media[0].providerUrl, "https://cdn.example.com/folge2.mp3");
  assert.equal(media[0].sourceUrl, "https://feeds.example.com/show");
  assert.equal(media[0].duration, 3723);
  assert.equal(media[0].thumbnail, "https://cdn.example.com/cover.jpg");
  assert.equal(media[0].meta.pubDate, "Tue, 05 Aug 2025 06:00:00 +0000");
  assert.equal(media[1].duration, 95);
  // SiteResolvers do not deliver a finished media URL yet.
  assert.equal(media[0].mediaUrl, undefined);
});

test("network error is reported as NETWORK_ERROR", async () => {
  const resolver = new PodcastFeedSiteResolver();
  const context = feedContext(async () => { throw new Error("getaddrinfo ENOTFOUND feeds.example.com"); });
  await assert.rejects(
    () => resolver.resolve("https://feeds.example.com/show", context),
    (err) => {
      assert.equal(err.code, ResolveErrorCode.NETWORK_ERROR);
      assert.match(err.message, /nicht erreichbar/);
      return true;
    }
  );
});

test("401 from the feed means AUTH_REQUIRED", async () => {
  const resolver = new PodcastFeedSiteResolver();
  const context = feedContext(async () => ({ ok: false, status: 401, text: async () => "" }));
  await assert.rejects(
    () => resolver.resolve("https://feeds.example.com/privat", context),
    (err) => err.code === ResolveErrorCode.AUTH_REQUIRED
  );
});

test("invalid feed is reported as EXTRACTION_FAILED", async () => {
  const resolver = new PodcastFeedSiteResolver();
  const context = feedContext(okResponse("<html><body>keine Episoden</body></html>"));
  await assert.rejects(
    () => resolver.resolve("https://feeds.example.com/show", context),
    (err) => {
      assert.equal(err.code, ResolveErrorCode.EXTRACTION_FAILED);
      assert.match(err.message, /Kein gültiger Podcast-RSS-Feed/);
      return true;
    }
  );
});

test("the episode count is limited", async () => {
  const item = '<item><title>x</title><enclosure url="https://cdn.example.com/x.mp3"/></item>';
  const resolver = new PodcastFeedSiteResolver({ maxEpisodes: 5 });
  const media = await resolver.resolve(
    "https://feeds.example.com/show",
    feedContext(okResponse(`<rss><channel>${item.repeat(50)}</channel></rss>`))
  );
  assert.equal(media.length, 5);
});

test("the generic SiteResolver passes the URL on unchanged", async () => {
  const resolver = new GenericPageSiteResolver();
  assert.equal(resolver.canHandle("https://www.youtube.com/watch?v=abc"), true);
  assert.equal(resolver.canHandle("ftp://example.com/x"), false);
  const media = await resolver.resolve("https://www.youtube.com/watch?v=abc");
  assert.deepEqual(media, [{
    sourceUrl: "https://www.youtube.com/watch?v=abc",
    providerUrl: "https://www.youtube.com/watch?v=abc"
  }]);
});

test("the default registry tests the feed resolver before the generic one", () => {
  const registry = createSiteRegistry();
  assert.deepEqual(
    registry.match("https://feeds.example.com/show").map((r) => r.name),
    ["podcast-rss", "generic-page"]
  );
  assert.deepEqual(
    registry.match("https://www.youtube.com/watch?v=abc").map((r) => r.name),
    ["generic-page"]
  );
});

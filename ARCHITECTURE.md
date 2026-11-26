# Architecture: Media Resolution

The goal of this structure is to be able to add new sites and hosts without
touching `src/main.js` or the downloader.

```
Input URL
  -> SiteResolver        recognizes the site, finds provider/host links
  -> Provider URL(s)
  -> ProviderResolver    resolves a host URL to a media URL
  -> ResolvedMedia       uniform result
  -> Downloader          yt-dlp cascade, only knows ResolvedMedia
```

## Directories

```
src/
  core/
    types.js            ResolvedMedia/MediaFormat + normalization
    errors.js           ResolveError + error codes + classification
    ResolveContext.js   Auth, headers, signal, services, logger, cache
    registry.js         ResolverRegistry (selection by canHandle + priority)
    ResolverManager.js  Site -> Provider pipeline
    FallbackManager.js  generic stage pipeline
    logger.js           structured logging incl. redaction
    setup.js            assembles the default pipeline
  sites/                SiteResolver (podcast-rss, generic-page)
  providers/            ProviderResolver (direct-media, yt-dlp, playwright-sniffer)
  auth/                 AuthContext, SessionStore (memory only)
  cache/                ResolverCache (short TTL, no auth data)
  downloader/           yt-dlp arguments and the 5-stage download cascade
tests/                  node:test, no additional dependencies
```

## Adding a new SiteResolver

A SiteResolver recognizes an overview or video page and returns
media references. It downloads nothing and does not resolve a media URL yet.

1. Create the file `src/sites/MySiteSiteResolver.js`:

```js
const { SiteResolver } = require("./SiteResolver");
const { hostMatches } = require("../core/types");
const { ResolveError, ResolveErrorCode } = require("../core/errors");

class MySiteSiteResolver extends SiteResolver {
  constructor() {
    // Higher priority = tested before more general resolvers.
    // Reference: podcast-rss 90, generic-page 1.
    super({ name: "my-site", priority: 70 });
  }

  canHandle(url) {
    return hostMatches(url, ["my-site.example"]);
  }

  async resolve(url, context) {
    context.throwIfAborted();
    const res = await context.fetch(url);           // HTTP via the context
    if (res.status === 403) {
      throw new ResolveError(ResolveErrorCode.AUTH_REQUIRED, "Login required.", { resolver: this.name, url });
    }
    const html = await res.text();

    // Several hits are allowed: one entry per host link found.
    return [...html.matchAll(/data-embed="([^"]+)"/g)].map((m) => ({
      sourceUrl: url,
      providerUrl: m[1],
      title: "..."
    }));
  }
}

module.exports = { MySiteSiteResolver };
```

2. Add it in `src/sites/index.js` in `createSiteRegistry()` (before
   `GenericPageSiteResolver`; the order in the array does not matter, only
   `priority` counts).

3. Add tests in `tests/`: `canHandle` for hits and non-hits,
   parsing of several links, and the expected error behavior.

Return fields: `sourceUrl` (required), `providerUrl`, `title`, `thumbnail`,
`duration`, `meta`. If you already have a finished media URL, set `mediaUrl`.
The manager then skips the provider step.

## Adding a new ProviderResolver

A ProviderResolver gets a host URL and returns exactly one
`ResolvedMedia` with `mediaUrl`.

1. Create the file `src/providers/MyHosterProviderResolver.js`:

```js
const { ProviderResolver } = require("./ProviderResolver");
const { hostMatches } = require("../core/types");
const { requireAuth } = require("../auth/AuthContext");

class MyHosterProviderResolver extends ProviderResolver {
  constructor() {
    // direct-media 80, yt-dlp 10 (catch-all), playwright-sniffer 5.
    // Anything that can do more than yt-dlp sits above it.
    super({ name: "my-hoster", priority: 60 });
  }

  canHandle(url) {
    return hostMatches(url, ["hoster.example"]);
  }

  async resolve(url, context) {
    if (context.auth.type === "none" && /premium/.test(url)) {
      throw requireAuth("This video is only available with login.", { resolver: this.name, url });
    }
    return {
      sourceUrl: url,
      mediaUrl: "https://cdn.hoster.example/stream.m3u8",
      provider: "my-hoster",
      formats: [{ ext: "m3u8", note: "HLS" }]
    };
  }
}

module.exports = { MyHosterProviderResolver };
```

2. Add it in `src/providers/index.js` in `createProviderRegistry()`.

3. Add tests: detection, normalization, and the error codes.

## Error codes

Resolvers throw `ResolveError` with a code instead of just a text message:

| Code | Meaning |
| --- | --- |
| `UNSUPPORTED_URL` | this resolver is not responsible / no extractor |
| `AUTH_REQUIRED` | not available without login/cookies |
| `SESSION_EXPIRED` | existing session/cookies have expired |
| `CAPTCHA_REQUIRED` | a bot check is in the way |
| `GEO_RESTRICTED` | blocked in the current country |
| `PROVIDER_ERROR` | host responds with an error/block (4xx, 5xx, Cloudflare) |
| `EXTRACTION_FAILED` | site reachable, but nothing usable found |
| `NETWORK_ERROR` | DNS/timeout/connection |
| `DEPENDENCY_MISSING` | yt-dlp/Playwright missing (addition for this project) |
| `CANCELLED` | user cancelled, ends the pipeline immediately |

`classifyMessage()` in `src/core/errors.js` maps raw yt-dlp messages to these
codes. If several resolvers fail, `pickMostRelevantError()` picks the error that is
most helpful to the user (a login hint beats "nothing found").

## Fallback pipeline

`FallbackManager` runs stages one after another, isolates their errors and
logs every step. It is used in two places:

- `ResolverManager`: try resolver candidates by priority.
- `src/downloader/YtDlpDownloader.js`: the existing download cascade

  1. yt-dlp candidates (with impersonation, if curl_cffi is available)
  2. age-gate bypass (only where known, currently YouTube)
  3. without impersonation
  4. `--force-generic-extractor` (only on "Unsupported URL")
  5. browser/session-based extraction (only if enabled in the UI)

The log lines `[Stufe n/5] ...` have stayed unchanged.

## Auth

`ResolveContext.auth` is optional and has three forms: `none`, `cookies`,
`session`. Rules:

- Resolvers store nothing of it, they are handed it on every call.
- Passwords are not provided for in the `AuthContext`; `createAuthContext()`
  rejects fields such as `password` or `token` with an error.
- For browser cookies only the browser name is kept as a reference
  (`cookiesFromBrowser: "chrome"`), yt-dlp reads the cookies itself.
- `SessionStore` keeps session material in memory only, with a TTL and
  without any persistence.
- If permission is missing, the resolver reports `AUTH_REQUIRED` or
  `SESSION_EXPIRED` instead of simply failing.

## Cache

`ResolverCache` is optional (`createDefaultResolverManager({ cache: null })`
turns it off). Detected responsibilities (long TTL) and
resolution results (short TTL, because signed URLs expire quickly) are cached.
`set()` rejects values with cookies/tokens/session ids, and with an active
auth context the cache is not used at all.

## Logging

Every step goes through `src/core/logger.js`:

```
input -> site-detected -> provider-detected -> resolver-try
      -> resolver-ok | resolver-fail -> fallback -> result
```

Before output, `redact()` removes cookie, authorization and token values
as well as signature parameters from URLs. The test file `tests/logging.test.js` checks
this for a complete run.

## What is deliberately not done

No access protection is circumvented and no DRM is decrypted. The
Playwright resolver only observes the network requests the page makes
anyway; encrypted streams deliberately end in an error.

## Tests

```
npm test     # node:test, all files under tests/
npm run check  # syntax check of all CommonJS files
```

Covered among other things: resolver detection and priority,
fallback behavior, auth/session/network errors, invalid URLs, several
providers on one page, normalization to `ResolvedMedia`, the
download cascade stage by stage and the redaction in logging.

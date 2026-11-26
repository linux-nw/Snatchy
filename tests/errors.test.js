const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ResolveError,
  ResolveErrorCode,
  classifyMessage,
  toResolveError,
  pickMostRelevantError,
  isUnsupportedUrl,
  looksLikeBlock
} = require("../src/core/errors");

test("classifyMessage detects auth errors", () => {
  assert.equal(
    classifyMessage("ERROR: Sign in to confirm your age. Use --cookies-from-browser"),
    ResolveErrorCode.AUTH_REQUIRED
  );
  assert.equal(
    classifyMessage("This video is private"),
    ResolveErrorCode.AUTH_REQUIRED
  );
});

test("classifyMessage detects expired sessions", () => {
  assert.equal(
    classifyMessage("The provided YouTube account cookies are no longer valid"),
    ResolveErrorCode.SESSION_EXPIRED
  );
  assert.equal(classifyMessage("HTTP Error 401: Unauthorized"), ResolveErrorCode.SESSION_EXPIRED);
});

test("classifyMessage detects captcha before auth", () => {
  // Contains "Sign in", but is a bot check.
  assert.equal(
    classifyMessage("Sign in to confirm you're not a bot"),
    ResolveErrorCode.CAPTCHA_REQUIRED
  );
});

test("classifyMessage detects geo restrictions", () => {
  assert.equal(
    classifyMessage("The uploader has not made this video available in your country"),
    ResolveErrorCode.GEO_RESTRICTED
  );
});

test("classifyMessage detects network errors", () => {
  assert.equal(classifyMessage("getaddrinfo ENOTFOUND example.com"), ResolveErrorCode.NETWORK_ERROR);
  assert.equal(classifyMessage("fetch failed"), ResolveErrorCode.NETWORK_ERROR);
});

test("classifyMessage detects unsupported URLs", () => {
  assert.equal(
    classifyMessage("ERROR: Unsupported URL: https://example.com/page"),
    ResolveErrorCode.UNSUPPORTED_URL
  );
});

test("classifyMessage detects provider/block errors", () => {
  assert.equal(classifyMessage("HTTP Error 410: Gone"), ResolveErrorCode.PROVIDER_ERROR);
  assert.equal(classifyMessage("Unable to download webpage"), ResolveErrorCode.PROVIDER_ERROR);
});

test("classifyMessage falls back to EXTRACTION_FAILED", () => {
  assert.equal(classifyMessage("irgendwas ging schief"), ResolveErrorCode.EXTRACTION_FAILED);
  assert.equal(classifyMessage(""), ResolveErrorCode.EXTRACTION_FAILED);
});

test("the existing heuristics are preserved", () => {
  assert.equal(isUnsupportedUrl("ERROR: Unsupported URL: x"), true);
  assert.equal(isUnsupportedUrl("HTTP Error 403"), false);
  assert.equal(looksLikeBlock("HTTP Error 403: Forbidden"), true);
  assert.equal(looksLikeBlock("alles gut"), false);
});

test("toResolveError takes over Node error codes", () => {
  const err = Object.assign(new Error("yt-dlp wurde nicht gefunden."), { code: "ENOENT" });
  const resolved = toResolveError(err, { resolver: "yt-dlp" });
  assert.equal(resolved.code, ResolveErrorCode.DEPENDENCY_MISSING);
  assert.equal(resolved.resolver, "yt-dlp");
  assert.equal(resolved.cause, err);
});

test("toResolveError leaves structured errors unchanged", () => {
  const original = new ResolveError(ResolveErrorCode.AUTH_REQUIRED, "Login nötig");
  const resolved = toResolveError(original, { resolver: "x" });
  assert.equal(resolved, original);
  assert.equal(resolved.code, ResolveErrorCode.AUTH_REQUIRED);
  assert.equal(resolved.resolver, "x");
});

test("pickMostRelevantError prefers the most helpful statement", () => {
  const picked = pickMostRelevantError([
    new ResolveError(ResolveErrorCode.UNSUPPORTED_URL, "nicht meine Baustelle"),
    new ResolveError(ResolveErrorCode.AUTH_REQUIRED, "Login nötig"),
    new ResolveError(ResolveErrorCode.EXTRACTION_FAILED, "kaputt")
  ]);
  assert.equal(picked.code, ResolveErrorCode.AUTH_REQUIRED);
  assert.equal(pickMostRelevantError([]), null);
});

test("unknown codes are normalized to EXTRACTION_FAILED", () => {
  const err = new ResolveError("QUATSCH", "hm");
  assert.equal(err.code, ResolveErrorCode.EXTRACTION_FAILED);
});

test("cancellation is not retryable", () => {
  const err = new ResolveError(ResolveErrorCode.CANCELLED, "Vorgang abgebrochen.");
  assert.equal(err.retryable, false);
});

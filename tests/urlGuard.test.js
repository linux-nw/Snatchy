const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeHttpUrl, normalizeYtSearch, normalizeDownloadInput } = require("../src/core/urlGuard");

test("http and https are accepted and trimmed", () => {
  assert.equal(normalizeHttpUrl("https://example.com/watch?v=1"), "https://example.com/watch?v=1");
  assert.equal(normalizeHttpUrl("  http://example.com/a  "), "http://example.com/a");
});

test("other schemes are rejected", () => {
  for (const eingabe of ["file:///C:/Windows/win.ini", "ftp://example.com/a", "javascript:alert(1)", "data:text/html,x", "ytsearch:katzen", "C:\\Users\\x\\a.mp4", "/etc/passwd", "example.com/video"]) {
    assert.equal(normalizeHttpUrl(eingabe), null, eingabe);
  }
});

test("inputs that look like options are rejected", () => {
  for (const eingabe of ["--exec calc", "-o x", "--config-locations http://example.com"]) {
    assert.equal(normalizeHttpUrl(eingabe), null, eingabe);
  }
});

test("control characters, empty values and wrong types are rejected", () => {
  for (const eingabe of ["", "   ", "https://example.com/\nfoo", "https://example.com/\u0000", null, undefined, 5, {}]) {
    assert.equal(normalizeHttpUrl(eingabe), null, String(eingabe));
  }
});

test("ytsearch: valid forms are accepted", () => {
  for (const eingabe of ["ytsearch:katzenvideos", "ytsearch5:katzen videos", "ytsearch50:a", "  ytsearch1:lofi beats  "]) {
    assert.equal(normalizeYtSearch(eingabe), eingabe.trim(), eingabe);
    assert.equal(normalizeDownloadInput(eingabe), eingabe.trim(), eingabe);
  }
});

test("ytsearch: invalid forms are rejected", () => {
  const zuLang = "ytsearch:" + "a".repeat(200);
  const knappOk = "ytsearch:" + "a".repeat(191);
  assert.equal(normalizeYtSearch(knappOk), knappOk, "exactly 200 characters are allowed");
  for (const eingabe of [
    "ytsearch:", "ytsearch5:", "ytsearch5:   ", "ytsearch0:x", "ytsearch51:x", "ytsearch100:x",
    "ytsearchall:x", "ytsearchdate:x", "ytsearch-1:x", "ytsearch5 :x", "YTSEARCH:x", "ytSearch:x",
    "ytsearch:a\nb", "ytsearch:a\rb", "ytsearch:a\u0000b", "ytsearch:a\tb", "-ytsearch:x",
    "--exec ytsearch:x", "xytsearch:x", zuLang, "gvsearch:x", "ytsearch", null, undefined, 5, {}
  ]) {
    assert.equal(normalizeYtSearch(eingabe), null, String(eingabe).slice(0, 30));
    assert.equal(normalizeDownloadInput(eingabe), null, String(eingabe).slice(0, 30));
  }
});

test("normalizeDownloadInput: URLs still pass, local paths stay blocked", () => {
  assert.equal(normalizeDownloadInput("https://example.com/v"), "https://example.com/v");
  for (const eingabe of ["C:\\Users\\x\\a.mp4", "/etc/passwd", "file:///C:/Windows/win.ini", "..\\a.mp4", "\\\\server\\share\\a.mp4"]) {
    assert.equal(normalizeDownloadInput(eingabe), null, eingabe);
  }
});
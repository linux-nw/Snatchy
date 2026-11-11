const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeHttpUrl } = require("../src/core/urlGuard");

test("http und https werden akzeptiert und getrimmt", () => {
  assert.equal(normalizeHttpUrl("https://example.com/watch?v=1"), "https://example.com/watch?v=1");
  assert.equal(normalizeHttpUrl("  http://example.com/a  "), "http://example.com/a");
});

test("andere Schemata werden abgelehnt", () => {
  for (const eingabe of ["file:///C:/Windows/win.ini", "ftp://example.com/a", "javascript:alert(1)", "data:text/html,x", "ytsearch:katzen", "C:\\Users\\x\\a.mp4", "/etc/passwd", "example.com/video"]) {
    assert.equal(normalizeHttpUrl(eingabe), null, eingabe);
  }
});

test("Eingaben, die wie Optionen aussehen, werden abgelehnt", () => {
  for (const eingabe of ["--exec calc", "-o x", "--config-locations http://example.com"]) {
    assert.equal(normalizeHttpUrl(eingabe), null, eingabe);
  }
});

test("Steuerzeichen, leere und falsche Typen werden abgelehnt", () => {
  for (const eingabe of ["", "   ", "https://example.com/\nfoo", "https://example.com/\u0000", null, undefined, 5, {}]) {
    assert.equal(normalizeHttpUrl(eingabe), null, String(eingabe));
  }
});

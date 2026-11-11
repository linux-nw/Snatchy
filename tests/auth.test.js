const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createAuthContext,
  describeAuth,
  hasAuth,
  requireAuth,
  sessionExpired
} = require("../src/auth/AuthContext");
const { SessionStore } = require("../src/auth/SessionStore");
const { createResolveContext, describeContext } = require("../src/core/ResolveContext");
const { ResolveErrorCode } = require("../src/core/errors");

test("ohne Angabe gibt es keine Auth", () => {
  const auth = createAuthContext();
  assert.deepEqual(auth, { type: "none" });
  assert.equal(hasAuth(auth), false);
});

test("Cookies werden normalisiert, der Browser bleibt eine Referenz", () => {
  const auth = createAuthContext({
    type: "cookies",
    cookiesFromBrowser: "firefox",
    cookies: [
      { name: "sid", value: "abc", domain: ".example.com" },
      { name: "", value: "leer" },
      "quatsch"
    ]
  });
  assert.equal(auth.type, "cookies");
  assert.equal(auth.cookies.length, 1);
  assert.equal(auth.cookiesFromBrowser, "firefox");
});

test("Passwörter sind im AuthContext nicht vorgesehen", () => {
  for (const feld of ["password", "secret", "token", "apiKey"]) {
    assert.throws(
      () => createAuthContext({ type: "cookies", [feld]: "geheim" }),
      /nicht erlaubt/,
      feld
    );
  }
});

test("eine Session braucht eine sessionId", () => {
  assert.throws(() => createAuthContext({ type: "session" }), /sessionId/);
  assert.equal(createAuthContext({ type: "session", sessionId: "s-1" }).sessionId, "s-1");
});

test("describeAuth gibt niemals Werte preis", () => {
  const auth = createAuthContext({
    type: "cookies",
    cookiesFromBrowser: "chrome",
    cookies: [{ name: "sid", value: "streng-geheim" }]
  });
  const beschreibung = JSON.stringify(describeAuth(auth));
  assert.match(beschreibung, /cookieCount/);
  assert.doesNotMatch(beschreibung, /streng-geheim/);
});

test("Resolver können Auth-/Session-Bedarf strukturiert melden", () => {
  const auth = requireAuth("Login nötig", { resolver: "hoster" });
  assert.equal(auth.code, ResolveErrorCode.AUTH_REQUIRED);
  assert.equal(auth.details.needs, "cookies");
  assert.equal(sessionExpired().code, ResolveErrorCode.SESSION_EXPIRED);
});

test("der SessionStore hält Daten nur im Speicher und nur auf Zeit", () => {
  let jetzt = 1_000;
  const store = new SessionStore({ ttlMs: 100, now: () => jetzt });
  const id = store.create({ cookies: [{ name: "sid", value: "x" }] });

  assert.equal(store.has(id), true);
  jetzt += 101;
  assert.equal(store.get(id), null, "abgelaufene Sessions verschwinden");
  assert.equal(store.size(), 0);
  // Serialisierung enthält niemals Inhalte.
  assert.deepEqual(JSON.parse(JSON.stringify(store)), { sessions: 0, persisted: false });
});

test("der SessionStore begrenzt die Anzahl der Einträge", () => {
  const store = new SessionStore({ maxEntries: 2 });
  const a = store.create({});
  store.create({});
  store.create({});
  assert.equal(store.size(), 2);
  assert.equal(store.has(a), false, "der älteste Eintrag wird verdrängt");
});

test("der ResolveContext trennt Auth von den Resolvern", () => {
  const context = createResolveContext({
    auth: { type: "cookies", cookiesFromBrowser: "chrome" },
    headers: { "X-Test": "1", Cookie: "sid=geheim" },
    userAgent: "Snatchy/1.0"
  });

  assert.equal(context.auth.type, "cookies");
  assert.equal(context.headers["x-test"], "1");
  assert.equal(context.userAgent, "Snatchy/1.0");

  const beschreibung = JSON.stringify(describeContext(context));
  assert.match(beschreibung, /"cookie"/, "Header-Namen bleiben sichtbar");
  assert.doesNotMatch(beschreibung, /geheim/, "Header-Werte nicht");
});

test("ein abgebrochener Context meldet sich sofort", () => {
  const controller = new AbortController();
  const context = createResolveContext({ signal: controller.signal });
  assert.equal(context.isAborted(), false);
  controller.abort();
  assert.equal(context.isAborted(), true);
  assert.throws(() => context.throwIfAborted(), (err) => err.code === ResolveErrorCode.CANCELLED);
});

test("context.fetch ergänzt die Header des Contexts", async () => {
  const gesehen = [];
  const context = createResolveContext({
    headers: { "user-agent": "Snatchy/1.0" },
    services: { http: async (url, init) => { gesehen.push({ url, init }); return { ok: true }; } }
  });
  await context.fetch("https://example.com", { headers: { Accept: "application/rss+xml" } });
  assert.equal(gesehen[0].init.headers["user-agent"], "Snatchy/1.0");
  assert.equal(gesehen[0].init.headers.accept, "application/rss+xml");
});

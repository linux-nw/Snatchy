/**
 * Browser/session-based extraction: starts headless Chromium via
 * Playwright, listens to network responses and returns the first found
 * media URL (.m3u8 / .mp4 / .ts), or null.
 *
 * Taken over unchanged from main.js (only made logging optional), so that
 * the last fallback stage behaves exactly as before.
 *
 * Only what the page loads anyway is observed. No circumvention
 * of access protection, no DRM decryption.
 *
 * Throws with .code PLAYWRIGHT_MISSING / PLAYWRIGHT_CHROMIUM_MISSING when
 * the setup is missing.
 */

const findStreamWithPlaywright = async (url, sendLog = () => {}) => {
  let pw;
  try {
    pw = require("playwright");
  } catch {
    throw Object.assign(
      new Error("Playwright nicht installiert. Bitte ausführen: npm install playwright && npx playwright install chromium"),
      { code: "PLAYWRIGHT_MISSING" }
    );
  }

  let browser;
  try {
    browser = await pw.chromium.launch({ headless: true });
  } catch (err) {
    if (/executable|not found|ENOENT/i.test(err.message)) {
      throw Object.assign(
        new Error("Playwright Chromium nicht gefunden. Bitte ausführen: npx playwright install chromium"),
        { code: "PLAYWRIGHT_CHROMIUM_MISSING" }
      );
    }
    throw err;
  }

  const page = await browser.newPage();
  const mediaUrls = new Set();

  page.on("response", (res) => {
    const u = res.url();
    if (/\.m3u8(\?|$)|\.mp4(\?|$)|\.ts(\?|$)|\/manifest\b/i.test(u)) {
      mediaUrls.add(u);
    }
  });

  try {
    sendLog("Playwright: lade Seite in headless Chromium …");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(3_000);

    if (mediaUrls.size === 0) {
      sendLog("Playwright: kein Stream nach Laden – versuche Play-Klick …");
      try {
        const playEl = await page.$(
          'video, [aria-label*="play" i], [class*="play-btn" i], button[class*="play" i]'
        );
        if (playEl) {
          await playEl.click();
          await page.waitForTimeout(5_000);
        }
      } catch { /* no play element, continue */ }
    }

    // Prefer .m3u8 (HLS), then .mp4, then the rest
    const sorted = [...mediaUrls].sort((a, b) => {
      const score = (u) => (u.includes(".m3u8") ? 2 : u.includes(".mp4") ? 1 : 0);
      return score(b) - score(a);
    });
    return sorted[0] || null;
  } finally {
    await browser.close();
  }
};

module.exports = { findStreamWithPlaywright };

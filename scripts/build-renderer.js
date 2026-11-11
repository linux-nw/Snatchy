/**
 * Uebersetzt src/renderer.js (JSX) vorab nach src/generated/renderer.js.
 * Ersetzt das fruehere Babel-Standalone, das zur Laufzeit von einem CDN geladen wurde.
 * Wird von npm start, dist, dist:portable und pack automatisch aufgerufen.
 */
const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "src", "generated");
const quelle = fs.readFileSync(path.join(root, "src", "renderer.js"), "utf8");

const ergebnis = esbuild.transformSync(quelle, {
  loader: "jsx",
  target: "chrome120",
  sourcefile: "renderer.js"
});

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "renderer.js"), ergebnis.code);
process.stdout.write(`renderer.js -> src/generated/renderer.js (${ergebnis.code.length} Zeichen)\n`);

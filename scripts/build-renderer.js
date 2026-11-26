/**
 * Precompiles src/renderer.js (JSX) to src/generated/renderer.js.
 * Replaces the former Babel standalone, which was loaded from a CDN at runtime.
 * Called automatically by npm start, dist, dist:portable and pack.
 */
const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "src", "generated");
const source = fs.readFileSync(path.join(root, "src", "renderer.js"), "utf8");

const result = esbuild.transformSync(source, {
  loader: "jsx",
  target: "chrome120",
  sourcefile: "renderer.js"
});

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "renderer.js"), result.code);
process.stdout.write(`renderer.js -> src/generated/renderer.js (${result.code.length} characters)\n`);

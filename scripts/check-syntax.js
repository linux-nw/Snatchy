/**
 * Syntax check for all CommonJS files under src/, tests/ and scripts/.
 *
 * src/renderer.js is left out: the file contains JSX and is precompiled
 * by scripts/build-renderer.js (esbuild); `node --check` cannot read it.
 */

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const EXCLUDED = new Set([path.join("src", "renderer.js")]);

const collect = (dir, matches = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      collect(full, matches);
    } else if (entry.name.endsWith(".js")) {
      matches.push(full);
    }
  }
  return matches;
};

const files = [
  ...collect(path.join(root, "src")),
  ...collect(path.join(root, "tests")),
  ...collect(path.join(root, "scripts"))
].filter((file) => !EXCLUDED.has(path.relative(root, file)));

let failures = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (err) {
    failures++;
    process.stderr.write(`ERROR${path.relative(root, file)}\n${err.stderr ? err.stderr.toString() : err.message}\n`);
  }
}

console.log(`${files.length - failures}/${files.length} files pass the syntax check.`);
process.exit(failures ? 1 : 0);

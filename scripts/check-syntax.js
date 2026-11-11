/**
 * Syntaxprüfung für alle CommonJS-Dateien unter src/ und tests/.
 *
 * src/renderer.js bleibt außen vor: die Datei enthält JSX und wird vorab
 * von scripts/build-renderer.js (esbuild) übersetzt, `node --check` kann sie nicht lesen.
 */

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const AUSGENOMMEN = new Set([path.join("src", "renderer.js")]);

const sammle = (dir, treffer = []) => {
  for (const eintrag of fs.readdirSync(dir, { withFileTypes: true })) {
    const voll = path.join(dir, eintrag.name);
    if (eintrag.isDirectory()) {
      if (eintrag.name === "node_modules") continue;
      sammle(voll, treffer);
    } else if (eintrag.name.endsWith(".js")) {
      treffer.push(voll);
    }
  }
  return treffer;
};

const dateien = [
  ...sammle(path.join(root, "src")),
  ...sammle(path.join(root, "tests")),
  ...sammle(path.join(root, "scripts"))
].filter((datei) => !AUSGENOMMEN.has(path.relative(root, datei)));

let fehler = 0;
for (const datei of dateien) {
  try {
    execFileSync(process.execPath, ["--check", datei], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (err) {
    fehler++;
    process.stderr.write(`FEHLER ${path.relative(root, datei)}\n${err.stderr ? err.stderr.toString() : err.message}\n`);
  }
}

console.log(`${dateien.length - fehler}/${dateien.length} Dateien syntaktisch in Ordnung.`);
process.exit(fehler ? 1 : 0);

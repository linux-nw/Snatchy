// Lädt die externen Programme, die die App braucht, nach vendor/bin:
// yt-dlp, ffmpeg + ffprobe, deno (JS-Runtime für YouTube) und aria2c.
// electron-builder packt den Ordner über "extraResources" in den Installer,
// main.js sucht dort zuerst.
//
// Version UND SHA-256 jeder Datei sind hier fest hinterlegt. Der Download kommt
// über die feste Release-URL, die Prüfsumme stammt nicht aus der Antwort des
// Servers, sondern aus diesem Repository. Ändert sich eine Datei (oder ein
// Release wird manipuliert), bricht der Build ab.
//
// Aufruf:
//   node scripts/fetch-binaries.js [--force]   Programme laden (--force ersetzt vorhandene)
//   node scripts/fetch-binaries.js --show-latest   neueste Versionen samt Prüfsummen anzeigen,
//                                                  zum Aktualisieren der festen Werte unten
//
// Neue Version eintragen: --show-latest ausführen, die Prüfsumme gegen die vom
// Hersteller veröffentlichte Prüfsummen-Datei (yt-dlp: SHA2-256SUMS, deno:
// *.sha256sum, FFmpeg-Builds: checksums.sha256) prüfen und tag/digest/asset ersetzen.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const BIN_DIR = path.join(ROOT, "vendor", "bin");
const TMP_DIR = path.join(ROOT, "vendor", ".download");
const FORCE = process.argv.includes("--force");
const SHOW_LATEST = process.argv.includes("--show-latest");

// Festes Release (tag), feste Datei (asset), feste Prüfsumme (digest).
// Die Prüfsummen wurden gegen die Hersteller-Prüfsummendateien gegengeprüft:
//   yt-dlp  2026.10.26  SHA2-256SUMS der Release
//   deno    v2.9.8      deno-x86_64-pc-windows-msvc.zip.sha256sum der Release
//   ffmpeg  autobuild-2026-11-10-20-59  checksums.sha256 der Release
//   aria2   release-1.37.0  (keine Prüfsummen-Datei; Wert selbst berechnet)
// Hinweis: FFmpeg-Builds löschen alte datierte Releases nach einiger Zeit. Fehlt der
// Tag (HTTP 404), mit --show-latest einen aktuellen Tag samt Prüfsumme eintragen.
const SOURCES = [
  {
    name: "yt-dlp",
    repo: "yt-dlp/yt-dlp",
    tag: "2026.10.26",
    asset: "yt-dlp.exe",
    digest: "sha256:f5389d3698ecde4ef06f4e6b1ce0294fe9ac1396228c8990b8d3416d6d177a7d",
    files: [{ from: "yt-dlp.exe", to: "yt-dlp.exe" }]
  },
  {
    name: "ffmpeg",
    repo: "yt-dlp/FFmpeg-Builds",
    tag: "autobuild-2026-11-10-20-59",
    asset: "ffmpeg-N-128757-g4b42530309-win64-gpl-shared.zip",
    digest: "sha256:c780c81afa60bd79545e6391d383ee5142806d754c96f487c4eeec344841eb48",
    // Shared-Build: ffmpeg/ffprobe sind klein, die Codecs liegen in den DLLs.
    files: [
      { from: "*/bin/ffmpeg.exe", to: "ffmpeg.exe" },
      { from: "*/bin/ffprobe.exe", to: "ffprobe.exe" },
      { from: "*/bin/*.dll", to: "." }
    ]
  },
  {
    name: "deno",
    repo: "denoland/deno",
    tag: "v2.9.8",
    asset: "deno-x86_64-pc-windows-msvc.zip",
    digest: "sha256:cba84b26e0df5ae7f74fc66b86a95b866872a86292ebd84fa1e959927edd93bf",
    files: [{ from: "deno.exe", to: "deno.exe" }]
  },
  {
    name: "aria2",
    repo: "aria2/aria2",
    tag: "release-1.37.0",
    asset: "aria2-1.37.0-win-64bit-build1.zip",
    digest: "sha256:67d015301eef0b612191212d564c5bb0a14b5b9c4796b76454276a4d28d9b288",
    files: [{ from: "*/aria2c.exe", to: "aria2c.exe" }]
  }
];

const releaseUrl = ({ repo, tag, asset }) =>
  `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(asset)}`;

const download = async (url, dest) => {
  const res = await fetch(url, { headers: { "User-Agent": "snatchy-build" }, redirect: "follow" });
  if (!res.ok) throw new Error(`Download ${res.status}: ${url}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
};

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const extractZip = (zip, dest) => {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  const r = spawnSync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-Command",
    "Expand-Archive -LiteralPath $env:SNATCHY_ZIP -DestinationPath $env:SNATCHY_DEST -Force"
  ], { stdio: "inherit", env: { ...process.env, SNATCHY_ZIP: zip, SNATCHY_DEST: dest } });
  if (r.status !== 0) throw new Error(`Entpacken fehlgeschlagen: ${zip}`);
};

// Minimaler Glob: "*" steht für genau ein Pfadsegment bzw. einen Namensteil.
const globFiles = (base, pattern) => {
  const parts = pattern.split("/");
  let current = [base];
  parts.forEach((part, i) => {
    const re = new RegExp(`^${part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i");
    const last = i === parts.length - 1;
    current = current.flatMap((dir) => {
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
      return entries
        .filter((e) => re.test(e.name) && (last ? e.isFile() : e.isDirectory()))
        .map((e) => path.join(dir, e.name));
    });
  });
  return current;
};

const fetchSource = async (src) => {
  const targets = src.files.filter((f) => f.to !== ".").map((f) => path.join(BIN_DIR, f.to));
  if (!FORCE && targets.every((t) => fs.existsSync(t))) {
    console.log(`[${src.name}] vorhanden, übersprungen (--force zum Ersetzen)`);
    return;
  }

  const expected = String(src.digest || "").replace(/^sha256:/, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error(`[${src.name}] keine feste Prüfsumme hinterlegt, Abbruch`);

  const file = path.join(TMP_DIR, src.asset);
  console.log(`[${src.name}] lade ${src.tag}: ${src.asset}`);
  await download(releaseUrl(src), file);
  const actual = sha256(file);
  if (actual !== expected) {
    fs.rmSync(file, { force: true });
    throw new Error(`[${src.name}] SHA-256 stimmt nicht: ${actual} != ${expected}`);
  }

  const isZip = src.asset.toLowerCase().endsWith(".zip");
  const sourceDir = isZip ? path.join(TMP_DIR, `${src.name}-x`) : TMP_DIR;
  if (isZip) extractZip(file, sourceDir);

  for (const f of src.files) {
    const matches = globFiles(sourceDir, f.from);
    if (!matches.length) throw new Error(`[${src.name}] ${f.from} nicht im Archiv gefunden`);
    for (const m of matches) {
      const dest = f.to === "." ? path.join(BIN_DIR, path.basename(m)) : path.join(BIN_DIR, f.to);
      fs.copyFileSync(m, dest);
    }
  }
  console.log(`[${src.name}] ok`);
};

// Hilfsmodus: zeigt die neuesten Versionen der Quellen mit der Prüfsumme der GitHub-API.
// Diese Werte NICHT blind übernehmen, sondern mit der Prüfsummen-Datei des Herstellers vergleichen.
const showLatest = async () => {
  const headers = { "User-Agent": "snatchy-build", Accept: "application/vnd.github+json" };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  for (const src of SOURCES.filter((s) => s.name !== "aria2")) {
    // FFmpeg-Builds: "latest" ist ein beweglicher Tag, gepinnt wird ein datierter autobuild-Tag.
    const isFfmpeg = src.name === "ffmpeg";
    const res = await fetch(
      `https://api.github.com/repos/${src.repo}/releases${isFfmpeg ? "?per_page=10" : "/latest"}`,
      { headers }
    );
    if (!res.ok) { console.log(`[${src.name}] GitHub-API ${res.status}`); continue; }
    const data = await res.json();
    const release = isFfmpeg ? data.find((r) => /^autobuild-/.test(r.tag_name)) : data;
    if (!release) { console.log(`[${src.name}] kein datierter Release gefunden`); continue; }
    const nameRe = src.name === "ffmpeg" ? /win64-gpl-shared\.zip$/ : null;
    const asset = release.assets.find((a) => (nameRe ? nameRe.test(a.name) && !/master-latest/.test(a.name) : a.name === src.asset));
    console.log(`[${src.name}] aktuell: ${release.tag_name}${asset ? `  asset=${asset.name}  digest=${asset.digest || "(keiner)"}` : "  (Asset nicht gefunden)"}`);
    console.log(`           aktuell eingetragen: ${src.tag}  ${src.digest}`);
  }
  console.log("Hinweis FFmpeg: für einen datierten Tag (autobuild-...) die Release-Liste von yt-dlp/FFmpeg-Builds ansehen; \"latest\" ändert sich täglich.");
};

const main = async () => {
  if (SHOW_LATEST) {
    await showLatest();
    return;
  }
  if (process.platform !== "win32") {
    console.log("fetch-binaries: nur für Windows-Builds nötig, übersprungen.");
    return;
  }
  fs.mkdirSync(BIN_DIR, { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  try {
    for (const src of SOURCES) await fetchSource(src);
  } finally {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
  console.log(`Fertig: ${BIN_DIR}`);
};

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

// Lädt die externen Programme, die die App braucht, nach vendor/bin:
// yt-dlp, ffmpeg + ffprobe, deno (JS-Runtime für YouTube) und aria2c.
// electron-builder packt den Ordner über "extraResources" in den Installer,
// main.js sucht dort zuerst. Jede Datei wird per SHA-256 geprüft.
//
// Aufruf: node scripts/fetch-binaries.js [--force]

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const BIN_DIR = path.join(ROOT, "vendor", "bin");
const TMP_DIR = path.join(ROOT, "vendor", ".download");
const FORCE = process.argv.includes("--force");

// "digest: null" = Digest aus der GitHub-Release-API übernehmen.
// aria2 hat keinen API-Digest, daher fest hinterlegt (Version ist gepinnt).
const SOURCES = [
  {
    name: "yt-dlp",
    repo: "yt-dlp/yt-dlp",
    tag: "latest",
    asset: "yt-dlp.exe",
    digest: null,
    files: [{ from: "yt-dlp.exe", to: "yt-dlp.exe" }]
  },
  {
    name: "ffmpeg",
    repo: "yt-dlp/FFmpeg-Builds",
    tag: "latest",
    asset: "ffmpeg-master-latest-win64-gpl-shared.zip",
    digest: null,
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
    tag: "latest",
    asset: "deno-x86_64-pc-windows-msvc.zip",
    digest: null,
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

const ghHeaders = () => {
  const h = { "User-Agent": "snatchy-build", Accept: "application/vnd.github+json" };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
};

const getAsset = async ({ repo, tag, asset }) => {
  const url = tag === "latest"
    ? `https://api.github.com/repos/${repo}/releases/latest`
    : `https://api.github.com/repos/${repo}/releases/tags/${tag}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) throw new Error(`GitHub-API ${res.status} für ${repo}@${tag}`);
  const release = await res.json();
  const found = release.assets.find((a) => a.name === asset);
  if (!found) throw new Error(`Asset ${asset} nicht in ${repo}@${release.tag_name}`);
  return { url: found.browser_download_url, digest: found.digest || null, version: release.tag_name };
};

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
    console.log(`[${src.name}] vorhanden, übersprungen (--force zum Aktualisieren)`);
    return;
  }

  const info = await getAsset(src);
  const expected = (src.digest || info.digest || "").replace(/^sha256:/, "");
  if (!expected) throw new Error(`[${src.name}] keine Prüfsumme verfügbar, Abbruch`);

  const file = path.join(TMP_DIR, src.asset);
  console.log(`[${src.name}] lade ${info.version}: ${src.asset}`);
  await download(info.url, file);
  const actual = sha256(file);
  if (actual !== expected) throw new Error(`[${src.name}] SHA-256 stimmt nicht: ${actual} != ${expected}`);

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

const main = async () => {
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

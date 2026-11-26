// Downloads the external programs the app needs into vendor/bin:
// yt-dlp, ffmpeg + ffprobe, deno (JS runtime for YouTube) and aria2c.
// electron-builder packs the folder into the installer via "extraResources",
// main.js looks there first.
//
// Version AND SHA-256 of every file are pinned here. The download comes
// from the fixed release URL, the checksum does not come from the response of the
// server but from this repository. If a file changes (or a
// release is tampered with), the build aborts.
//
// Usage:
//   node scripts/fetch-binaries.js [--force]   download programs (--force replaces existing ones)
//   node scripts/fetch-binaries.js --show-latest   show latest versions with checksums,
//                                                  for updating the pinned values below
//
// Entering a new version: run --show-latest, check the checksum against the
// checksum file published by the vendor (yt-dlp: SHA2-256SUMS, deno:
// *.sha256sum, FFmpeg-Builds: checksums.sha256) and replace tag/digest/asset.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const BIN_DIR = path.join(ROOT, "vendor", "bin");
const TMP_DIR = path.join(ROOT, "vendor", ".download");
const FORCE = process.argv.includes("--force");
const SHOW_LATEST = process.argv.includes("--show-latest");

// Pinned release (tag), pinned file (asset), pinned checksum (digest).
// The checksums were cross-checked against the vendor checksum files:
//   yt-dlp  2026.10.26  SHA2-256SUMS of the release
//   deno    v2.9.8      deno-x86_64-pc-windows-msvc.zip.sha256sum of the release
//   ffmpeg  autobuild-2026-11-10-20-59  checksums.sha256 of the release
//   aria2   release-1.37.0  (no checksum file; value computed by ourselves)
// Note: FFmpeg builds delete old dated releases after some time. If the
// tag is missing (HTTP 404), enter a current tag with checksum using --show-latest.
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
    // Shared build: ffmpeg/ffprobe are small, the codecs live in the DLLs.
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
  if (r.status !== 0) throw new Error(`Extraction failed:${zip}`);
};

// Minimal glob: "*" stands for exactly one path segment or name part.
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
    console.log(`[${src.name}] already present, skipped (--force to replace)`);
    return;
  }

  const expected = String(src.digest || "").replace(/^sha256:/, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error(`[${src.name}] no pinned checksum set, aborting`);

  const file = path.join(TMP_DIR, src.asset);
  console.log(`[${src.name}] downloading ${src.tag}: ${src.asset}`);
  await download(releaseUrl(src), file);
  const actual = sha256(file);
  if (actual !== expected) {
    fs.rmSync(file, { force: true });
    throw new Error(`[${src.name}] SHA-256 mismatch:${actual} != ${expected}`);
  }

  const isZip = src.asset.toLowerCase().endsWith(".zip");
  const sourceDir = isZip ? path.join(TMP_DIR, `${src.name}-x`) : TMP_DIR;
  if (isZip) extractZip(file, sourceDir);

  for (const f of src.files) {
    const matches = globFiles(sourceDir, f.from);
    if (!matches.length) throw new Error(`[${src.name}] ${f.from} not found in archive`);
    for (const m of matches) {
      const dest = f.to === "." ? path.join(BIN_DIR, path.basename(m)) : path.join(BIN_DIR, f.to);
      fs.copyFileSync(m, dest);
    }
  }
  console.log(`[${src.name}] ok`);
};

// Helper mode: shows the latest versions of the sources with the checksum from the GitHub API.
// Do NOT adopt these values blindly, compare them with the vendor's checksum file.
const showLatest = async () => {
  const headers = { "User-Agent": "snatchy-build", Accept: "application/vnd.github+json" };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  for (const src of SOURCES.filter((s) => s.name !== "aria2")) {
    // FFmpeg builds: "latest" is a moving tag, a dated autobuild tag is pinned.
    const isFfmpeg = src.name === "ffmpeg";
    const res = await fetch(
      `https://api.github.com/repos/${src.repo}/releases${isFfmpeg ? "?per_page=10" : "/latest"}`,
      { headers }
    );
    if (!res.ok) { console.log(`[${src.name}] GitHub API ${res.status}`); continue; }
    const data = await res.json();
    const release = isFfmpeg ? data.find((r) => /^autobuild-/.test(r.tag_name)) : data;
    if (!release) { console.log(`[${src.name}] no dated release found`); continue; }
    const nameRe = src.name === "ffmpeg" ? /win64-gpl-shared\.zip$/ : null;
    const asset = release.assets.find((a) => (nameRe ? nameRe.test(a.name) && !/master-latest/.test(a.name) : a.name === src.asset));
    console.log(`[${src.name}] latest:${release.tag_name}${asset ? `  asset=${asset.name}  digest=${asset.digest || "(none)"}` : "  (asset not found)"}`);
    console.log(`           currently pinned:${src.tag}  ${src.digest}`);
  }
  console.log("Note on FFmpeg: for a dated tag (autobuild-...) see the release list of yt-dlp/FFmpeg-Builds; \"latest\" changes daily.");
};

const main = async () => {
  if (SHOW_LATEST) {
    await showLatest();
    return;
  }
  if (process.platform !== "win32") {
    console.log("fetch-binaries: only needed for Windows builds, skipped.");
    return;
  }
  fs.mkdirSync(BIN_DIR, { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  try {
    for (const src of SOURCES) await fetchSource(src);
  } finally {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
  console.log(`Done:${BIN_DIR}`);
};

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

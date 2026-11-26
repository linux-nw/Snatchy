const { app, BrowserWindow, dialog, ipcMain, session, shell } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

// Resolver architecture: URL -> SiteResolver -> provider URL(s) ->
// ProviderResolver -> ResolvedMedia -> Downloader. See ARCHITECTURE.md.
const { createDefaultResolverManager } = require("./core/setup");
const { createResolveContext } = require("./core/ResolveContext");
const { createLogger } = require("./core/logger");
const { ResolveErrorCode, toResolveError } = require("./core/errors");
const { downloadUrlOf } = require("./core/types");
const { SessionStore } = require("./auth/SessionStore");
const { createFolderPolicy } = require("./core/pathGuard");
const { normalizeHttpUrl, normalizeDownloadInput } = require("./core/urlGuard");
const { fileURLToPath } = require("node:url");
const {
  runDownloadCascade,
  buildFailureMessage,
  buildYtDlpArgs,
  buildSubtitleArgs,
  buildPrintArgs,
  normalizeEncoding,
  normalizeWhisperModel,
  ALLOWED_BROWSERS
} = require("./downloader");

// Bundled programs (yt-dlp, ffmpeg/ffprobe, deno, aria2c), see
// scripts/fetch-binaries.js. Installed: resources/bin, in dev mode: vendor/bin.
// Put first in the PATH so that both our calls and yt-dlp itself
// (ffmpeg, ffprobe, deno) find the bundled versions first.
const BUNDLED_BIN_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "bin")
  : path.join(__dirname, "..", "vendor", "bin");
if (fs.existsSync(BUNDLED_BIN_DIR)) {
  process.env.PATH = `${BUNDLED_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}
const bundledExe = (name) => {
  const p = path.join(BUNDLED_BIN_DIR, process.platform === "win32" ? `${name}.exe` : name);
  return fs.existsSync(p) ? p : null;
};

// One-time migration of the user data from the old app name. userData depends on the
// package.json name: old %APPDATA%\ytx-downloader-gui, new %APPDATA%\snatchy.
// The old folder is COPIED, not moved, so a way back remains.
// Runs before app.whenReady, while Chromium is not using the new folder yet.
// TODO: Can be removed once all installations have been started once.
const migrateLegacyUserData = () => {
  try {
    const legacyDir = path.join(app.getPath("appData"), "ytx-downloader-gui");
    const userDataDir = app.getPath("userData");
    const marker = path.join(userDataDir, ".migrated-from-ytx");
    if (legacyDir === userDataDir || fs.existsSync(marker) || !fs.existsSync(legacyDir)) {
      return;
    }
    const skip = new Set(["SingletonLock", "SingletonCookie", "SingletonSocket", "lockfile", "LOCK"]);
    fs.cpSync(legacyDir, userDataDir, {
      recursive: true,
      force: false,
      errorOnExist: false,
      filter: (src) => !skip.has(path.basename(src))
    });
    fs.writeFileSync(marker, new Date().toISOString());
  } catch (err) {
    console.warn("[Snatchy] Uebernahme alter Nutzerdaten fehlgeschlagen:", err && err.message);
  }
};
migrateLegacyUserData();

let mainWindow;
let activeDownload = null;
// Cancels running resolutions (fetch, headless browser) on cancel.
let activeAbortController = null;

// Registries are built once; new sites/hosts are added via
// src/sites or src/providers, not via special cases here.
const resolverManager = createDefaultResolverManager();
// Session material stays in memory only, and only briefly.
const sessionStore = new SessionStore();
// Set by download:cancel so that multi-stage flows (transcript) do not continue with
// the next stage after a cancellation.
let cancelRequested = false;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#0a0e14",
    icon: path.join(__dirname, "..", "assets", "icons", "icon.ico"),
    title: "Snatchy",
    titleBarStyle: "hidden",
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Secure navigation: the window only shows the local app page. Foreign
  // navigation is blocked, external http(s) links open in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: "deny" };
  });
  const blockForeignNavigation = (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    openExternalSafe(url);
  };
  mainWindow.webContents.on("will-navigate", blockForeignNavigation);
  mainWindow.webContents.on("will-redirect", blockForeignNavigation);
  mainWindow.webContents.on("will-attach-webview", (event) => event.preventDefault());

  // Load the new Vela React app
  mainWindow.loadFile(path.join(__dirname, "index.html"));
};

app.whenReady().then(() => {
  // Important for reliable Windows notifications (otherwise they may not appear)
  if (process.platform === "win32") {
    app.setAppUserModelId("com.snatchy.downloader");
  }
  // Permissions: only notifications (download finished) are allowed.
  const allowNotificationsOnly = (_contents, permission, callback) => callback(permission === "notifications");
  session.defaultSession.setPermissionRequestHandler(allowNotificationsOnly);
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => permission === "notifications");

  createWindow();

  // Pre-fill the dependency cache; warn if curl_cffi is missing (impersonation not usable).
  getDependencyStatus().then((deps) => {
    if (!deps.impersonateAvailable) {
      console.warn(
        "[Snatchy] Browser-Impersonation nicht verfügbar (curl_cffi fehlt).\n" +
        "      Seiten wie Pornhub senden HTTP 410 ohne Impersonation.\n" +
        "      Lösung: pip install -U \"yt-dlp[default,curl-cffi]\""
      );
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// IPC Helper
const sendToRenderer = (channel, payload) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(channel, payload);
};

const getDefaultDownloadFolder = () => app.getPath("downloads");

// --- Security helpers for navigation and IPC ---------------------------------
const APP_PAGE = path.resolve(__dirname, "index.html");
const isAppUrl = (url) => {
  try {
    return path.resolve(fileURLToPath(url)).toLowerCase() === APP_PAGE.toLowerCase();
  } catch {
    return false;
  }
};
// Only calls from the app's own page are served.
const fromApp = (event) => !!(event && event.senderFrame && isAppUrl(event.senderFrame.url));
const NOT_ALLOWED = { ok: false, error: "Nicht erlaubter Absender." };
const openExternalSafe = (url) => {
  const safe = normalizeHttpUrl(url);
  if (safe) shell.openExternal(safe);
};
let folderPolicy = null;
const getFolderPolicy = () => {
  if (!folderPolicy) {
    folderPolicy = createFolderPolicy({
      defaultFolder: getDefaultDownloadFolder(),
      storeFile: path.join(app.getPath("userData"), "allowed-folders.json")
    });
  }
  return folderPolicy;
};

// Structured logger for the resolution: additionally writes every line into the
// log window of the app. Cookies/tokens are removed in the logger itself.
const createResolveLogger = () => createLogger({
  sink: (line) => sendToRenderer("download:log", line)
});

/**
 * Builds the ResolveContext for an operation.
 * Auth deliberately stays outside the resolvers: only the kind of
 * authentication is set here (browser reference for cookies), never
 * credentials. yt-dlp reads the cookies itself from the chosen browser.
 */
const buildResolveContext = ({ cookiesBrowser, playwrightFallback, signal, logger } = {}) => createResolveContext({
  auth: cookiesBrowser && cookiesBrowser !== "none"
    ? { type: "cookies", cookiesFromBrowser: cookiesBrowser }
    : { type: "none" },
  signal,
  logger,
  flags: { playwrightFallback: !!playwrightFallback },
  services: { sessionStore }
});

// Looks for yt-dlp.exe / python.exe in common install locations in case they are not
// in the PATH (typical: pip install into the Python Scripts folder, which
// Windows does not automatically add to the PATH of a GUI app).
const discoverWindowsBinaries = () => {
  if (process.platform !== "win32") return [];
  const found = [];
  const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
  const pushExe = (p) => { if (exists(p)) found.push({ command: p, argsPrefix: [] }); };
  const pushPy = (p) => { if (exists(p)) found.push({ command: p, argsPrefix: ["-m", "yt_dlp"] }); };

  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");

  // Direct yt-dlp.exe in known locations (winget shim etc.).
  pushExe(path.join(localAppData, "Microsoft", "WinGet", "Links", "yt-dlp.exe"));
  pushExe(path.join(localAppData, "Programs", "yt-dlp", "yt-dlp.exe"));

  // Scan Python installations: <base>\Python*\Scripts\yt-dlp.exe and python.exe.
  const pythonBases = [
    path.join(localAppData, "Programs", "Python"),
    "C:\\Python",
    path.join(appData, "Python")
  ];
  for (const base of pythonBases) {
    let entries = [];
    try { entries = fs.readdirSync(base); } catch { continue; }
    // Sort descending so that newer Python versions (e.g. Python313 before
    // Python310) are preferred; older yt-dlp/Python versions otherwise trigger
    // extractor errors or count as deprecated.
    entries.sort().reverse();
    for (const name of entries) {
      const dir = path.join(base, name);
      pushExe(path.join(dir, "Scripts", "yt-dlp.exe"));
      pushPy(path.join(dir, "python.exe"));
    }
  }
  return found;
};

// Looks for aria2c.exe in known locations (winget shim) in case it is not in the PATH
// - same reason as for yt-dlp: a GUI app does not reliably inherit a new PATH
// if a console environment was not
// restarted after the installation.
const findAria2Path = () => {
  const bundled = bundledExe("aria2c");
  if (bundled) return bundled;
  if (process.platform !== "win32") return "aria2c";
  const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const winGetLink = path.join(localAppData, "Microsoft", "WinGet", "Links", "aria2c.exe");
  return exists(winGetLink) ? winGetLink : "aria2c";
};

let discoveredBinariesCache = null;
const getYtDlpCandidates = () => {
  if (!discoveredBinariesCache) discoveredBinariesCache = discoverWindowsBinaries();
  const bundled = bundledExe("yt-dlp");
  return [
    ...(bundled ? [{ command: bundled, argsPrefix: [] }] : []),
    { command: "yt-dlp", argsPrefix: [] },
    ...discoveredBinariesCache,
    { command: "python", argsPrefix: ["-m", "yt_dlp"] },
    { command: "python3", argsPrefix: ["-m", "yt_dlp"] },
    { command: "py", argsPrefix: ["-m", "yt_dlp"] }
  ];
};

// Checks whether a command exists; returns the version output (string) or null.
const checkCommand = (command, args, env) => new Promise((resolve) => {
  try {
    const child = spawn(command, args, { windowsHide: true, env: env || process.env });
    let out = "";
    if (child.stdout) child.stdout.on("data", (d) => { out += d.toString(); });
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code === 0 ? (out.trim() || "ok") : null));
  } catch {
    resolve(null);
  }
});

// Determine yt-dlp and ffmpeg availability (result is cached).
let depStatusCache = null;
const getDependencyStatus = async () => {
  if (depStatusCache) return depStatusCache;
  let ytDlp = null;
  for (const c of getYtDlpCandidates()) {
    const v = await checkCommand(c.command, [...c.argsPrefix, "--version"]);
    if (v) {
      ytDlp = { command: c.command, argsPrefix: c.argsPrefix, version: String(v).split(/\r?\n/)[0] };
      break;
    }
  }
  const ffmpeg = await checkCommand(bundledExe("ffmpeg") || "ffmpeg", ["-version"]);
  // Impersonation available if yt-dlp lists real targets (needs curl_cffi).
  let impersonate = null;
  if (ytDlp) {
    impersonate = await checkCommand(ytDlp.command, [...ytDlp.argsPrefix, "--list-impersonate-targets"]);
  }
  // aria2c takes over (if present) plain HTTP downloads with several real
  // parallel connections - a single stream over distance often only achieves
  // a fraction of the line speed (TCP window/RTT limit), no matter
  // how much yt-dlp's own downloader is optimized.
  const aria2Path = findAria2Path();
  const aria2 = await checkCommand(aria2Path, ["--version"]);
  depStatusCache = {
    ytDlpAvailable: !!ytDlp,
    ytDlpVersion: ytDlp ? ytDlp.version : null,
    ffmpegAvailable: !!ffmpeg,
    impersonateAvailable: !!impersonate && /chrome|edge|safari|firefox/i.test(impersonate),
    aria2Path: aria2 ? aria2Path : null
  };
  return depStatusCache;
};

const parseProgressLine = (line) => {
  const percentMatch = line.match(/(\d+(?:\.\d+)?)%/);
  if (!percentMatch) {
    return null;
  }

  const parts = line.split("|").map((part) => part.trim());
  return {
    percent: Number.parseFloat(percentMatch[1]),
    downloaded: parts[1] || "",
    total: parts[2] || "",
    speed: parts[3] || "",
    eta: parts[4] || ""
  };
};

// Determine the target file from a yt-dlp log line (full path resolved by --paths)
// - for the "Delete" button in the history so that the right file is removed.
const parseDestinationFromLine = (line) => {
  let match = line.match(/Merging formats into "(.+?)"/);
  if (!match) match = line.match(/Destination:\s*(.+)$/);
  if (!match) match = line.match(/\[download\]\s+(.+?) has already been downloaded/);
  return match ? match[1].trim() : null;
};

const runDownloadWithCandidate = (candidate, options, runOpts = {}) => new Promise((resolve, reject) => {
  const args = [
    ...candidate.argsPrefix,
    ...buildYtDlpArgs({ ...options, impersonate: runOpts.impersonate }),
    ...(runOpts.extraArgs || [])
  ];
  // Encoding: force UTF-8 by default so that umlauts (ü, ä, ö ...) and
  // other Unicode characters in the file name do not turn into "?". Python otherwise
  // uses the system code page on Windows. "system" leaves the environment untouched.
  const env = { ...process.env };
  if (options.encoding && options.encoding !== "system") {
    env.PYTHONIOENCODING = options.encoding;
    // PYTHONUTF8=1 forces UTF-8 regardless of PYTHONIOENCODING, so only
    // set it for utf-8 and explicitly disable it otherwise; otherwise a globally
    // set PYTHONUTF8=1 takes effect and the chosen codec would be ignored.
    env.PYTHONUTF8 = options.encoding === "utf-8" ? "1" : "0";
  }
  const child = spawn(candidate.command, args, {
    windowsHide: true,
    env
  });

  activeDownload = child;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  // Remember the last real yt-dlp error line to show it instead of "Code N".
  let lastErrorLine = "";
  // Remember the last detected target file for the "Delete" button in the history.
  let lastDestination = null;

  const handleOutput = (data) => {
    const lines = data.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      const progress = parseProgressLine(line);
      if (progress) {
        sendToRenderer("download:progress", progress);
      } else {
        if (/^ERROR:|^\s*ERROR:|Unsupported URL|is not available|Unable to|HTTP Error/i.test(line)) {
          lastErrorLine = line.replace(/^ERROR:\s*/i, "").trim();
        }
        const dest = parseDestinationFromLine(line);
        if (dest) lastDestination = dest;
        sendToRenderer("download:log", line);
      }
    }
  };

  child.stdout.on("data", handleOutput);
  child.stderr.on("data", handleOutput);

  child.on("error", (error) => {
    if (error.code === "ENOENT") {
      reject(Object.assign(new Error(`${candidate.command} wurde nicht gefunden.`), { code: "ENOENT" }));
      return;
    }
    reject(error);
  });

  child.on("close", (code) => {
    activeDownload = null;
    if (code === 0) {
      resolve(lastDestination);
      return;
    }
    reject(new Error(lastErrorLine || `yt-dlp wurde mit Code ${code} beendet.`));
  });
});

// Determines the thumbnail URL of the video via yt-dlp metadata (%(thumbnail)s) -
// for the cover image display in the history when "Cover image: thumbnail" is active.
const getThumbnailUrl = (candidate, url, cookiesBrowser, impersonate) => new Promise((resolve) => {
  const args = [...candidate.argsPrefix, ...buildPrintArgs({
    field: "%(thumbnail)s", url, cookiesBrowser, impersonate
  })];
  try {
    const child = spawn(candidate.command, args, { windowsHide: true });
    let out = "";
    if (child.stdout) child.stdout.on("data", (d) => { out += d.toString(); });
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code !== 0) return resolve(null);
      const line = out.trim().split(/\r?\n/)[0].trim();
      if (!line || /^na$/i.test(line) || line.toLowerCase() === "none") return resolve(null);
      resolve(line);
    });
  } catch {
    resolve(null);
  }
});

// Sends "download:completed" - for MP3/MP4 with the cover image setting enabled,
// also fetches the thumbnail URL for display in the history (best effort).
const sendDownloadCompleted = async (normalized, filePath, candidate, deps) => {
  let thumbnailUrl = null;
  if ((normalized.format === "mp3" || normalized.format === "mp4") && normalized.embedCoverArt && candidate) {
    thumbnailUrl = await getThumbnailUrl(candidate, normalized.url, normalized.cookiesBrowser, deps && deps.impersonateAvailable);
  }
  sendToRenderer("download:completed", { outputFolder: normalized.outputFolder, filePath, thumbnailUrl });
};

// ============================================
// Transcript: subtitle extraction + Whisper fallback
// ============================================

// openai-whisper provides NO `python -m whisper` (no __main__), but the
// console script `whisper` and the CLI entry point `whisper.transcribe:cli`.
// Primarily the script (on the PATH after pip install), as a fallback the direct
// CLI call via the respective Python (in case the Scripts directory is missing).
const WHISPER_CLI_SNIPPET = "from whisper.transcribe import cli; cli()";
const getWhisperCandidates = () => [
  { command: "whisper", argsPrefix: [] },
  { command: "python", argsPrefix: ["-c", WHISPER_CLI_SNIPPET] },
  { command: "py", argsPrefix: ["-c", WHISPER_CLI_SNIPPET] },
  { command: "python3", argsPrefix: ["-c", WHISPER_CLI_SNIPPET] }
];

// Force UTF-8: without PYTHONUTF8=1 even `whisper --help` crashes on the
// Windows console (cp1252) because the help text contains non-Latin characters.
const WHISPER_ENV = { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" };

// Find the first available Whisper variant - deliberately lazy (only when needed),
// because `whisper --help` imports torch and that can take several seconds.
const findWhisper = async () => {
  for (const c of getWhisperCandidates()) {
    const ok = await checkCommand(c.command, [...c.argsPrefix, "--help"], WHISPER_ENV);
    if (ok) return c;
  }
  return null;
};

// Default language priorities when the user chooses "auto".
const SUB_LANG_PRIORITY = ["en", "de", "es", "fr", "it", "pt", "nl", "ja", "ko", "ru"];
const resolveSubLangs = (lang) => {
  if (!lang || lang === "auto") return SUB_LANG_PRIORITY.map((c) => `${c}.*`).join(",");
  if (lang === "all") return "all,-live_chat";
  return `${lang}.*`;
};
// Whisper only gets one concrete language; for auto/all let it detect by itself.
const resolveWhisperLang = (lang) => (!lang || lang === "auto" || lang === "all") ? null : lang;

// Determines the actual video language via yt-dlp metadata (%(language)s).
// Important for "auto": YouTube offers automatic subtitles in ~150 languages
// for practically every video - but these are almost always machine
// translations of the one real original audio track, not independent
// transcripts. Without this detection the old priority list (en, de, ...)
// would almost always return the English translation instead of the original language.
const detectVideoLanguage = (candidate, url, cookiesBrowser, impersonate) => new Promise((resolve) => {
  const args = [...candidate.argsPrefix, ...buildPrintArgs({
    field: "%(language)s", url, cookiesBrowser, impersonate
  })];
  try {
    const child = spawn(candidate.command, args, { windowsHide: true });
    let out = "";
    if (child.stdout) child.stdout.on("data", (d) => { out += d.toString(); });
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code !== 0) return resolve(null);
      const line = out.trim().split(/\r?\n/)[0].trim();
      if (!line || /^na$/i.test(line) || line.toLowerCase() === "none") return resolve(null);
      resolve(line.split(/[-_]/)[0].toLowerCase());
    });
  } catch {
    resolve(null);
  }
});

// VTT/SRT -> plain text: remove WEBVTT header, timestamps, cue numbers, inline tags and
// direct repetitions (typical for rolling auto-captions).
const subtitleToText = (raw) => {
  const out = [];
  let last = "";
  for (let line of raw.split(/\r?\n/)) {
    line = line.trim();
    if (!line) continue;
    if (/^WEBVTT/.test(line)) continue;
    if (/^(NOTE|Kind:|Language:|STYLE|REGION)/.test(line)) continue;
    if (line.includes("-->")) continue;       // timestamp line
    if (/^\d+$/.test(line)) continue;          // SRT cue number
    line = line
      .replace(/<[^>]+>/g, "")                  // <00:00:00.000>, <c>…</c>
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();
    if (!line || line === last) continue;
    out.push(line);
    last = line;
  }
  return out.join("\n");
};

// From the subtitle files written by yt-dlp, choose the matching one by
// language priority (existing files preferred).
const pickSubtitleFile = (files, lang) => {
  if (!files || files.length === 0) return null;
  const existing = files.filter((f) => { try { return fs.existsSync(f); } catch { return false; } });
  const list = existing.length ? existing : files;
  const langHit = (code) => list.find((f) => new RegExp(`\\.${code}(?:[-.]|$)`, "i").test(path.basename(f)));
  if (lang && lang !== "auto" && lang !== "all") {
    const pref = langHit(lang);
    if (pref) return pref;
  } else if (lang === "auto") {
    for (const code of SUB_LANG_PRIORITY) {
      const hit = langHit(code);
      if (hit) return hit;
    }
  }
  return list[0];
};

// Find the single audio file in the temporary folder (result of the audio download).
const findAudioFile = (dir) => {
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return null; }
  const audio = entries.filter((f) => /\.(mp3|m4a|opus|webm|aac|wav|ogg|flac)$/i.test(f));
  return audio.length ? path.join(dir, audio[0]) : null;
};

// Generic streaming spawn: sets activeDownload (for cancel), passes every
// line to onLine and remembers the last real error line.
const spawnStreaming = (command, args, { env, onLine } = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { windowsHide: true, env: env || process.env });
  activeDownload = child;
  let lastErr = "";
  if (child.stdout) child.stdout.setEncoding("utf8");
  if (child.stderr) child.stderr.setEncoding("utf8");
  const handle = (data) => {
    for (const line of data.split(/\r?\n/)) {
      if (!line.trim()) continue;
      if (/^ERROR:|Unsupported URL|is not available|Unable to|HTTP Error/i.test(line)) {
        lastErr = line.replace(/^ERROR:\s*/i, "").trim();
      }
      if (onLine) onLine(line);
    }
  };
  if (child.stdout) child.stdout.on("data", handle);
  if (child.stderr) child.stderr.on("data", handle);
  child.on("error", (err) => {
    if (err.code === "ENOENT") {
      reject(Object.assign(new Error(`${command} wurde nicht gefunden.`), { code: "ENOENT" }));
      return;
    }
    reject(err);
  });
  child.on("close", (code) => {
    activeDownload = null;
    resolve({ code, lastErr });
  });
});

// Complete transcript pipeline. Sends the same events as a download
// (download:log / download:completed / download:failed) and returns {ok,error}.
const runTranscript = async (normalized, deps) => {
  const log = (m) => sendToRenderer("download:log", m);
  const fail = (msg) => { sendToRenderer("download:failed", msg); return { ok: false, error: msg }; };
  const env = { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" };

  // --- Stage 1: fetch existing subtitles / auto-captions ---
  log("[Transkript 1/2] Suche vorhandene Untertitel …");
  let ytCandidate = null;
  let subFiles = [];
  let detectedLang = null;
  for (const c of getYtDlpCandidates()) {
    subFiles = [];
    let subLangs = resolveSubLangs(normalized.lang);
    if (normalized.lang === "auto") {
      detectedLang = await detectVideoLanguage(c, normalized.url, normalized.cookiesBrowser, deps.impersonateAvailable);
      if (detectedLang) {
        log(`Erkannte Videosprache: ${detectedLang}`);
        subLangs = `${detectedLang}.*`;
      }
    }
    const args = [...c.argsPrefix, ...buildSubtitleArgs({
      url: normalized.url,
      subLangs,
      outputFolder: normalized.outputFolder,
      cookiesBrowser: normalized.cookiesBrowser,
      impersonate: deps.impersonateAvailable
    })];
    try {
      await spawnStreaming(c.command, args, {
        env,
        onLine: (line) => {
          const m = line.match(/Writing video subtitles to:\s*(.+)$/i) || line.match(/Writing subtitles to:\s*(.+)$/i);
          if (m) subFiles.push(m[1].trim());
          log(line);
        }
      });
      ytCandidate = c;
      break;
    } catch (err) {
      if (err.code === "ENOENT") continue; // try next yt-dlp variant
      ytCandidate = c;
      break;
    }
  }

  if (!ytCandidate) {
    return fail("yt-dlp wurde nicht gefunden. Bitte installiere yt-dlp (z. B. \"pip install yt-dlp\") und stelle sicher, dass es im PATH liegt.");
  }
  if (cancelRequested) return { ok: false };

  // Transcripts have no cover art of their own to embed (plain text) - with the
  // cover image setting enabled we still fetch the thumbnail on a best-effort basis
  // for the preview in the history (same look as for video/audio).
  const thumbnailUrl = normalized.embedCoverArt
    ? await getThumbnailUrl(ytCandidate, normalized.url, normalized.cookiesBrowser, deps.impersonateAvailable)
    : null;

  const chosen = pickSubtitleFile(subFiles, detectedLang || normalized.lang);
  if (chosen) {
    try {
      const text = subtitleToText(fs.readFileSync(chosen, "utf8"));
      if (text.trim()) {
        const txtPath = chosen.replace(/\.[^.]+$/, "") + ".txt";
        fs.writeFileSync(txtPath, text, "utf8");
        log("Untertitel gefunden – Transkript gespeichert.");
        log(`Destination: ${txtPath}`);
        sendToRenderer("download:completed", { outputFolder: normalized.outputFolder, transcriptText: text, transcriptPath: txtPath, thumbnailUrl });
        return { ok: true };
      }
    } catch (err) {
      log(`Untertitel-Datei konnte nicht gelesen werden: ${err.message}`);
    }
  }

  // --- Stage 2: no (matching) subtitles -> Whisper transcription ---
  log("[Transkript 2/2] Keine passenden Untertitel – automatischer Whisper-Fallback …");
  const whisper = await findWhisper();
  if (!whisper) {
    return fail(
      "Keine Untertitel verfügbar und Whisper ist nicht installiert. Für die automatische " +
      "Transkription beliebiger Videos bitte Whisper installieren: pip install -U openai-whisper " +
      "(benötigt zusätzlich ffmpeg im PATH)."
    );
  }
  if (cancelRequested) return { ok: false };

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "snatchy-trans-"));
  try {
    // Load audio through the existing download pipeline (gives real progress).
    log("Lade Audiospur für die Transkription …");
    await runDownloadWithCandidate(ytCandidate, {
      ...normalized,
      format: "audio-raw",
      outputFolder: tmpDir,
      playlistMode: "single-video"
    }, { impersonate: deps.impersonateAvailable });

    if (cancelRequested) return { ok: false };

    const audioFile = findAudioFile(tmpDir);
    if (!audioFile) throw new Error("Audiodatei nach dem Download nicht gefunden.");

    const wlang = resolveWhisperLang(normalized.lang);
    const wargs = [
      ...whisper.argsPrefix,
      audioFile,
      "--model", normalized.whisperModel,
      "--output_format", "txt",
      "--output_dir", normalized.outputFolder,
      ...(wlang ? ["--language", wlang] : [])
    ];
    log(`[Whisper] Transkribiere Audio (Modell: ${normalized.whisperModel}) – das kann je nach Länge dauern …`);
    const { code } = await spawnStreaming(whisper.command, wargs, { env, onLine: (line) => log(line) });
    if (cancelRequested) return { ok: false };
    if (code !== 0) throw new Error(`Whisper wurde mit Code ${code} beendet.`);

    const base = path.basename(audioFile).replace(/\.[^.]+$/, "");
    const outTxtPath = path.join(normalized.outputFolder, base + ".txt");
    log(`Destination: ${outTxtPath}`);
    let whisperText;
    try { whisperText = fs.readFileSync(outTxtPath, "utf8"); } catch { /* display is best effort, file stays saved anyway */ }
    sendToRenderer("download:completed", { outputFolder: normalized.outputFolder, transcriptText: whisperText, transcriptPath: outTxtPath, thumbnailUrl });
    return { ok: true };
  } catch (err) {
    if (cancelRequested) return { ok: false };
    let msg = err && err.message ? err.message : "Transkription fehlgeschlagen.";
    if (err && err.code === "ENOENT") msg = "Whisper oder yt-dlp wurde nicht gefunden.";
    return fail(msg);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* cleanup is best effort */ }
  }
};

// ============================================
// IPC handlers - compatible with the Vela app
// ============================================

// App State
ipcMain.handle("app:get-state", async () => {
  const deps = await getDependencyStatus();
  return {
    defaultDownloadFolder: getDefaultDownloadFolder(),
    platform: process.platform,
    ...deps
  };
});

// Theme handling
ipcMain.handle("app:set-theme", (_event, theme) => {
  return { ok: true };
});

// Folder selection
ipcMain.handle("dialog:select-folder", async (event) => {
  if (!fromApp(event)) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Download-Ordner auswählen",
    defaultPath: getDefaultDownloadFolder(),
    properties: ["openDirectory", "createDirectory"]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  // Chosen folders are released: only there may files be opened,
  // deleted and downloads saved (see src/core/pathGuard.js).
  const freigabe = getFolderPolicy().allow(result.filePaths[0]);
  if (!freigabe.ok) {
    dialog.showErrorBox("Ordner nicht erlaubt", freigabe.error);
    return null;
  }
  return result.filePaths[0];
});

// Download start
ipcMain.handle("download:start", async (event, options) => {
  if (!fromApp(event)) return NOT_ALLOWED;
  options = options || {};
  if (activeDownload) {
    return { ok: false, error: "Es läuft bereits ein Download." };
  }
  cancelRequested = false;
  // Own AbortController per operation: aborts running network/browser
  // steps of the resolution when the user cancels.
  activeAbortController = new AbortController();

  const normalized = {
    url: String(options.url || "").trim(),
    format: options.format === "mp3" ? "mp3" : options.format === "transcript" ? "transcript" : "mp4",
    quality: options.quality ? String(options.quality) : undefined,
    audioQuality: options.audioQuality ? String(options.audioQuality) : undefined,
    embedCoverArt: !!options.embedCoverArt,
    playlistMode: options.playlistMode || "single-video",
    outputFolder: options.outputFolder || getDefaultDownloadFolder(),
    encoding: normalizeEncoding(options.encoding),
    cookiesBrowser: ALLOWED_BROWSERS.has(options.cookiesBrowser) ? options.cookiesBrowser : "none",
    playwrightFallback: !!options.playwrightFallback,
    lang: options.lang ? String(options.lang) : "auto",
    whisperModel: normalizeWhisperModel(options.whisperModel)
  };

  if (!normalized.url) {
    return { ok: false, error: "Bitte eine URL eingeben." };
  }

  // Allowed: http(s) URLs and yt-dlp searches in the strict pattern ytsearch[N]:text
  // (see src/core/urlGuard.js). Local paths, file: URLs and options as
  // input are rejected; yt-dlp always gets the input after "--".
  const safeUrl = normalizeDownloadInput(normalized.url);
  if (!safeUrl) {
    return { ok: false, error: "Nur http(s)-Links oder ytsearch:-Suchen sind erlaubt." };
  }
  normalized.url = safeUrl;

  // Output folder must be released (default download folder or chosen in the dialog).
  const ordner = getFolderPolicy().checkFolder(normalized.outputFolder);
  if (!ordner.ok) {
    return { ok: false, error: `${ordner.error} Bitte den Ordner über "Ordner wählen" neu auswählen.` };
  }
  normalized.outputFolder = ordner.path;
  sendToRenderer("download:started", normalized);

  // Transcript runs through its own pipeline (subtitles + Whisper fallback).
  if (normalized.format === "transcript") {
    const depsT = await getDependencyStatus();
    return await runTranscript(normalized, depsT);
  }

  const deps = await getDependencyStatus();
  normalized.aria2Path = deps.aria2Path;

  // --- Resolution: URL -> SiteResolver -> provider URL -> ProviderResolver ---
  const logger = createResolveLogger();
  const context = buildResolveContext({
    cookiesBrowser: normalized.cookiesBrowser,
    playwrightFallback: normalized.playwrightFallback,
    signal: activeAbortController ? activeAbortController.signal : undefined,
    logger
  });

  let media;
  try {
    media = await resolverManager.resolveOne(normalized.url, context);
  } catch (err) {
    const resolveError = toResolveError(err, { url: normalized.url });
    if (resolveError.code === ResolveErrorCode.CANCELLED || cancelRequested) {
      return { ok: false };
    }
    // No resolver responsible: the input still goes to yt-dlp. This covers
    // special forms that no resolver needs to model (ytsearch:; local paths
    // are already rejected above) and keeps the previous behavior exactly.
    sendToRenderer("download:log", `[Auflösung] ${resolveError.code}: ${resolveError.message}`);
    media = { sourceUrl: normalized.url, mediaUrl: normalized.url, provider: "yt-dlp" };
  }

  const result = await runDownloadCascade({
    media,
    options: normalized,
    deps,
    candidates: getYtDlpCandidates(),
    runDownload: runDownloadWithCandidate,
    // Stage 5 explicitly requests the browser/session-based extraction.
    resolveStream: (url) => resolverManager.resolveProvider(url, context, {
      only: ["playwright-sniffer"]
    }),
    isCancelled: () => cancelRequested,
    log: (line) => sendToRenderer("download:log", line),
    logger
  });

  if (result.ok) {
    await sendDownloadCompleted(normalized, result.filePath, result.candidate, deps);
    return { ok: true };
  }

  // After a cancellation download:cancel has already reported "Download abgebrochen."
  // - do not send a second error message afterwards.
  if (cancelRequested) {
    return { ok: false };
  }

  const message = buildFailureMessage(result.error, { options: normalized, deps });
  sendToRenderer("download:failed", message);
  return { ok: false, error: message };
});

// Podcast: RSS feed link -> list of episodes {title, audioUrl, pubDate}.
// Downloads nothing itself, only the feed - the download then runs completely
// normally via download:start (every episode is its own MP3 URL).
//
// Runs via the PodcastFeedSiteResolver: a SiteResolver that returns several
// provider references (one per episode). Deliberately without falling back to
// the generic resolver - a feed is really meant here.
ipcMain.handle("podcast:resolve", async (event, url) => {
  if (!fromApp(event)) return NOT_ALLOWED;
  const feedUrl = normalizeHttpUrl(url);
  if (!feedUrl) return { ok: false, error: "Nur http(s)-Links sind erlaubt." };
  try {
    const references = await resolverManager.resolveSite(
      feedUrl,
      buildResolveContext({ logger: createResolveLogger() }),
      { only: ["podcast-rss"] }
    );
    const episodes = references.map((media) => ({
      title: media.title,
      audioUrl: downloadUrlOf(media),
      pubDate: (media.meta && media.meta.pubDate) || null
    }));
    return { ok: true, episodes };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : "Podcast-Feed konnte nicht gelesen werden." };
  }
});

// Download cancel
ipcMain.handle("download:cancel", () => {
  cancelRequested = true;
  // End running resolution steps (feed fetch, headless browser).
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
  if (!activeDownload) {
    return { ok: true };
  }

  activeDownload.kill();
  activeDownload = null;
  sendToRenderer("download:failed", "Download abgebrochen.");
  return { ok: true };
});

// Folder open
ipcMain.handle("folder:open", async (event, folderPath) => {
  if (!fromApp(event)) return NOT_ALLOWED;
  const ordner = getFolderPolicy().checkFolder(folderPath || getDefaultDownloadFolder(), { mustExist: true });
  if (!ordner.ok) return ordner;
  const fehler = await shell.openPath(ordner.path);
  return fehler ? { ok: false, error: fehler } : { ok: true };
});

// Open a file with the system's default app (e.g. MP3 in the player,
// transcript TXT in the text editor) - for notification click and auto-open.
ipcMain.handle("file:open", async (event, filePath) => {
  if (!fromApp(event)) return NOT_ALLOWED;
  if (!filePath || typeof filePath !== "string") {
    return { ok: false, error: "Kein Dateipfad angegeben." };
  }
  // Only media/text files in released folders; never program files.
  const datei = getFolderPolicy().checkFile(filePath);
  if (!datei.ok) return datei;
  const error = await shell.openPath(datei.path);
  return error ? { ok: false, error } : { ok: true };
});

// Delete a file (removing a history entry should also delete the real file).
// fs.unlink only works on files, never on directories.
ipcMain.handle("file:delete", async (event, filePath) => {
  if (!fromApp(event)) return NOT_ALLOWED;
  if (!filePath || typeof filePath !== "string") {
    return { ok: false, error: "Kein Dateipfad angegeben." };
  }
  // Only media/text files within released folders, no symlinks.
  const datei = getFolderPolicy().checkFile(filePath);
  if (datei.missing) return { ok: true }; // already deleted
  if (!datei.ok) return datei;
  try {
    await fs.promises.unlink(datei.path);
    return { ok: true };
  } catch (err) {
    if (err.code === "ENOENT") return { ok: true }; // already deleted
    return { ok: false, error: err.message };
  }
});

// Window controls (for the Vela app title bar)
ipcMain.on("window:minimize", () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on("window:maximize", () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on("window:close", () => {
  if (mainWindow) mainWindow.close();
});

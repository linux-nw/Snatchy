const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

// Resolver-Architektur: URL -> SiteResolver -> Provider-URL(s) ->
// ProviderResolver -> ResolvedMedia -> Downloader. Siehe ARCHITECTURE.md.
const { createDefaultResolverManager } = require("./core/setup");
const { createResolveContext } = require("./core/ResolveContext");
const { createLogger } = require("./core/logger");
const { ResolveErrorCode, toResolveError } = require("./core/errors");
const { downloadUrlOf } = require("./core/types");
const { SessionStore } = require("./auth/SessionStore");
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

// Mitgelieferte Programme (yt-dlp, ffmpeg/ffprobe, deno, aria2c), siehe
// scripts/fetch-binaries.js. Installiert: resources/bin, im Dev-Modus: vendor/bin.
// Vorne in den PATH, damit sowohl unsere Aufrufe als auch yt-dlp selbst
// (ffmpeg, ffprobe, deno) zuerst die mitgelieferten Versionen finden.
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

// Einmalige Uebernahme der Nutzerdaten vom alten App-Namen. userData haengt am
// package.json-Namen: alt %APPDATA%\ytx-downloader-gui, neu %APPDATA%\snatchy.
// Der alte Ordner wird KOPIERT, nicht verschoben, damit ein Rueckweg bleibt.
// Laeuft vor app.whenReady, solange Chromium den neuen Ordner noch nicht nutzt.
// TODO: Kann entfernt werden, sobald alle Installationen einmal gestartet wurden.
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
// Bricht laufende Auflösungen (fetch, headless Browser) beim Abbrechen ab.
let activeAbortController = null;

// Registries werden einmal aufgebaut; neue Seiten/Hoster kommen über
// src/sites bzw. src/providers dazu, nicht über Sonderfälle hier.
const resolverManager = createDefaultResolverManager();
// Session-Material bleibt ausschließlich im Speicher und nur kurz.
const sessionStore = new SessionStore();
// Wird von download:cancel gesetzt, damit mehrstufige Abläufe (Transkript) nach
// einem Abbruch nicht mit der nächsten Stufe weitermachen.
let cancelRequested = false;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#0a0e14",
    title: "Snatchy",
    titleBarStyle: "hidden",
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // Lade die neue Vela React App
  mainWindow.loadFile(path.join(__dirname, "index.html"));
};

app.whenReady().then(() => {
  // Wichtig für zuverlässige Windows-Benachrichtigungen (sonst erscheinen sie ggf. nicht)
  if (process.platform === "win32") {
    app.setAppUserModelId("com.snatchy.downloader");
  }
  createWindow();

  // Dep-Cache vorab befüllen; warnen wenn curl_cffi fehlt (Impersonation nicht nutzbar).
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

// Struktur-Logger für die Auflösung: schreibt zusätzlich jede Zeile in das
// Log-Fenster der App. Cookies/Tokens werden im Logger selbst entfernt.
const createResolveLogger = () => createLogger({
  sink: (line) => sendToRenderer("download:log", line)
});

/**
 * Baut den ResolveContext für einen Vorgang.
 * Auth bleibt bewusst außerhalb der Resolver: hier wird nur die Art der
 * Authentifizierung gesetzt (Browser-Referenz für Cookies), niemals
 * Zugangsdaten. yt-dlp liest die Cookies selbst aus dem gewählten Browser.
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

// Sucht yt-dlp.exe / python.exe an gängigen Installationsorten, falls sie nicht
// im PATH liegen (typisch: pip-Installation in den Python-Scripts-Ordner, den
// Windows nicht automatisch in den PATH einer GUI-App aufnimmt).
const discoverWindowsBinaries = () => {
  if (process.platform !== "win32") return [];
  const found = [];
  const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
  const pushExe = (p) => { if (exists(p)) found.push({ command: p, argsPrefix: [] }); };
  const pushPy = (p) => { if (exists(p)) found.push({ command: p, argsPrefix: ["-m", "yt_dlp"] }); };

  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");

  // Direkte yt-dlp.exe an bekannten Orten (winget-Shim etc.).
  pushExe(path.join(localAppData, "Microsoft", "WinGet", "Links", "yt-dlp.exe"));
  pushExe(path.join(localAppData, "Programs", "yt-dlp", "yt-dlp.exe"));

  // Python-Installationen scannen: <base>\Python*\Scripts\yt-dlp.exe und python.exe.
  const pythonBases = [
    path.join(localAppData, "Programs", "Python"),
    "C:\\Python",
    path.join(appData, "Python")
  ];
  for (const base of pythonBases) {
    let entries = [];
    try { entries = fs.readdirSync(base); } catch { continue; }
    // Absteigend sortieren, damit neuere Python-Versionen (z. B. Python313 vor
    // Python310) bevorzugt werden – ältere yt-dlp/Python-Stände lösen sonst
    // Extractor-Fehler aus oder gelten als deprecated.
    entries.sort().reverse();
    for (const name of entries) {
      const dir = path.join(base, name);
      pushExe(path.join(dir, "Scripts", "yt-dlp.exe"));
      pushPy(path.join(dir, "python.exe"));
    }
  }
  return found;
};

// Sucht aria2c.exe an bekannten Orten (winget-Shim), falls es nicht im PATH
// liegt – gleicher Grund wie bei yt-dlp: eine GUI-App erbt den PATH nicht
// zuverlässig neu, wenn eine Konsolen-Umgebung nach der Installation nicht
// neu gestartet wurde.
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

// Prüft, ob ein Kommando vorhanden ist; gibt die Versionsausgabe (string) oder null zurück.
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

// yt-dlp- und ffmpeg-Verfügbarkeit ermitteln (Ergebnis wird gecacht).
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
  // Impersonation verfügbar, wenn yt-dlp echte Targets auflistet (braucht curl_cffi).
  let impersonate = null;
  if (ytDlp) {
    impersonate = await checkCommand(ytDlp.command, [...ytDlp.argsPrefix, "--list-impersonate-targets"]);
  }
  // aria2c übernimmt (wenn vorhanden) reine HTTP-Downloads mit mehreren echten
  // parallelen Verbindungen – ein einzelner Stream schafft auf Distanz oft nur
  // einen Bruchteil der Leitungsgeschwindigkeit (TCP-Fenster/RTT-Limit), egal
  // wie sehr yt-dlps eigener Downloader optimiert wird.
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

// Zieldatei aus einer yt-dlp-Logzeile ermitteln (voller, von --paths aufgelöster
// Pfad) – für den "Löschen"-Button im Verlauf, damit die richtige Datei entfernt wird.
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
  // Encoding: standardmäßig UTF-8 erzwingen, damit Umlaute (ü, ä, ö …) und
  // andere Unicode-Zeichen im Dateinamen nicht zu "?" werden. Python nutzt
  // sonst auf Windows die System-Codepage. "system" lässt die Umgebung unberührt.
  const env = { ...process.env };
  if (options.encoding && options.encoding !== "system") {
    env.PYTHONIOENCODING = options.encoding;
    // PYTHONUTF8=1 erzwingt UTF-8 unabhängig von PYTHONIOENCODING – daher nur
    // bei utf-8 setzen und sonst explizit deaktivieren, sonst greift ein global
    // gesetztes PYTHONUTF8=1 und der gewählte Codec würde ignoriert.
    env.PYTHONUTF8 = options.encoding === "utf-8" ? "1" : "0";
  }
  const child = spawn(candidate.command, args, {
    windowsHide: true,
    env
  });

  activeDownload = child;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  // Letzte echte yt-dlp-Fehlerzeile merken, um sie statt "Code N" anzuzeigen.
  let lastErrorLine = "";
  // Letzte erkannte Zieldatei merken – für den "Löschen"-Button im Verlauf.
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

// Ermittelt die Thumbnail-URL des Videos über yt-dlp-Metadaten (%(thumbnail)s) –
// für die Cover-Bild-Anzeige im Verlauf, wenn "Cover-Bild: Thumbnail" aktiv ist.
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

// Sendet "download:completed" – holt bei MP3/MP4 + aktiviertem Cover-Bild-
// Setting zusätzlich die Thumbnail-URL für die Anzeige im Verlauf (best effort).
const sendDownloadCompleted = async (normalized, filePath, candidate, deps) => {
  let thumbnailUrl = null;
  if ((normalized.format === "mp3" || normalized.format === "mp4") && normalized.embedCoverArt && candidate) {
    thumbnailUrl = await getThumbnailUrl(candidate, normalized.url, normalized.cookiesBrowser, deps && deps.impersonateAvailable);
  }
  sendToRenderer("download:completed", { outputFolder: normalized.outputFolder, filePath, thumbnailUrl });
};

// ============================================
// Transkript: Untertitel-Extraktion + Whisper-Fallback
// ============================================

// openai-whisper liefert KEIN `python -m whisper` (kein __main__), aber das
// Console-Script `whisper` und den CLI-Entrypoint `whisper.transcribe:cli`.
// Primär das Script (liegt nach pip-Install im PATH), als Fallback der direkte
// CLI-Aufruf über den jeweiligen Python (falls das Scripts-Verzeichnis fehlt).
const WHISPER_CLI_SNIPPET = "from whisper.transcribe import cli; cli()";
const getWhisperCandidates = () => [
  { command: "whisper", argsPrefix: [] },
  { command: "python", argsPrefix: ["-c", WHISPER_CLI_SNIPPET] },
  { command: "py", argsPrefix: ["-c", WHISPER_CLI_SNIPPET] },
  { command: "python3", argsPrefix: ["-c", WHISPER_CLI_SNIPPET] }
];

// UTF-8 erzwingen: ohne PYTHONUTF8=1 stürzt schon `whisper --help` auf der
// Windows-Konsole (cp1252) ab, weil der Hilfetext Nicht-Latin-Zeichen enthält.
const WHISPER_ENV = { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" };

// Erste verfügbare Whisper-Variante finden – bewusst lazy (erst wenn gebraucht),
// weil `whisper --help` torch importiert und das mehrere Sekunden dauern kann.
const findWhisper = async () => {
  for (const c of getWhisperCandidates()) {
    const ok = await checkCommand(c.command, [...c.argsPrefix, "--help"], WHISPER_ENV);
    if (ok) return c;
  }
  return null;
};

// Standard-Sprachprioritäten, wenn der Nutzer "auto" wählt.
const SUB_LANG_PRIORITY = ["en", "de", "es", "fr", "it", "pt", "nl", "ja", "ko", "ru"];
const resolveSubLangs = (lang) => {
  if (!lang || lang === "auto") return SUB_LANG_PRIORITY.map((c) => `${c}.*`).join(",");
  if (lang === "all") return "all,-live_chat";
  return `${lang}.*`;
};
// Whisper bekommt nur eine konkrete Sprache; bei auto/all selbst erkennen lassen.
const resolveWhisperLang = (lang) => (!lang || lang === "auto" || lang === "all") ? null : lang;

// Ermittelt die tatsächliche Videosprache über yt-dlp-Metadaten (%(language)s).
// Wichtig für "auto": YouTube bietet für praktisch jedes Video automatische
// Untertitel in ~150 Sprachen an – das sind aber fast immer Maschinen-
// übersetzungen der einen echten Original-Tonspur, keine eigenständigen
// Transkripte. Ohne diese Erkennung würde die alte Prioritätsliste (en, de, …)
// fast immer die englische Übersetzung statt der Originalsprache liefern.
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

// VTT/SRT → reiner Text: WEBVTT-Header, Zeitstempel, Cue-Nummern, Inline-Tags und
// direkte Wiederholungen (typisch bei rollenden Auto-Captions) entfernen.
const subtitleToText = (raw) => {
  const out = [];
  let last = "";
  for (let line of raw.split(/\r?\n/)) {
    line = line.trim();
    if (!line) continue;
    if (/^WEBVTT/.test(line)) continue;
    if (/^(NOTE|Kind:|Language:|STYLE|REGION)/.test(line)) continue;
    if (line.includes("-->")) continue;       // Zeitstempelzeile
    if (/^\d+$/.test(line)) continue;          // SRT Cue-Nummer
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

// Aus den von yt-dlp geschriebenen Untertiteldateien die passende nach
// Sprachpriorität wählen (existierende Dateien bevorzugt).
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

// Einzige Audiodatei im temporären Ordner finden (Ergebnis des Audio-Downloads).
const findAudioFile = (dir) => {
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return null; }
  const audio = entries.filter((f) => /\.(mp3|m4a|opus|webm|aac|wav|ogg|flac)$/i.test(f));
  return audio.length ? path.join(dir, audio[0]) : null;
};

// Generisches Streaming-Spawn: setzt activeDownload (für Abbruch), leitet jede
// Zeile an onLine und merkt sich die letzte echte Fehlerzeile.
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

// Komplette Transkript-Pipeline. Sendet dieselben Events wie ein Download
// (download:log / download:completed / download:failed) und liefert {ok,error}.
const runTranscript = async (normalized, deps) => {
  const log = (m) => sendToRenderer("download:log", m);
  const fail = (msg) => { sendToRenderer("download:failed", msg); return { ok: false, error: msg }; };
  const env = { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" };

  // --- Stufe 1: vorhandene Untertitel / Auto-Captions holen ---
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
      if (err.code === "ENOENT") continue; // nächste yt-dlp-Variante probieren
      ytCandidate = c;
      break;
    }
  }

  if (!ytCandidate) {
    return fail("yt-dlp wurde nicht gefunden. Bitte installiere yt-dlp (z. B. \"pip install yt-dlp\") und stelle sicher, dass es im PATH liegt.");
  }
  if (cancelRequested) return { ok: false };

  // Transkripte haben keine eigene Cover-Art zum Einbetten (reiner Text) – bei
  // aktiviertem Cover-Bild-Setting holen wir das Thumbnail trotzdem best effort
  // für die Vorschau im Verlauf (dieselbe Optik wie bei Video/Audio).
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

  // --- Stufe 2: keine (passenden) Untertitel → Whisper-Transkription ---
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
    // Audio über die bestehende Download-Pipeline laden (liefert echten Fortschritt).
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
    try { whisperText = fs.readFileSync(outTxtPath, "utf8"); } catch { /* Anzeige best effort, Datei bleibt trotzdem gespeichert */ }
    sendToRenderer("download:completed", { outputFolder: normalized.outputFolder, transcriptText: whisperText, transcriptPath: outTxtPath, thumbnailUrl });
    return { ok: true };
  } catch (err) {
    if (cancelRequested) return { ok: false };
    let msg = err && err.message ? err.message : "Transkription fehlgeschlagen.";
    if (err && err.code === "ENOENT") msg = "Whisper oder yt-dlp wurde nicht gefunden.";
    return fail(msg);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* Aufräumen best effort */ }
  }
};

// ============================================
// IPC Handlers - Vela App kompatibel
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
ipcMain.handle("dialog:select-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Download-Ordner auswählen",
    defaultPath: getDefaultDownloadFolder(),
    properties: ["openDirectory", "createDirectory"]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

// Download start
ipcMain.handle("download:start", async (_event, options) => {
  if (activeDownload) {
    return { ok: false, error: "Es läuft bereits ein Download." };
  }
  cancelRequested = false;
  // Eigener AbortController pro Vorgang: bricht laufende Netzwerk-/Browser-
  // Schritte der Auflösung ab, wenn der Nutzer abbricht.
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

  sendToRenderer("download:started", normalized);

  // Transkript läuft über eine eigene Pipeline (Untertitel + Whisper-Fallback).
  if (normalized.format === "transcript") {
    const depsT = await getDependencyStatus();
    return await runTranscript(normalized, depsT);
  }

  const deps = await getDependencyStatus();
  normalized.aria2Path = deps.aria2Path;

  // --- Auflösung: URL → SiteResolver → Provider-URL → ProviderResolver ---
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
    // Kein Resolver zuständig: die Eingabe geht trotzdem an yt-dlp. Das deckt
    // Sonderformen ab, die kein Resolver abbilden muss (ytsearch:, lokale
    // Pfade) und hält das bisherige Verhalten exakt bei.
    sendToRenderer("download:log", `[Auflösung] ${resolveError.code}: ${resolveError.message}`);
    media = { sourceUrl: normalized.url, mediaUrl: normalized.url, provider: "yt-dlp" };
  }

  const result = await runDownloadCascade({
    media,
    options: normalized,
    deps,
    candidates: getYtDlpCandidates(),
    runDownload: runDownloadWithCandidate,
    // Stufe 5 fragt gezielt die Browser-/Session-basierte Extraktion an.
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

  // Nach einem Abbruch hat download:cancel bereits "Download abgebrochen."
  // gemeldet - keine zweite Fehlermeldung hinterherschicken.
  if (cancelRequested) {
    return { ok: false };
  }

  const message = buildFailureMessage(result.error, { options: normalized, deps });
  sendToRenderer("download:failed", message);
  return { ok: false, error: message };
});

// Podcast: RSS-Feed-Link → Liste von Episoden {title, audioUrl, pubDate}.
// Lädt selbst nichts herunter, nur den Feed – der Download läuft danach ganz
// normal über download:start (jede Episode ist eine eigene MP3-URL).
//
// Läuft über den PodcastFeedSiteResolver: ein SiteResolver, der mehrere
// Provider-Referenzen (eine pro Episode) liefert. Bewusst ohne Ausweichen auf
// den generischen Resolver – hier ist wirklich ein Feed gemeint.
ipcMain.handle("podcast:resolve", async (_event, url) => {
  try {
    const references = await resolverManager.resolveSite(
      String(url || "").trim(),
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
  // Laufende Auflösungsschritte (Feed-Abruf, headless Browser) beenden.
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
ipcMain.handle("folder:open", async (_event, folderPath) => {
  const target = folderPath || getDefaultDownloadFolder();
  await shell.openPath(target);
  return { ok: true };
});

// Datei mit der Standard-App des Systems öffnen (z. B. MP3 im Player,
// Transkript-TXT im Texteditor) – für Notification-Klick und Auto-Open.
ipcMain.handle("file:open", async (_event, filePath) => {
  if (!filePath || typeof filePath !== "string") {
    return { ok: false, error: "Kein Dateipfad angegeben." };
  }
  const error = await shell.openPath(filePath);
  return error ? { ok: false, error } : { ok: true };
});

// Datei löschen (Verlauf-Eintrag entfernen soll auch die echte Datei löschen).
// fs.unlink wirkt nur auf Dateien, nie auf Verzeichnisse.
ipcMain.handle("file:delete", async (_event, filePath) => {
  if (!filePath || typeof filePath !== "string") {
    return { ok: false, error: "Kein Dateipfad angegeben." };
  }
  try {
    await fs.promises.unlink(filePath);
    return { ok: true };
  } catch (err) {
    if (err.code === "ENOENT") return { ok: true }; // bereits gelöscht
    return { ok: false, error: err.message };
  }
});

// Window controls (für Vela App Titelleiste)
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

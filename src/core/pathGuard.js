"use strict";
/**
 * Pfadpruefung fuer die IPC-Handler file:open, file:delete und folder:open.
 *
 * Erlaubt sind nur Pfade unterhalb des Standard-Download-Ordners und unterhalb
 * von Ordnern, die der Nutzer im System-Dialog selbst gewaehlt hat (diese
 * Liste liegt im userData-Ordner). Symlinks und Junctions werden aufgeloest,
 * damit sich niemand aus dem erlaubten Bereich hinausschmuggeln kann.
 */
const fs = require("node:fs");
const path = require("node:path");

// Nur Medien-, Text- und Bildformate duerfen geoeffnet oder geloescht werden.
// Alles andere (.exe, .bat, .cmd, .ps1, .msi, .lnk, .js ...) wird abgelehnt.
const SAFE_FILE_EXTENSIONS = new Set([
  ".mp4", ".mkv", ".webm", ".mov", ".m4v", ".avi",
  ".mp3", ".m4a", ".aac", ".opus", ".ogg", ".oga", ".wav", ".flac",
  ".txt", ".srt", ".vtt", ".jpg", ".jpeg", ".png", ".webp"
]);

const isInside = (child, root) => {
  const rel = path.relative(root, child);
  if (rel === "") return true;
  if (path.isAbsolute(rel)) return false;
  return rel !== ".." && !rel.startsWith(".." + path.sep);
};

// Echter Pfad (Symlinks aufgeloest). Existiert das Ziel noch nicht, wird der
// laengste vorhandene Vorfahre aufgeloest und der Rest angehaengt.
const realpathLoose = (target) => {
  let current = path.resolve(target);
  const rest = [];
  for (;;) {
    try {
      const real = fs.realpathSync.native(current);
      return rest.length ? path.join(real, ...rest.reverse()) : real;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(target);
      rest.push(path.basename(current));
      current = parent;
    }
  }
};

const isUncOrDevicePath = (p) => /^[\\/]{2}/.test(p);

const validString = (value) => typeof value === "string" && value.length > 0 && !value.includes("\0");

const systemFolders = () => [process.env.SystemRoot, process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.ProgramData]
  .filter(Boolean)
  .map(realpathLoose);

const createFolderPolicy = ({ defaultFolder, storeFile }) => {
  const roots = new Set();

  try {
    const stored = JSON.parse(fs.readFileSync(storeFile, "utf8"));
    if (Array.isArray(stored)) {
      for (const entry of stored) {
        if (validString(entry) && path.isAbsolute(entry) && !isUncOrDevicePath(entry)) roots.add(path.resolve(entry));
      }
    }
  } catch { /* noch keine Liste vorhanden */ }

  const save = () => {
    try {
      fs.mkdirSync(path.dirname(storeFile), { recursive: true });
      fs.writeFileSync(storeFile, JSON.stringify([...roots], null, 2));
    } catch { /* best effort */ }
  };

  const allowedRoots = () => [defaultFolder, ...roots].map(realpathLoose);
  const underRoot = (real) => allowedRoots().some((root) => isInside(real, root));

  /** Nur fuer vertrauenswuerdigen Code (Auswahl im System-Dialog) aufrufen. */
  const allow = (folder) => {
    if (!validString(folder) || !path.isAbsolute(folder) || isUncOrDevicePath(folder)) {
      return { ok: false, error: "Ungueltiger Ordner." };
    }
    const real = realpathLoose(folder);
    if (path.parse(real).root === real) {
      return { ok: false, error: "Ein ganzes Laufwerk kann nicht als Download-Ordner freigegeben werden." };
    }
    if (systemFolders().some((sys) => isInside(real, sys))) {
      return { ok: false, error: "Systemordner koennen nicht als Download-Ordner freigegeben werden." };
    }
    roots.add(path.resolve(folder));
    save();
    return { ok: true, path: real };
  };

  const checkFolder = (folder, { mustExist = false } = {}) => {
    if (!validString(folder) || !path.isAbsolute(folder) || isUncOrDevicePath(folder)) {
      return { ok: false, error: "Ungueltiger Ordnerpfad." };
    }
    const real = realpathLoose(folder);
    if (!underRoot(real)) {
      return { ok: false, error: "Ordner liegt ausserhalb der freigegebenen Download-Ordner." };
    }
    let stat = null;
    try { stat = fs.statSync(real); } catch { /* existiert noch nicht */ }
    if (stat && !stat.isDirectory()) return { ok: false, error: "Das ist kein Ordner." };
    if (!stat && mustExist) return { ok: false, error: "Ordner existiert nicht." };
    return { ok: true, path: real };
  };

  const checkFile = (file) => {
    if (!validString(file) || !path.isAbsolute(file) || isUncOrDevicePath(file)) {
      return { ok: false, error: "Ungueltiger Dateipfad." };
    }
    if (!SAFE_FILE_EXTENSIONS.has(path.extname(file).toLowerCase())) {
      return { ok: false, error: "Dieser Dateityp wird aus Sicherheitsgruenden nicht geoeffnet oder geloescht." };
    }
    let lstat;
    try { lstat = fs.lstatSync(file); } catch (err) {
      if (err.code !== "ENOENT") return { ok: false, error: err.message };
      // Fehlende Datei: nur innerhalb der freigegebenen Ordner als "bereits weg" melden.
      return underRoot(realpathLoose(file))
        ? { ok: false, missing: true, error: "Datei nicht gefunden." }
        : { ok: false, error: "Datei liegt ausserhalb der freigegebenen Download-Ordner." };
    }
    if (lstat.isSymbolicLink() || !lstat.isFile()) {
      return { ok: false, error: "Nur normale Dateien sind erlaubt." };
    }
    const real = realpathLoose(file);
    if (!SAFE_FILE_EXTENSIONS.has(path.extname(real).toLowerCase()) || !underRoot(real)) {
      return { ok: false, error: "Datei liegt ausserhalb der freigegebenen Download-Ordner." };
    }
    return { ok: true, path: real };
  };

  return { allow, checkFolder, checkFile, allowedRoots };
};

module.exports = { createFolderPolicy, SAFE_FILE_EXTENSIONS };

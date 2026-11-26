"use strict";
/**
 * Path validation for the IPC handlers file:open, file:delete and folder:open.
 *
 * Only paths below the default download folder and below folders that
 * the user chose themselves in the system dialog are allowed (this
 * list is stored in the userData folder). Symlinks and junctions are resolved
 * so nobody can sneak out of the allowed area.
 */
const fs = require("node:fs");
const path = require("node:path");

// Only media, text and image formats may be opened or deleted.
// Everything else (.exe, .bat, .cmd, .ps1, .msi, .lnk, .js ...) is rejected.
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

// Real path (symlinks resolved). If the target does not exist yet, the
// longest existing ancestor is resolved and the rest appended.
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
  } catch { /* no list yet */ }

  const save = () => {
    try {
      fs.mkdirSync(path.dirname(storeFile), { recursive: true });
      fs.writeFileSync(storeFile, JSON.stringify([...roots], null, 2));
    } catch { /* best effort */ }
  };

  const allowedRoots = () => [defaultFolder, ...roots].map(realpathLoose);
  const underRoot = (real) => allowedRoots().some((root) => isInside(real, root));

  /** Only call for trusted code (selection in the system dialog). */
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
    try { stat = fs.statSync(real); } catch { /* does not exist yet */ }
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
      // Missing file: only report as "already gone" inside the allowed folders.
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

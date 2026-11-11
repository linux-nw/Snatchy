const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createFolderPolicy } = require("../src/core/pathGuard");

const baue = () => {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "snatchy-pfad-"));
  const downloads = path.join(wurzel, "Downloads");
  const fremd = path.join(wurzel, "Fremd");
  fs.mkdirSync(downloads);
  fs.mkdirSync(fremd);
  const speicher = path.join(wurzel, "userData", "allowed-folders.json");
  const policy = createFolderPolicy({ defaultFolder: downloads, storeFile: speicher });
  return { wurzel, downloads, fremd, speicher, policy };
};

test("Datei im Download-Ordner wird freigegeben", () => {
  const { downloads, policy } = baue();
  const datei = path.join(downloads, "lied.mp3");
  fs.writeFileSync(datei, "x");
  const r = policy.checkFile(datei);
  assert.equal(r.ok, true);
});

test("Programmdateien werden nie geoeffnet oder geloescht", () => {
  const { downloads, policy } = baue();
  for (const name of ["a.exe", "b.bat", "c.cmd", "d.ps1", "e.msi", "f.lnk", "g.js", "h.vbs", "i.com", "j"]) {
    const datei = path.join(downloads, name);
    fs.writeFileSync(datei, "x");
    assert.equal(policy.checkFile(datei).ok, false, name);
  }
});

test("Endung wird ohne Beachtung der Gross-/Kleinschreibung geprueft", () => {
  const { downloads, policy } = baue();
  const datei = path.join(downloads, "x.EXE");
  fs.writeFileSync(datei, "x");
  assert.equal(policy.checkFile(datei).ok, false);
});

test("Datei ausserhalb der freigegebenen Ordner wird abgelehnt", () => {
  const { fremd, policy } = baue();
  const datei = path.join(fremd, "film.mp4");
  fs.writeFileSync(datei, "x");
  assert.equal(policy.checkFile(datei).ok, false);
});

test("Pfad mit .. aus dem Download-Ordner heraus wird abgelehnt", () => {
  const { downloads, fremd, policy } = baue();
  fs.writeFileSync(path.join(fremd, "film.mp4"), "x");
  const trick = path.join(downloads, "..", "Fremd", "film.mp4");
  assert.equal(policy.checkFile(trick).ok, false);
});

test("relative Pfade, UNC-Pfade und leere Eingaben werden abgelehnt", () => {
  const { policy } = baue();
  for (const eingabe of ["lied.mp3", "\\\\server\\share\\lied.mp3", "//server/share/lied.mp3", "", null, undefined, 42, {}]) {
    assert.equal(policy.checkFile(eingabe).ok, false, String(eingabe));
  }
});

test("fehlende Datei im erlaubten Ordner meldet missing", () => {
  const { downloads, policy } = baue();
  const r = policy.checkFile(path.join(downloads, "weg.mp3"));
  assert.equal(r.ok, false);
  assert.equal(r.missing, true);
});

test("Verzeichnis mit Medien-Endung wird nicht als Datei akzeptiert", () => {
  const { downloads, policy } = baue();
  const ordner = path.join(downloads, "album.mp3");
  fs.mkdirSync(ordner);
  assert.equal(policy.checkFile(ordner).ok, false);
});

test("Symlink aus dem Download-Ordner auf eine fremde Datei wird abgelehnt", (t) => {
  const { downloads, fremd, policy } = baue();
  const ziel = path.join(fremd, "geheim.mp3");
  fs.writeFileSync(ziel, "x");
  const link = path.join(downloads, "link.mp3");
  try { fs.symlinkSync(ziel, link); } catch { t.skip("Symlinks sind hier nicht erlaubt"); return; }
  assert.equal(policy.checkFile(link).ok, false);
});

test("Unterordner im Download-Ordner sind erlaubt, fremde Ordner nicht", () => {
  const { downloads, fremd, policy } = baue();
  const sub = path.join(downloads, "Musik");
  fs.mkdirSync(sub);
  assert.equal(policy.checkFolder(sub, { mustExist: true }).ok, true);
  assert.equal(policy.checkFolder(fremd, { mustExist: true }).ok, false);
  assert.equal(policy.checkFolder(path.join(downloads, "neu")).ok, true, "noch nicht vorhandener Unterordner");
  assert.equal(policy.checkFolder(path.join(downloads, "neu"), { mustExist: true }).ok, false);
});

test("allow() gibt einen gewaehlten Ordner frei und merkt ihn sich", () => {
  const { fremd, speicher, downloads, policy } = baue();
  assert.equal(policy.checkFolder(fremd).ok, false);
  assert.equal(policy.allow(fremd).ok, true);
  assert.equal(policy.checkFolder(fremd).ok, true);
  const datei = path.join(fremd, "ton.opus");
  fs.writeFileSync(datei, "x");
  assert.equal(policy.checkFile(datei).ok, true);
  // neue Instanz liest die gespeicherte Liste
  const neu = createFolderPolicy({ defaultFolder: downloads, storeFile: speicher });
  assert.equal(neu.checkFolder(fremd).ok, true);
});

test("allow() lehnt Laufwerkswurzeln und ungueltige Eingaben ab", () => {
  const { policy } = baue();
  assert.equal(policy.allow(path.parse(os.tmpdir()).root).ok, false);
  assert.equal(policy.allow("relativ").ok, false);
  assert.equal(policy.allow("").ok, false);
  assert.equal(policy.allow(null).ok, false);
});

test("allow() lehnt Systemordner ab", { skip: process.platform !== "win32" }, () => {
  const { policy } = baue();
  assert.equal(policy.allow(path.join(process.env.SystemRoot, "System32")).ok, false);
});

test("fehlende Datei ausserhalb der freigegebenen Ordner meldet nicht missing", () => {
  const { fremd, policy } = baue();
  const r = policy.checkFile(path.join(fremd, "weg.mp3"));
  assert.equal(r.ok, false);
  assert.notEqual(r.missing, true);
});

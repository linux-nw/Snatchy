# Snatchy

**Status:** 🟢 Aktiv · Version 1.0.0

Desktop-App (Electron) für Windows zum Herunterladen von Video und Audio über yt-dlp.

**Name:** "To snatch" heißt schnappen. Snatchy schnappt sich Videos und Musik.

---

## Download

➡️ [Neueste Version](https://github.com/linux-nw/snatchy/releases/latest) als Installer (`Snatchy Setup x.y.z.exe`) oder portabel (`Snatchy x.y.z.exe`).

Windows SmartScreen kann beim ersten Start "Unbekannter Herausgeber" melden, weil die Datei nicht signiert ist. Mit "Weitere Informationen" und "Trotzdem ausführen" startet sie.

---

## Nutzung

1. Link zu einem Video oder einer Playlist einfügen.
2. MP4 (Video) oder MP3 (Audio) wählen.
3. Downloads laufen in der Warteschlange, Fortschritt und Verlauf stehen in der App.

Im Installer enthalten, nichts davon musst du selbst installieren: yt-dlp, ffmpeg, deno und aria2c.

Optional und nicht enthalten:

- Playwright Chromium für Seiten, die yt-dlp nicht direkt kann: `npx playwright install chromium`
- Whisper für Transkripte von Videos ohne Untertitel (braucht Python): `pip install -U openai-whisper`

---

## Selbst bauen

Voraussetzungen: Windows, Node.js 18 oder neuer.

```bash
npm install
npm run dist
```

`npm run dist` lädt die enthaltenen Programme per `scripts/fetch-binaries.js` (mit SHA-256-Prüfung) und baut Installer und portable Version nach `dist/`. Zum Entwickeln einmal `npm run fetch-binaries`, dann `npm start`. Tests: `npm test`.

---

## Repo-Struktur

```
src/        App (Hauptprozess, Oberfläche, Downloader, Anmeldung)
scripts/    Build und Download der enthaltenen Programme
tests/      Tests
assets/     Icons
tokens/     Design-Tokens
components/ Oberflächen-Komponenten
```

Das Design System ist in [design-system.md](design-system.md) beschrieben.

---

## Datenschutz

Keine Telemetrie. Downloads laufen direkt zwischen deinem Rechner und der jeweiligen Seite.

---

## Lizenz

Noch offen.

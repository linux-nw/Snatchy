# Snatchy

**Status:** 🟢 Active · Version 1.0.0

Desktop app (Electron) for Windows to download video and audio via yt-dlp.

**Name:** "To snatch" means to grab. Snatchy grabs videos and music.

---

## Download

➡️ [Latest version](https://github.com/linux-nw/snatchy/releases/latest) as an installer (`Snatchy Setup x.y.z.exe`) or portable (`Snatchy x.y.z.exe`).

Windows SmartScreen may show "Unknown publisher" on first launch because the file is not signed. Click "More info" and then "Run anyway" to start it.

---

## Usage

1. Paste a link to a video or a playlist.
2. Choose MP4 (video) or MP3 (audio).
3. Downloads run in a queue, progress and history are shown in the app.

Included in the installer, you do not have to install any of these yourself: yt-dlp, ffmpeg, deno and aria2c.

Optional and not included:

- Playwright Chromium for sites yt-dlp cannot handle directly: `npx playwright install chromium`
- Whisper for transcripts of videos without subtitles (needs Python): `pip install -U openai-whisper`

---

## Build it yourself

Requirements: Windows, Node.js 18 or newer.

```bash
npm install
npm run dist
```

`npm run dist` fetches the bundled programs via `scripts/fetch-binaries.js` (with SHA-256 verification) and builds the installer and portable version into `dist/`. For development run `npm run fetch-binaries` once, then `npm start`. Tests: `npm test`.

---

## Repo structure

```
src/        app (main process, UI, downloader, login)
scripts/    build and download of the bundled programs
tests/      tests
assets/     icons
tokens/     design tokens
components/ UI components
```

The design system is described in [design-system.md](design-system.md).

---

## Privacy

No telemetry. Downloads go directly between your computer and the respective site.

---

## License

[PolyForm Noncommercial 1.0.0](LICENSE). Personal and non-commercial use is free. For commercial use, please get in touch.
/* ============================================================
   Snatchy - Renderer Process
   Steuert die React App und kommuniziert mit Electron Backend
   ============================================================ */

// Backend API Bridge
const getYtxAPI = () => {
  if (!window.ytx) {
    const noopListen = () => () => {};
    window.ytx = {
      getState: async () => ({ defaultDownloadFolder: "Downloads", platform: "browser" }),
      setTheme: async () => ({ ok: true }),
      selectFolder: async () => null,
      startDownload: async () => ({ ok: false, error: "Download ist nur in Electron verfügbar." }),
      cancelDownload: async () => ({ ok: true }),
      openFolder: async () => ({ ok: true }),
      openFile: async () => ({ ok: true }),
      deleteFile: async () => ({ ok: true }),
      resolvePodcast: async () => ({ ok: false, error: "Nur in Electron verfügbar." }),
      onStarted: noopListen,
      onProgress: noopListen,
      onLog: noopListen,
      onCompleted: noopListen,
      onFailed: noopListen
    };
  }
  return window.ytx;
};

// Vela Design System Komponenten
const { Button, IconButton, Badge, Spinner } = window.VelaDesignSystem_f6c677 || {};
const { Input, Switch, Select } = window.VelaDesignSystem_f6c677 || {};

// Fallback: Wenn Bundle nicht geladen ist
if (!window.VelaDesignSystem_f6c677) {
  console.warn('Vela Design System Bundle nicht geladen');
}

const { useState, useEffect, useLayoutEffect, useCallback, useRef } = React;

// Dateinamen aus einem yt-dlp Logeintrag extrahieren (best effort)
function parseFilenameFromLog(line) {
  let match = line.match(/Merging formats into "(.+?)"/);
  if (!match) match = line.match(/Destination:\s*(.+)$/);
  if (!match) match = line.match(/\[download\]\s+(.+?) has already been downloaded/);
  if (!match) return null;
  const full = match[1].trim();
  const parts = full.split(/[\\/]/);
  return parts[parts.length - 1] || full;
}

// Verlauf-Zeitstempel im Format TT.MM.JJ:HH.MM (fester Wunschformat, nicht Locale-abhängig).
function formatHistoryTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${pad(d.getFullYear() % 100)}:${pad(d.getHours())}.${pad(d.getMinutes())}`;
}

// Episoden-Datum im Folgen-Auswahldialog: Roh-RSS-Datum ("Wed, 02 Jul 2026 …")
// in ein kurzes, lesbares Format bringen; unparsebare Werte unverändert zeigen.
function formatPubDate(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Dateiformat-Tag (MP4/MP3/TXT) samt Farbe je Format – dieselben Farben wie bei
// den Format-Icons (Video=teal, Audio=indigo, Transkript=lila).
function formatTagInfo(format) {
  if (format === 'transcript') return { label: 'TXT', color: 'var(--vela-tertiary, oklch(0.78 0.15 300))' };
  if (format === 'audio') return { label: 'MP3', color: 'var(--vela-audio)' };
  return { label: 'MP4', color: 'var(--vela-video)' };
}

// Heuristik: Sieht die URL nach einer Playlist/Sammlung aus? Deckt die gängigen
// Plattformen ab (nicht nur YouTube), ohne yt-dlp zu befragen:
//  - YouTube:    ?list=… / &list=… / &index=… / /playlist
//  - SoundCloud: /sets/
//  - Bandcamp/Spotify/Vimeo: /album/ , /showcase/
//  - generisch:  das Wort "playlist", /series/
// Für 100% Sicherheit müsste man yt-dlp proben – hier bewusst sofort & offline.
function looksLikePlaylist(url) {
  if (!url) return false;
  return /(\bplaylist\b)|([?&](list|playlist)=)|([?&]index=\d)|(\/sets\/)|(\/albums?\/)|(\/showcase\/)|(\/series\/)/i.test(url);
}

// Heuristik: Sieht die URL nach einem Podcast-RSS-Feed aus? Deckt die
// gängigen Hosting-Anbieter ab (Hostname beginnt oft mit "feeds."/"feed.")
// sowie typische Pfad-/Endungsmuster – ohne den Feed selbst abzufragen,
// rein für die Format-Vorauswahl in der UI.
function looksLikePodcastFeed(url) {
  if (!url) return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  if (!/^https?:$/i.test(u.protocol)) return false;
  const host = u.hostname.replace(/^www\./, '');
  if (/^feeds?\./i.test(host)) return true;
  if (/(^|\.)(anchor\.fm|libsyn\.com|feedburner\.com|feedpress\.me)$/i.test(host)) return true;
  if (/\.(xml|rss)(\?|$)/i.test(u.pathname)) return true;
  if (/\/(rss|feed)(\/|\.xml)?$/i.test(u.pathname)) return true;
  return false;
}

// Erkennt die Plattform anhand des Hostnamens für das kleine Badge neben der
// URL-Leiste – rein kosmetisch/informativ, ändert nichts am Download selbst
// (der läuft für alle über dieselbe yt-dlp-Pipeline). Bei SoundCloud/Bandcamp
// zusätzlich ein Hinweis, dass Downloads dort oft vom Urheber selbst erlaubt sind.
const PLATFORMS = [
  { id: 'youtube', label: 'YouTube', re: /(^|\.)youtube\.com$|^youtu\.be$/i },
  { id: 'twitch', label: 'Twitch', re: /(^|\.)twitch\.tv$/i },
  { id: 'tiktok', label: 'TikTok', re: /(^|\.)tiktok\.com$/i },
  { id: 'instagram', label: 'Instagram', re: /(^|\.)instagram\.com$/i },
  { id: 'twitter', label: 'X / Twitter', re: /(^|\.)(twitter\.com|x\.com)$/i },
  { id: 'facebook', label: 'Facebook', re: /(^|\.)facebook\.com$|^fb\.watch$/i },
  { id: 'reddit', label: 'Reddit', re: /(^|\.)reddit\.com$/i },
  { id: 'vimeo', label: 'Vimeo', re: /(^|\.)vimeo\.com$/i },
  { id: 'dailymotion', label: 'Dailymotion', re: /(^|\.)dailymotion\.com$/i },
  { id: 'bilibili', label: 'Bilibili', re: /(^|\.)bilibili\.com$/i },
  { id: 'soundcloud', label: 'SoundCloud', re: /(^|\.)soundcloud\.com$/i, note: 'Download hier oft vom Künstler erlaubt' },
  { id: 'bandcamp', label: 'Bandcamp', re: /\.bandcamp\.com$/i, note: 'Download hier oft vom Künstler erlaubt' }
];

function detectPlatform(url) {
  if (!url) return null;
  let host;
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
  return PLATFORMS.find((p) => p.re.test(host)) || null;
}


// SVG Icons
function IconDownload() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>;
}

function IconTrash() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>;
}

function IconRetry() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>;
}

function IconPlay() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>;
}

function IconFolder() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
}

function IconVideo() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>;
}

function IconAudio() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>;
}

function IconText() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="8" y1="9" x2="10" y2="9"/></svg>;
}

function IconPodcast() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11a8 8 0 0 1 16 0"/><path d="M6.5 11a5.5 5.5 0 0 1 11 0"/><circle cx="12" cy="11" r="2"/><path d="M12 13v3"/><path d="M9 20h6"/></svg>;
}

function IconClose() {
  return <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><line x1="0" y1="0" x2="10" y2="10"/><line x1="10" y1="0" x2="0" y2="10"/></svg>;
}

function IconMinimize() {
  return <svg width="10" height="1" viewBox="0 0 10 1" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><line x1="0" y1=".5" x2="10" y2=".5"/></svg>;
}

function IconMaximize() {
  return <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><rect x=".5" y=".5" width="9" height="9" fill="none"/></svg>;
}

function IconWarn() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>;
}

function IconGear() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
}

// Vela App Hauptkomponente
function VelaApp() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('video');
  const [quality, setQuality] = useState('best');
  const [transcriptLang, setTranscriptLang] = useState('auto');
  const [whisperModel, setWhisperModel] = useState('base');
  const [playlistMode, setPlaylistMode] = useState('single');
  const [downloads, setDownloads] = useState([]);
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ytx-history') || '[]'); } catch { return []; }
  });
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);
  const [copiedHistoryId, setCopiedHistoryId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [folder, setFolder] = useState('');
  const [autoStart, setAutoStart] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [openAfter, setOpenAfter] = useState(false);
  const [openFileAfter, setOpenFileAfter] = useState(false);
  const [encoding, setEncoding] = useState('utf-8');
  const [cookiesBrowser, setCookiesBrowser] = useState('none');
  const [playwrightFallback, setPlaywrightFallback] = useState(false);
  const [coverArt, setCoverArt] = useState('default');
  const [theme, setTheme] = useState('dark');
  // Podcast-Folgenauswahl: null = geschlossen, sonst { feedUrl, loading, error, episodes }.
  const [podcastPicker, setPodcastPicker] = useState(null);
  // Anpassbare Anzahl für die "Erste N" / "Letzte N" Schnellauswahl im Folgen-Dialog.
  // Als String gehalten (nicht Number), damit das Feld beim Leeren wirklich leer
  // bleibt statt auf "0" zu springen.
  const [episodeCountInput, setEpisodeCountInput] = useState('5');
  // Backend-Abhängigkeiten (Default true, damit vor der Prüfung keine Warnung blitzt)
  const [deps, setDeps] = useState({ ytDlpAvailable: true, ffmpegAvailable: true });

  const ytx = getYtxAPI();

  // Id des aktuell laufenden Downloads (für Backend-Events)
  const activeIdRef = useRef(null);
  // Aktuellen Ordner für Event-Handler verfügbar halten
  const folderRef = useRef(folder);
  useEffect(() => { folderRef.current = folder; }, [folder]);
  // Benachrichtigungs-Einstellung + Download-Liste für Event-Handler spiegeln
  const notificationsRef = useRef(notifications);
  useEffect(() => { notificationsRef.current = notifications; }, [notifications]);
  const openAfterRef = useRef(openAfter);
  useEffect(() => { openAfterRef.current = openAfter; }, [openAfter]);
  const openFileAfterRef = useRef(openFileAfter);
  useEffect(() => { openFileAfterRef.current = openFileAfter; }, [openFileAfter]);
  const downloadsRef = useRef(downloads);
  useEffect(() => { downloadsRef.current = downloads; }, [downloads]);

  // Initialisierung
  useEffect(() => {
    const init = async () => {
      const savedTheme = localStorage.getItem('ytx-theme') || 'dark';
      setTheme(savedTheme);
      document.body.dataset.theme = savedTheme;

      const savedAuto = localStorage.getItem('ytx-auto-start');
      if (savedAuto !== null) setAutoStart(savedAuto === 'true');
      const savedNotif = localStorage.getItem('ytx-notifications');
      if (savedNotif !== null) setNotifications(savedNotif === 'true');
      const savedOpenAfter = localStorage.getItem('ytx-open-after');
      if (savedOpenAfter !== null) setOpenAfter(savedOpenAfter === 'true');
      const savedOpenFileAfter = localStorage.getItem('ytx-open-file-after');
      if (savedOpenFileAfter !== null) setOpenFileAfter(savedOpenFileAfter === 'true');
      const savedEncoding = localStorage.getItem('ytx-encoding');
      if (savedEncoding) setEncoding(savedEncoding);
      const savedCookies = localStorage.getItem('ytx-cookies-browser');
      if (savedCookies) setCookiesBrowser(savedCookies);
      const savedPw = localStorage.getItem('ytx-playwright-fallback');
      if (savedPw !== null) setPlaywrightFallback(savedPw === 'true');
      const savedCoverArt = localStorage.getItem('ytx-cover-art');
      if (savedCoverArt) setCoverArt(savedCoverArt);
      const savedModel = localStorage.getItem('ytx-whisper-model');
      if (savedModel) setWhisperModel(savedModel);
      const savedLang = localStorage.getItem('ytx-transcript-lang');
      if (savedLang) setTranscriptLang(savedLang);

      try {
        const state = await ytx.getState();
        const savedFolder = localStorage.getItem('ytx-output-folder');
        if (savedFolder) {
          setFolder(savedFolder);
        } else {
          setFolder(state.defaultDownloadFolder || 'Downloads');
        }
        setDeps({
          ytDlpAvailable: state.ytDlpAvailable !== false,
          ffmpegAvailable: state.ffmpegAvailable !== false
        });
      } catch (e) {
        console.error('Initialisierung fehlgeschlagen:', e);
      }
    };
    init();
  }, []);

  // Theme anwenden
  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem('ytx-theme', theme);
    ytx.setTheme(theme);
  }, [theme, ytx]);

  // Verhalten-Einstellungen persistieren
  useEffect(() => { if (folder) localStorage.setItem('ytx-output-folder', folder); }, [folder]);
  useEffect(() => { localStorage.setItem('ytx-auto-start', String(autoStart)); }, [autoStart]);
  useEffect(() => { localStorage.setItem('ytx-notifications', String(notifications)); }, [notifications]);
  useEffect(() => { localStorage.setItem('ytx-open-after', String(openAfter)); }, [openAfter]);
  useEffect(() => { localStorage.setItem('ytx-open-file-after', String(openFileAfter)); }, [openFileAfter]);
  useEffect(() => { localStorage.setItem('ytx-encoding', encoding); }, [encoding]);
  useEffect(() => { localStorage.setItem('ytx-cookies-browser', cookiesBrowser); }, [cookiesBrowser]);
  useEffect(() => { localStorage.setItem('ytx-playwright-fallback', String(playwrightFallback)); }, [playwrightFallback]);
  useEffect(() => { localStorage.setItem('ytx-cover-art', coverArt); }, [coverArt]);
  useEffect(() => { localStorage.setItem('ytx-whisper-model', whisperModel); }, [whisperModel]);
  useEffect(() => { localStorage.setItem('ytx-transcript-lang', transcriptLang); }, [transcriptLang]);
  useEffect(() => { localStorage.setItem('ytx-history', JSON.stringify(history)); }, [history]);

  // Format automatisch an die eingefügte URL anpassen, damit keine unsinnige
  // Kombination (z. B. Podcast-Format bei einem YouTube-Link) stehen bleibt.
  // Sieht die URL nach einem RSS-Feed aus → auf Podcast wechseln, sonst weg
  // von Podcast zurück auf Video (die anderen drei Formate bleiben, wie sie waren).
  useEffect(() => {
    if (!url.trim()) return;
    const feedLikely = looksLikePodcastFeed(url);
    if (feedLikely && format !== 'podcast') {
      setFormat('podcast');
    } else if (!feedLikely && format === 'podcast') {
      setFormat('video');
      setQuality('1080p');
    }
  }, [url]);

  // Kurzer "Gespeichert"-Hinweis in den Einstellungen bei jeder Änderung –
  // übersprungen beim ersten Mount (Laden der gespeicherten Werte ist kein "Speichern").
  const settingsMountedRef = useRef(false);
  const settingsSavedTimeoutRef = useRef(null);
  useEffect(() => {
    if (!settingsMountedRef.current) { settingsMountedRef.current = true; return; }
    setSettingsSaved(true);
    clearTimeout(settingsSavedTimeoutRef.current);
    settingsSavedTimeoutRef.current = setTimeout(() => setSettingsSaved(false), 1800);
    return () => clearTimeout(settingsSavedTimeoutRef.current);
  }, [folder, autoStart, notifications, openAfter, openFileAfter, encoding, cookiesBrowser, playwrightFallback, coverArt, whisperModel, transcriptLang]);

  // Backend Events: Fortschritt, Logs, Abschluss, Fehler
  useEffect(() => {
    const updateActive = (patch) => {
      setDownloads(prev => prev.map(d =>
        d.id === activeIdRef.current ? { ...d, ...(typeof patch === 'function' ? patch(d) : patch) } : d
      ));
    };

    const unsubscribeProgress = ytx.onProgress((progress) => {
      if (progress.percent === undefined) return;
      updateActive({
        progress: progress.percent,
        speed: progress.speed || undefined,
        eta: progress.eta || undefined,
        filesize: progress.total || undefined
      });
    });

    const unsubscribeLog = ytx.onLog((line) => {
      console.log('[Backend]', line);
      // Whisper-Phase markieren, damit die Zeile einen unbestimmten Fortschritt zeigt.
      if (/^\[Whisper\]/.test(line)) updateActive({ transcribing: true });
      // Bei Podcast-Episoden bleibt der saubere Episodentitel stehen, statt vom
      // (oft technischeren) Dateinamen aus dem Enclosure-Link überschrieben zu werden.
      const activeItem = downloadsRef.current.find(d => d.id === activeIdRef.current);
      if (activeItem && activeItem.displayNameLocked) return;
      const name = parseFilenameFromLog(line);
      if (name) updateActive({ filename: name });
    });

    const unsubscribeCompleted = ytx.onCompleted((payload) => {
      const id = activeIdRef.current;
      activeIdRef.current = null;
      const item = downloadsRef.current.find(d => d.id === id);
      // Fertige Datei: Video-/MP3-Pfad oder – bei Transkripten – die .txt-Datei.
      const targetPath = payload && (payload.filePath || payload.transcriptPath);
      if (notificationsRef.current && item && typeof Notification !== 'undefined') {
        try {
          const n = new Notification('Download abgeschlossen', { body: item.filename || item.url });
          // Klick auf die Benachrichtigung öffnet die fertige Datei direkt.
          n.onclick = () => ytx.openFile(targetPath || folderRef.current);
        } catch (e) { /* Notification nicht verfügbar */ }
      }
      if (openAfterRef.current) {
        ytx.openFolder(folderRef.current);
      }
      if (openFileAfterRef.current && targetPath) {
        ytx.openFile(targetPath);
      }
      // Abgeschlossene Downloads wandern sofort in den Verlauf, statt in der
      // Warteschlange als "done" liegen zu bleiben.
      setDownloads(prev => prev.filter(d => d.id !== id));
      if (item) {
        const entry = {
          id: item.id,
          url: item.url,
          filename: item.filename,
          format: item.format,
          completedAt: Date.now(),
          outputFolder: (payload && payload.outputFolder) || folderRef.current,
          filePath: payload && payload.filePath,
          transcriptText: payload && payload.transcriptText,
          transcriptPath: payload && payload.transcriptPath,
          thumbnailUrl: payload && payload.thumbnailUrl
        };
        setHistory(prev => [entry, ...prev].slice(0, 20));
      }
    });

    const unsubscribeFailed = ytx.onFailed((message) => {
      console.error('Download fehlgeschlagen:', message);
      const id = activeIdRef.current;
      activeIdRef.current = null;
      setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'error', speed: undefined, eta: undefined, error: message } : d));
    });

    return () => {
      unsubscribeProgress();
      unsubscribeLog();
      unsubscribeCompleted();
      unsubscribeFailed();
    };
  }, [ytx]);

  // Einen Eintrag im Backend starten
  const startItem = useCallback((item) => {
    activeIdRef.current = item.id;
    setDownloads(prev => prev.map(d => d.id === item.id ? { ...d, status: 'downloading', progress: 0 } : d));

    const options = {
      url: item.url,
      format: item.format === 'audio' ? 'mp3' : item.format === 'transcript' ? 'transcript' : 'mp4',
      quality: item.format === 'video' ? String(item.quality).replace(/p$/i, '') : undefined,
      audioQuality: item.format === 'audio' && item.quality ? String(item.quality).toUpperCase() : undefined,
      lang: item.format === 'transcript' ? (item.lang || 'auto') : undefined,
      whisperModel: item.whisperModel || 'base',
      playlistMode: item.playlistMode === 'single' ? 'single-video'
        : item.playlistMode === 'combined' ? 'playlist-combined'
        : 'playlist-items',
      outputFolder: folderRef.current,
      encoding: item.encoding || 'utf-8',
      cookiesBrowser: item.cookiesBrowser || 'none',
      playwrightFallback: !!item.playwrightFallback,
      // Gilt für alle Formate: Video (MP4), Audio/Podcast-Folgen (MP3, echtes
      // Einbetten) und Transkript (TXT, nur Vorschau im Verlauf).
      embedCoverArt: item.coverArt === 'thumbnail'
    };

    ytx.startDownload(options).then(result => {
      if (!result.ok) {
        setDownloads(prev => prev.map(d => d.id === item.id ? { ...d, status: 'error', error: result.error } : d));
        if (activeIdRef.current === item.id) activeIdRef.current = null;
      }
    }).catch(err => {
      console.error('Backend Exception:', err);
      setDownloads(prev => prev.map(d => d.id === item.id ? { ...d, status: 'error', error: String(err) } : d));
      if (activeIdRef.current === item.id) activeIdRef.current = null;
    });
  }, [ytx]);

  // Warteschlange sequentiell abarbeiten: ein Download gleichzeitig
  useEffect(() => {
    if (activeIdRef.current !== null) return;
    if (downloads.some(d => d.status === 'downloading')) return;
    const next = downloads.filter(d => d.status === 'queued').sort((a, b) => a.id - b.id)[0];
    if (next) startItem(next);
  }, [downloads, startItem]);

  // Podcast-RSS-Feed auflösen und den Folgen-Auswahldialog öffnen. Der eigent-
  // liche Download startet erst, wenn der Nutzer im Dialog bestätigt – vorher
  // wird nichts zur Warteschlange hinzugefügt.
  const openPodcastPicker = useCallback((feedUrl) => {
    setPodcastPicker({ feedUrl, loading: true, error: null, episodes: [] });
    ytx.resolvePodcast(feedUrl).then(result => {
      setPodcastPicker(prev => {
        if (!prev || prev.feedUrl !== feedUrl) return prev; // zwischenzeitlich geschlossen/ersetzt
        if (!result.ok) return { ...prev, loading: false, error: result.error };
        return {
          ...prev,
          loading: false,
          episodes: result.episodes.map((ep, idx) => ({ ...ep, idx, selected: true }))
        };
      });
    }).catch(err => {
      setPodcastPicker(prev => (prev && prev.feedUrl === feedUrl) ? { ...prev, loading: false, error: String(err) } : prev);
    });
  }, [ytx]);

  const closePodcastPicker = useCallback(() => setPodcastPicker(null), []);

  const toggleEpisode = useCallback((idx) => {
    setPodcastPicker(prev => prev ? { ...prev, episodes: prev.episodes.map(ep => ep.idx === idx ? { ...ep, selected: !ep.selected } : ep) } : prev);
  }, []);

  const selectAllEpisodes = useCallback((selected) => {
    setPodcastPicker(prev => prev ? { ...prev, episodes: prev.episodes.map(ep => ({ ...ep, selected })) } : prev);
  }, []);

  // Feeds listen Folgen typischerweise neueste zuerst – "Erste N" = Anfang der
  // Liste (neueste), "Letzte N" = Ende der Liste (älteste). n=0 ist explizit
  // erlaubt (wählt nichts aus) statt auf mindestens 1 hochgezwungen zu werden.
  const selectFirstN = useCallback((n) => {
    setPodcastPicker(prev => {
      if (!prev) return prev;
      const count = Math.max(0, Math.min(n, prev.episodes.length));
      return { ...prev, episodes: prev.episodes.map((ep, i) => ({ ...ep, selected: i < count })) };
    });
  }, []);

  const selectLastN = useCallback((n) => {
    setPodcastPicker(prev => {
      if (!prev) return prev;
      const total = prev.episodes.length;
      const count = Math.max(0, Math.min(n, total));
      return { ...prev, episodes: prev.episodes.map((ep, i) => ({ ...ep, selected: i >= total - count })) };
    });
  }, []);

  // Bestätigung: nur die ausgewählten Folgen zur Warteschlange hinzufügen
  // (Audio, URL = direkter Enclosure-Link → läuft über die normale MP3-
  // Pipeline, yt-dlp lädt direkt verlinkte Audiodateien direkt).
  const confirmPodcastPicker = useCallback(() => {
    setPodcastPicker(prev => {
      if (!prev) return prev;
      const selected = prev.episodes.filter(ep => ep.selected);
      if (selected.length === 0) return prev;
      const base = Date.now();
      const newDownloads = selected.map((ep, i) => ({
        id: base + i,
        url: ep.audioUrl,
        filename: ep.title,
        displayNameLocked: true,
        format: 'audio',
        quality,
        encoding,
        cookiesBrowser,
        playwrightFallback,
        coverArt,
        status: autoStart ? 'queued' : 'paused',
        progress: 0,
        filesize: undefined,
        speed: undefined,
        eta: undefined
      }));
      setDownloads(dl => [...newDownloads, ...dl]);
      return null;
    });
  }, [quality, encoding, cookiesBrowser, playwrightFallback, coverArt, autoStart]);

  // Download(s) zur Warteschlange hinzufügen. Erkennt mehrere Links auf einmal
  // (einer pro Zeile/durch Leerraum getrennt, z. B. aus der Zwischenablage
  // eingefügt) und legt für jeden einen eigenen Eintrag an.
  const addDownload = useCallback(() => {
    const trimmed = url.trim();
    if (!trimmed) return;

    if (format === 'podcast') {
      openPodcastPicker(trimmed);
      setUrl('');
      return;
    }

    const urls = trimmed.split(/\s+/).map(s => s.trim()).filter(Boolean);
    const base = Date.now();
    const newDownloads = urls.map((u, i) => ({
      id: base + i,
      url: u,
      filename: u,
      format,
      quality,
      lang: transcriptLang,
      whisperModel,
      playlistMode,
      encoding,
      cookiesBrowser,
      playwrightFallback,
      coverArt,
      status: autoStart ? 'queued' : 'paused',
      progress: 0,
      filesize: undefined,
      speed: undefined,
      eta: undefined
    }));

    setDownloads(prev => [...newDownloads, ...prev]);
    setUrl('');
  }, [url, format, quality, transcriptLang, whisperModel, playlistMode, encoding, cookiesBrowser, playwrightFallback, coverArt, autoStart, openPodcastPicker]);

  // Download entfernen (aktiven Download zuvor abbrechen)
  const removeDownload = (id) => {
    if (activeIdRef.current === id) {
      ytx.cancelDownload();
      activeIdRef.current = null;
    }
    setDownloads(prev => prev.filter(d => d.id !== id));
  };

  // Eintrag (erneut) in die Warteschlange stellen
  const queueDownload = (id) => {
    setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'queued', progress: 0, error: undefined } : d));
  };

  // Ordner öffnen
  const openFolder = () => {
    ytx.openFolder(folder);
  };

  // Ordner wählen
  const chooseFolder = async () => {
    const selected = await ytx.selectFolder();
    if (selected) {
      setFolder(selected);
    }
  };

  // Fehlgeschlagene aus der Warteschlange entfernen (aktive/wartende bleiben)
  const clearErrors = () => {
    setDownloads(prev => prev.filter(d => d.status !== 'error'));
  };

  // Einzelnen Verlaufseintrag entfernen – löscht dabei auch die zugehörige Datei
  // auf der Festplatte (Transkript-.txt bzw. Video-/Audiodatei), nicht nur den Eintrag.
  const removeHistoryEntry = (id) => {
    const entry = history.find(h => h.id === id);
    const target = entry && (entry.transcriptPath || entry.filePath);
    if (target) {
      ytx.deleteFile(target).catch(err => console.error('Datei konnte nicht gelöscht werden:', err));
    }
    setHistory(prev => prev.filter(h => h.id !== id));
    if (expandedHistoryId === id) setExpandedHistoryId(null);
  };

  // Gesamten Verlauf leeren
  const clearHistory = () => {
    setHistory([]);
    setExpandedHistoryId(null);
  };

  // Transkript-Text in die Zwischenablage kopieren
  const copyTranscript = (id, text) => {
    navigator.clipboard.writeText(text || '').then(() => {
      setCopiedHistoryId(id);
      setTimeout(() => setCopiedHistoryId(current => current === id ? null : current), 1800);
    });
  };

  // Anzahl aktive Downloads
  const activeCount = downloads.filter(d => d.status === 'downloading' || d.status === 'queued').length;
  const completedCount = history.length;

  // Format-Optionen
  const qualityOptions = format === 'video'
    ? [{ value: 'best', label: 'Beste verfügbare' }, { value: '480p', label: '480p SD' }, { value: '720p', label: '720p HD' }, { value: '1080p', label: '1080p FHD' }, { value: '2160p', label: '4K UHD' }]
    : [{ value: '128k', label: '128 kbps' }, { value: '192k', label: '192 kbps' }, { value: '256k', label: '256 kbps' }, { value: '320k', label: '320 kbps (best)' }];

  // Sprach-Optionen für das Transkript (Untertitel-Auswahl bzw. Whisper-Sprache).
  // Standard ist "Automatisch": die Sprache wird per KI erkannt (Whisper erkennt
  // sie selbst, sofern keine feste Sprache vorgegeben ist).
  const langOptions = [
    { value: 'auto', label: 'Automatisch erkennen (empfohlen)' },
    { value: 'de', label: 'Deutsch' },
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Español' },
    { value: 'fr', label: 'Français' },
    { value: 'it', label: 'Italiano' },
    { value: 'pt', label: 'Português' },
    { value: 'all', label: 'Alle (Untertitel)' }
  ];

  // Download Row Komponente
  function DownloadItem({ download }) {
    const pct = Math.min(100, Math.max(0, download.progress));
    const isTranscript = download.format === 'transcript';
    // Whisper liefert keinen Prozentwert → unbestimmter (laufender) Balken.
    const indeterminate = download.status === 'queued' || download.status === 'paused' || (isTranscript && download.transcribing);
    const downloadingLabel = isTranscript
      ? (download.transcribing ? 'Transkribiere (Whisper)…' : 'Transkript wird erstellt…')
      : (download.speed ? `${Math.round(pct)}% · ${download.speed}` : `${Math.round(pct)}%`);
    const label = download.status === 'queued' ? 'In Warteschlange' :
                    download.status === 'paused' ? 'Angehalten' :
                    download.status === 'downloading' ? downloadingLabel :
                    download.status === 'error' ? 'Fehlgeschlagen' : download.status;

    const fillClass = download.status === 'error' ? 'fe' :
                      indeterminate ? 'fq' :
                      isTranscript ? 'ft' :
                      download.format === 'audio' ? 'fa' : 'fv';

    const icoClass = isTranscript ? 'vdli-transcript' : download.format === 'audio' ? 'vdli-audio' : 'vdli-video';

    return (
      <div className="vdlr">
        <div className={`vdlr-ico ${icoClass}`}>
          {isTranscript ? <IconText /> : download.format === 'audio' ? <IconAudio /> : <IconVideo />}
        </div>
        <div className="vdlr-body">
          <div className="vdlr-name" title={download.error || download.filename}>{download.filename}</div>
          <div className="vdlr-meta">
            {download.filesize && <span className="vdlr-size">{download.filesize}</span>}
            <span className={`vdlr-st st-${download.status}`}>{label}</span>
          </div>
          <div className="vdlr-track">
            <div className={`vdlr-fill ${fillClass}`} style={indeterminate ? { width: '100%' } : { width: pct + '%' }} />
          </div>
          {download.status === 'error' && download.error && (
            <div className="vdlr-err" title={download.error}>{download.error}</div>
          )}
        </div>
        <div className="vdlr-btns">
          {download.status === 'error' && <IconButton aria-label="Wiederholen" onClick={() => queueDownload(download.id)}><IconRetry /></IconButton>}
          {download.status === 'paused' && <IconButton aria-label="Starten" onClick={() => queueDownload(download.id)}><IconPlay /></IconButton>}
          <IconButton aria-label="Entfernen" onClick={() => removeDownload(download.id)}><IconTrash /></IconButton>
        </div>
      </div>
    );
  }

  // Verlauf-Eintrag: abgeschlossener Download, bei Transkript mit ausklappbarem
  // Textfeld zum direkten Kopieren (Datei bleibt zusätzlich gespeichert).
  function HistoryItem({ entry }) {
    const isTranscript = entry.format === 'transcript';
    const icoClass = isTranscript ? 'vdli-transcript' : entry.format === 'audio' ? 'vdli-audio' : 'vdli-video';
    const expanded = expandedHistoryId === entry.id;
    const time = formatHistoryTime(entry.completedAt);
    const tag = formatTagInfo(entry.format);

    const canToggle = isTranscript && !!entry.transcriptText;
    const toggle = () => setExpandedHistoryId(expanded ? null : entry.id);

    return (
      <div className="vhist-item">
        <div className="vdlr">
          <div className={`vdlr-clickzone${canToggle ? ' vdlr-toggleable' : ''}`} onClick={canToggle ? toggle : undefined}>
            <div className={`vdlr-ico ${icoClass}`}>
              {entry.thumbnailUrl
                ? <img className="vdlr-thumb" src={entry.thumbnailUrl} alt="" />
                : isTranscript ? <IconText /> : entry.format === 'audio' ? <IconAudio /> : <IconVideo />}
            </div>
            <div className="vdlr-body">
              <div className="vdlr-name" title={entry.filename}>{entry.filename}</div>
              <div className="vdlr-meta">
                <span className="vhist-time">{time}</span>
                <span className="vhist-tag" style={{ color: tag.color }}>{tag.label}</span>
              </div>
            </div>
          </div>
          <div className="vdlr-btns">
            {canToggle && (
              <IconButton aria-label={expanded ? 'Text ausblenden' : 'Text anzeigen'} onClick={toggle}>
                <IconText />
              </IconButton>
            )}
            <IconButton aria-label="Ordner öffnen" onClick={() => ytx.openFolder(entry.outputFolder)}><IconFolder /></IconButton>
            <IconButton aria-label="Aus Verlauf entfernen" onClick={() => removeHistoryEntry(entry.id)}><IconTrash /></IconButton>
          </div>
        </div>
        {expanded && canToggle && (
          <div className="vtxt-panel">
            <textarea className="vtxt-area" readOnly value={entry.transcriptText} onFocus={e => e.target.select()} />
            <div className="vtxt-actions">
              <Button variant="neutral" onClick={() => copyTranscript(entry.id, entry.transcriptText)}>Text kopieren</Button>
              {copiedHistoryId === entry.id && <span className="vtxt-copied">Kopiert!</span>}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Eingabekarte
  const InputCard = () => {
    const platform = detectPlatform(url);
    // Formate ausgrauen, die zur eingefügten URL nicht passen können: bei einem
    // erkannten RSS-Feed sind Video/Audio/Transkript unmöglich, bei jeder
    // anderen URL ist Podcast unmöglich. Leeres Feld → keine Einschränkung.
    const disabledFormats = !url.trim() ? [] : looksLikePodcastFeed(url) ? ['video', 'audio', 'transcript'] : ['podcast'];
    return (
    <div className="input-card">
      {UrlBar({
        value: url, onChange: setUrl, onPaste: (text) => setUrl(text),
        placeholder: format === 'podcast' ? 'Podcast-RSS-Feed-Link einfügen...' : 'Video- oder Playlist-URL einfügen... (auch mehrere, eine pro Zeile)'
      })}
      {platform && (
        <div className="platform-badge">
          <span className="platform-badge-dot" />
          {platform.label} erkannt
          {platform.note && <span className="platform-badge-note"> · {platform.note}</span>}
        </div>
      )}
      <div className="opts-row">
        {FormatToggle({ value: format, disabled: disabledFormats, onChange: (v) => { setFormat(v); if (v === 'video') setQuality('best'); else if (v === 'audio') setQuality('256k'); } })}
        {format !== 'transcript' && <div style={{ width: 155 }}><Select value={quality} onChange={setQuality} options={qualityOptions} /></div>}
        <div style={{ flex: 1 }} />
        <button className="settings-btn" onClick={() => setShowSettings(true)} aria-label="Einstellungen" title="Einstellungen">
          <IconGear />
        </button>
        <Button variant={url.trim() ? 'primary' : 'neutral'} disabled={!url.trim()} onClick={addDownload}>
          <IconDownload /> {format === 'podcast' ? 'Folgen auswählen' : (autoStart ? 'Herunterladen' : 'Zur Warteschlange')}
        </Button>
      </div>
      {looksLikePlaylist(url) && <div className="pl-anim">{PlaylistMode({ mode: playlistMode, onChange: setPlaylistMode })}</div>}
    </div>
    );
  };

  // Download Tab
  const DownloadsTab = () => (
    <>
      <div className="dl-top-spacer" />
      {InputCard()}
      {(!deps.ytDlpAvailable || !deps.ffmpegAvailable) && (
        <div className="dep-warning">
          <IconWarn />
          <span>
            {!deps.ytDlpAvailable
              ? 'yt-dlp wurde nicht gefunden. Ohne yt-dlp im PATH sind keine Downloads möglich – bitte installieren (z. B. "pip install yt-dlp") und neu starten.'
              : 'ffmpeg wurde nicht gefunden. Für das Zusammenführen von MP4 und die MP3-Konvertierung wird ffmpeg benötigt – bitte installieren und neu starten.'}
          </span>
        </div>
      )}
      <div className="dl-sections">
        <div className="dl-section">
          <div className="dl-header">
            <span className="dl-htitle">Warteschlange</span>
            {activeCount > 0 && <Badge variant="primary">{activeCount} aktiv</Badge>}
            <div style={{ flex: 1 }} />
            {downloads.some(d => d.status === 'error') && <button className="dl-clear" onClick={clearErrors}>Fehlgeschlagene entfernen</button>}
          </div>
          {downloads.length === 0
            ? <div className="empty"><p>Noch keine begonnenen Downloads.</p></div>
            : <div className="dl-list">{downloads.map(d => <React.Fragment key={d.id}>{DownloadItem({ download: d })}</React.Fragment>)}</div>
          }
        </div>
        <div className="dl-section">
          <div className="dl-header">
            <span className="dl-htitle">Verlauf</span>
            <div style={{ flex: 1 }} />
            {history.length > 0 && <button className="dl-clear" onClick={clearHistory}>Verlauf leeren</button>}
          </div>
          {history.length === 0
            ? <div className="empty"><p>Noch keine abgeschlossenen Downloads.</p></div>
            : <div className="dl-list">{history.map(h => <React.Fragment key={h.id}>{HistoryItem({ entry: h })}</React.Fragment>)}</div>
          }
        </div>
      </div>
    </>
  );

  // Eine Karte für ein einzelnes Setting.
  function SettingsCard({ label, hint, children }) {
    return (
      <div className="settings-card">
        {label && <span className="settings-lbl">{label}</span>}
        {children}
        {hint && <div className="settings-hint">{hint}</div>}
      </div>
    );
  }

  // Einstellungen: "Standard" immer sichtbar, "Advanced" (Backend-nahe Optionen
  // wie Whisper-Modell) ausklappbar. Jeweils 2 unabhängige Spalten (keine
  // Grid-Zeilen), damit unterschiedlich hohe Karten (mit/ohne Hinweistext)
  // keine Lücken zur Nachbarspalte reißen.
  const SettingsTab = () => (
    <div className="settings">
      <div className="settings-group">
        <span className="settings-group-title">Standard</span>
        {SettingsCard({
          label: 'Download-Ort', hint: folder,
          children: (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <Input value={folder} onChange={setFolder} style={{ flex: 1, minWidth: '200px' }} />
              <Button variant="neutral" onClick={chooseFolder}>Durchsuchen</Button>
            </div>
          )
        })}
        <div className="settings-cols">
          <div className="settings-col">
            {SettingsCard({ children: <Switch checked={autoStart} onChange={setAutoStart} label="Direkt nach Hinzufügen starten" /> })}
            {SettingsCard({ children: <Switch checked={openAfter} onChange={setOpenAfter} label="Ordner nach Abschluss öffnen" /> })}
            {SettingsCard({
              hint: 'Öffnet die heruntergeladene Datei direkt mit der Standard-App.',
              children: <Switch checked={openFileAfter} onChange={setOpenFileAfter} label="Datei nach Abschluss öffnen" />
            })}
            {SettingsCard({
              label: 'Cover-Bild', hint: 'Bettet das Video-Thumbnail als Cover-Art ein – bei Video (MP4) und Audio inkl. Podcast-Folgen (MP3). Bei Transkripten (TXT) nur als Vorschau im Verlauf, da reiner Text.',
              children: (
                <Select value={coverArt} onChange={setCoverArt} options={[
                  { value: 'default', label: 'Standard (kein Cover)' },
                  { value: 'thumbnail', label: 'Automatisch: Video-Thumbnail als Cover' }
                ]} />
              )
            })}
          </div>
          <div className="settings-col">
            {SettingsCard({ children: <Switch checked={notifications} onChange={setNotifications} label="Benachrichtigung bei Fertigstellung" /> })}
            {SettingsCard({
              label: 'Dateinamen-Kodierung', hint: 'UTF-8 wird empfohlen und funktioniert praktisch überall.',
              children: (
                <Select value={encoding} onChange={setEncoding} options={[
                  { value: 'utf-8', label: 'UTF-8 (empfohlen)' },
                  { value: 'cp1252', label: 'ANSI / Windows-1252' },
                  { value: 'system', label: 'System-Standard' }
                ]} />
              )
            })}
            {SettingsCard({
              label: 'Transkript-Sprache', hint: 'Wird normalerweise automatisch erkannt.',
              children: <Select value={transcriptLang} onChange={setTranscriptLang} options={langOptions} />
            })}
          </div>
        </div>
      </div>

      <div className="settings-group">
        <button
          className={`settings-advanced-toggle${showAdvanced ? ' open' : ''}`}
          onClick={() => setShowAdvanced(v => !v)}
          aria-expanded={showAdvanced}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          Advanced
        </button>
        {showAdvanced && (
          <div className="settings-cols">
            <div className="settings-col">
              {SettingsCard({
                label: 'Browser-Cookies', hint: 'Nötig bei Login/Altersschranken. Browser muss geschlossen sein.',
                children: (
                  <Select value={cookiesBrowser} onChange={setCookiesBrowser} options={[
                    { value: 'none', label: 'Keine' },
                    { value: 'chrome', label: 'Chrome' },
                    { value: 'firefox', label: 'Firefox' },
                    { value: 'edge', label: 'Edge' },
                    { value: 'brave', label: 'Brave' },
                    { value: 'opera', label: 'Opera' },
                    { value: 'vivaldi', label: 'Vivaldi' },
                    { value: 'chromium', label: 'Chromium' },
                    { value: 'whale', label: 'Whale' }
                  ]} />
                )
              })}
              {SettingsCard({
                children: <Switch checked={playwrightFallback} onChange={setPlaywrightFallback} label="Fallback für schwierige Seiten (experimentell)" />,
                hint: 'Hilft bei Seiten, die sonst nicht funktionieren, ist aber langsamer.'
              })}
            </div>
            <div className="settings-col">
              {SettingsCard({
                label: 'Whisper-Modell', hint: 'Größere Modelle sind genauer, aber deutlich langsamer.',
                children: (
                  <Select value={whisperModel} onChange={setWhisperModel} options={[
                    { value: 'tiny', label: 'tiny – sehr schnell, ungenau' },
                    { value: 'base', label: 'base – schnell (empfohlen)' },
                    { value: 'small', label: 'small – genauer, langsamer' },
                    { value: 'medium', label: 'medium – sehr genau, langsam' },
                    { value: 'large', label: 'large – beste Qualität, sehr langsam' }
                  ]} />
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Podcast-Folgen-Auswahldialog: erscheint nach dem Auflösen des RSS-Feeds,
  // bevor irgendetwas zur Warteschlange hinzugefügt wird. Erlaubt Einzelauswahl,
  // Alle/Keine sowie eine anpassbare "Erste N"/"Letzte N"-Schnellauswahl.
  const PodcastPickerModal = () => {
    if (!podcastPicker) return null;
    const { loading, error, episodes } = podcastPicker;
    const selectedCount = episodes.filter(ep => ep.selected).length;
    // Nur für Anzeige/Logik der Erste/Letzte-Buttons – das Eingabefeld selbst
    // bleibt leer, solange der Nutzer nichts eingegeben hat (kein erzwungenes "0").
    const episodeCount = Number(episodeCountInput) || 0;

    return (
      <div className="settings-overlay" onClick={closePodcastPicker}>
        <div className="podpick-content" onClick={e => e.stopPropagation()}>
          <div className="podpick-header">
            <span className="podpick-title"><IconPodcast /> Folgen auswählen</span>
            <IconButton aria-label="Schließen" onClick={closePodcastPicker}><IconClose /></IconButton>
          </div>

          {loading && (
            <div className="podpick-status"><Spinner size="sm" color="primary" /> Feed wird geladen …</div>
          )}

          {!loading && error && (
            <div className="podpick-status podpick-status-error"><IconWarn /> {error}</div>
          )}

          {!loading && !error && (
            <>
              <div className="podpick-toolbar">
                <div className="podpick-count-line">{selectedCount} von {episodes.length}</div>
                <div className="podpick-toolbar-row">
                  <div className="podpick-toolbar-group">
                    <button className="podpick-chip" onClick={() => selectAllEpisodes(true)}>Alle auswählen</button>
                    <button className="podpick-chip" onClick={() => selectAllEpisodes(false)}>Alle abwählen</button>
                  </div>
                  <div className="podpick-toolbar-group">
                    <button className="podpick-chip" onClick={() => selectFirstN(episodeCount)}>Erste {episodeCount}</button>
                    <button className="podpick-chip" onClick={() => selectLastN(episodeCount)}>Letzte {episodeCount}</button>
                    <input
                      className="podpick-count-inp"
                      type="number"
                      min="0"
                      value={episodeCountInput}
                      onChange={e => {
                        const raw = e.target.value;
                        // Nur Ziffern zulassen; leer bleibt leer (kein erzwungenes "0").
                        if (raw === '' || /^\d+$/.test(raw)) {
                          setEpisodeCountInput(raw);
                        }
                      }}
                      aria-label="Anzahl für Erste/Letzte"
                    />
                  </div>
                </div>
              </div>

              <div className="podpick-list">
                {episodes.map(ep => (
                  <label key={ep.idx} className={`podpick-row${ep.selected ? ' checked' : ''}`}>
                    <span className="podpick-check" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </span>
                    <input type="checkbox" checked={ep.selected} onChange={() => toggleEpisode(ep.idx)} hidden />
                    <div className="podpick-row-body">
                      <div className="podpick-row-title">{ep.title}</div>
                      {ep.pubDate && <div className="podpick-row-date">{formatPubDate(ep.pubDate)}</div>}
                    </div>
                  </label>
                ))}
              </div>

              <div className="podpick-footer">
                <div style={{ flex: 1 }} />
                <Button variant="neutral" onClick={closePodcastPicker}>Abbrechen</Button>
                <Button variant="primary" disabled={selectedCount === 0} onClick={confirmPodcastPicker}>
                  <IconDownload /> {selectedCount} Folge{selectedCount === 1 ? '' : 'n'} herunterladen
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // Format Toggle (Video / Audio / Transkript) mit gleitender Markierung, die
  // beim Wechsel über die Zwischen-Segmente slidet (immer teal, kein Farbwechsel je Format).
  // Position/Breite werden aus den echten Button-Rects gemessen (offsetLeft/-Width),
  // statt aus einer Gleich-Drittel-Annahme errechnet – Labels sind unterschiedlich lang
  // (z. B. "Transkript" vs. "Audio"), ein Grid mit 1fr-Spalten gleicht das im
  // Shrink-to-fit-Container nicht zuverlässig aus und lässt die Markierung driften.
  function FormatToggle({ value, onChange, disabled }) {
    const isSelected = (mode) => value === mode;
    const isDisabled = (mode) => !!disabled && disabled.includes(mode);
    const btnRefs = useRef({});
    const [indicator, setIndicator] = useState({ left: 0, width: 0 });

    useLayoutEffect(() => {
      const btn = btnRefs.current[value];
      if (!btn) return;
      setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
    }, [value]);

    // Ausgegraute Formate passen nicht zur eingefügten URL (z. B. Podcast bei
    // einem YouTube-Link, oder Video/Audio/Transkript bei einem RSS-Feed) –
    // Klick ist deaktiviert statt einfach nur optisch gedimmt zu sein.
    const disabledTitle = 'Passt nicht zur eingefügten URL';

    return (
      <div className="vft" role="group">
        <div className="vft-indicator" style={{ transform: `translateX(${indicator.left}px)`, width: `${indicator.width}px` }} />
        <button ref={(el) => { btnRefs.current.video = el; }} className={`vft-btn vid${isSelected('video') ? ' on' : ''}${isDisabled('video') ? ' vft-disabled' : ''}`} disabled={isDisabled('video')} title={isDisabled('video') ? disabledTitle : undefined} onClick={() => onChange('video')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>
          Video <span className="vft-tag">MP4</span>
        </button>
        <button ref={(el) => { btnRefs.current.audio = el; }} className={`vft-btn aud${isSelected('audio') ? ' on' : ''}${isDisabled('audio') ? ' vft-disabled' : ''}`} disabled={isDisabled('audio')} title={isDisabled('audio') ? disabledTitle : undefined} onClick={() => onChange('audio')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          Audio <span className="vft-tag">MP3</span>
        </button>
        <button ref={(el) => { btnRefs.current.transcript = el; }} className={`vft-btn tns${isSelected('transcript') ? ' on' : ''}${isDisabled('transcript') ? ' vft-disabled' : ''}`} disabled={isDisabled('transcript')} title={isDisabled('transcript') ? disabledTitle : undefined} onClick={() => onChange('transcript')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>
          Transkript <span className="vft-tag">TXT</span>
        </button>
        <button ref={(el) => { btnRefs.current.podcast = el; }} className={`vft-btn pod${isSelected('podcast') ? ' on' : ''}${isDisabled('podcast') ? ' vft-disabled' : ''}`} disabled={isDisabled('podcast')} title={isDisabled('podcast') ? disabledTitle : undefined} onClick={() => onChange('podcast')}>
          <IconPodcast />
          Podcast <span className="vft-tag">RSS</span>
        </button>
      </div>
    );
  }

  // Playlist Mode
  function PlaylistMode({ mode, onChange }) {
    const opts = [
      { v: 'single', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>, name: 'Nur dieses Video', desc: 'Playlist ignorieren' },
      { v: 'split', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="4" rx="1"/><rect x="2" y="10" width="20" height="4" rx="1"/><rect x="2" y="17" width="20" height="4" rx="1"/></svg>, name: 'Getrennte Videos', desc: 'Jeder Titel als eigene Datei' },
      { v: 'combined', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3v18"/><path d="M17 3v18"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/></svg>, name: 'Ein langes Video', desc: 'Ganze Playlist zu einer Datei' },
    ];
    return (
      <div className="vpm">
        <span className="vpm-lbl">Playlist Modus</span>
        <div className="vpm-opts">
          {opts.map(o => (
            <div key={o.v} className={`vpm-opt${mode === o.v ? ' vpm-active' : ''}`} onClick={() => onChange(o.v)} role="radio" aria-checked={mode === o.v}>
              <div className="vpm-ico">{o.icon}</div>
              <div><div className="vpm-name">{o.name}</div><div className="vpm-desc">{o.desc}</div></div>
              <div className="vpm-dot"><div className="vpm-dot-in"/></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // UrlBar
  function UrlBar({ value, onChange, onPaste, placeholder }) {
    const filled = value && value.length > 0;
    const handlePaste = async () => {
      try {
        const text = await navigator.clipboard.readText();
        onChange && onChange(text);
        onPaste && onPaste(text);
      } catch {
        onPaste && onPaste('');
      }
    };
    // Klick irgendwo im Feld (außer Paste-Button) soll ins Textfeld fokussieren,
    // nicht nur ein Klick direkt auf den schmalen <input>-Bereich.
    const focusInput = (e) => {
      if (e.target.closest('.vurl-paste')) return;
      if (e.target.classList.contains('vurl-inp')) return; // native Klick-Positionierung nicht stören
      e.preventDefault();
      const input = e.currentTarget.querySelector('.vurl-inp');
      if (input) input.focus();
    };
    return (
      <div className={`vurl${filled ? ' filled' : ''}`} onMouseDown={focusInput}>
        <input className="vurl-inp" value={value} onChange={e => onChange && onChange(e.target.value)} placeholder={placeholder || "Video- oder Playlist-URL einfügen..."} spellCheck={false} autoComplete="off"/>
        {filled && <button className="vurl-clr" onClick={() => onChange && onChange('')} aria-label="Clear"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
        <button className="vurl-paste" onClick={handlePaste}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>Paste</button>
      </div>
    );
  }

  // Titlebar
  const TitleBar = () => (
    <div className="titlebar">
      <div className="tb-brand">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 3v11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <path d="M7.5 10.5 12 15l4.5-4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M5 19h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.55"/>
        </svg>
        <span className="tb-name">Snatchy</span>
      </div>
      <div className="tb-space" />
      <div className="tb-wc">
        <button className="tc" title="Minimieren" onClick={() => window.electron.minimize()}><IconMinimize /></button>
        <button className="tc" title="Maximieren" onClick={() => window.electron.maximize()}><IconMaximize /></button>
        <button className="tc tc-x" title="Schließen" onClick={() => window.electron.close()}><IconClose /></button>
      </div>
    </div>
  );

  // Statusleiste
  const StatusBar = () => (
    <div className="sbar">
      {activeCount > 0
        ? <span className="sb-txt"><Spinner size="xs" color="primary" />{activeCount} Download{activeCount > 1 ? 's' : ''} aktiv</span>
        : <span className="sb-txt">Bereit</span>}
      <span className="sb-txt">· {completedCount} abgeschlossen</span>
    </div>
  );

  // Haupt-Render
  return (
    <div className="app">
      {TitleBar()}
      <div className="content">
        {DownloadsTab()}
      </div>
      {StatusBar()}
      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-overlay-content" onClick={e => e.stopPropagation()}>
            <IconButton aria-label="Schließen" className="settings-close" onClick={() => setShowSettings(false)}>
              <IconClose />
            </IconButton>
            <span className={`settings-saved${settingsSaved ? ' show' : ''}`}>Gespeichert</span>
            {SettingsTab()}
          </div>
        </div>
      )}
      {podcastPicker && PodcastPickerModal()}
    </div>
  );
}

// React Root
ReactDOM.createRoot(document.getElementById('root')).render(<VelaApp />);

// Electron API für Fenstersteuerung
if (typeof window.electron === 'undefined') {
  window.electron = {
    minimize: () => window.ipcRenderer && window.ipcRenderer.send('window:minimize'),
    maximize: () => window.ipcRenderer && window.ipcRenderer.send('window:maximize'),
    close: () => window.ipcRenderer && window.ipcRenderer.send('window:close')
  };
}

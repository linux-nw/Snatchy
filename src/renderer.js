/* ============================================================
   Snatchy - Renderer Process
   Controls the React app and communicates with the Electron backend
   ============================================================ */

// One-time migration of the localStorage keys from ytx-* to snatchy-*.
// Reads every old key, stores the value under the new name (an
// already existing new value wins) and then deletes the old one.
// TODO: Can be removed once all installations have been started once.
(() => {
  try {
    const legacyKeys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('ytx-')) legacyKeys.push(key);
    }
    legacyKeys.forEach((oldKey) => {
      const newKey = 'snatchy-' + oldKey.slice('ytx-'.length);
      if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, localStorage.getItem(oldKey));
      }
      localStorage.removeItem(oldKey);
    });
  } catch { /* localStorage not available: nothing to migrate */ }
})();

// Backend API Bridge
const getSnatchyAPI = () => {
  if (!window.snatchy) {
    const noopListen = () => () => {};
    window.snatchy = {
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
  return window.snatchy;
};

// Vela design system components
const { Button, IconButton, Badge, Spinner } = window.VelaDesignSystem_f6c677 || {};
const { Input, Switch, Select } = window.VelaDesignSystem_f6c677 || {};

// Fallback: if the bundle is not loaded
if (!window.VelaDesignSystem_f6c677) {
  console.warn('Vela Design System Bundle nicht geladen');
}

const { useState, useEffect, useLayoutEffect, useCallback, useRef } = React;

// Extract the file name from a yt-dlp log entry (best effort)
function parseFilenameFromLog(line) {
  let match = line.match(/Merging formats into "(.+?)"/);
  if (!match) match = line.match(/Destination:\s*(.+)$/);
  if (!match) match = line.match(/\[download\]\s+(.+?) has already been downloaded/);
  if (!match) return null;
  const full = match[1].trim();
  const parts = full.split(/[\\/]/);
  return parts[parts.length - 1] || full;
}

// History timestamp in the format TT.MM.JJ:HH.MM (fixed desired format, not locale-dependent).
function formatHistoryTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${pad(d.getFullYear() % 100)}:${pad(d.getHours())}.${pad(d.getMinutes())}`;
}

// Episode date in the episode selection dialog: bring the raw RSS date ("Wed, 02 Jul 2026 ...")
// into a short, readable format; show unparsable values unchanged.
function formatPubDate(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// File format tag (MP4/MP3/TXT) with color per format - the same colors as
// the format icons (video=teal, audio=indigo, transcript=purple).
function formatTagInfo(format) {
  if (format === 'transcript') return { label: 'TXT', color: 'var(--vela-tertiary, oklch(0.78 0.15 300))' };
  if (format === 'audio') return { label: 'MP3', color: 'var(--vela-audio)' };
  return { label: 'MP4', color: 'var(--vela-video)' };
}

// Heuristic: does the URL look like a playlist/collection? Covers the common
// platforms (not just YouTube) without asking yt-dlp:
//  - YouTube:    ?list=… / &list=… / &index=… / /playlist
//  - SoundCloud: /sets/
//  - Bandcamp/Spotify/Vimeo: /album/ , /showcase/
//  - generic:    the word "playlist", /series/
// For 100% certainty yt-dlp would have to be probed - deliberately immediate & offline here.
function looksLikePlaylist(url) {
  if (!url) return false;
  return /(\bplaylist\b)|([?&](list|playlist)=)|([?&]index=\d)|(\/sets\/)|(\/albums?\/)|(\/showcase\/)|(\/series\/)/i.test(url);
}

// Heuristic: does the URL look like a podcast RSS feed? Covers the
// common hosting providers (hostname often starts with "feeds."/"feed.")
// as well as typical path/extension patterns - without querying the feed itself,
// purely for the format preselection in the UI.
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

// Detects the platform from the hostname for the small badge next to the
// URL bar - purely cosmetic/informational, changes nothing about the download itself
// (it runs through the same yt-dlp pipeline for all). For SoundCloud/Bandcamp
// additionally a hint that downloads there are often allowed by the creator themselves.
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

// Vela app main component
function VelaApp() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('video');
  const [quality, setQuality] = useState('best');
  const [transcriptLang, setTranscriptLang] = useState('auto');
  const [whisperModel, setWhisperModel] = useState('base');
  const [playlistMode, setPlaylistMode] = useState('single');
  const [downloads, setDownloads] = useState([]);
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('snatchy-history') || '[]'); } catch { return []; }
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
  // Podcast episode selection: null = closed, otherwise { feedUrl, loading, error, episodes }.
  const [podcastPicker, setPodcastPicker] = useState(null);
  // Adjustable number for the "First N" / "Last N" quick selection in the episode dialog.
  // Kept as a string (not a number) so the field really stays empty
  // when cleared instead of jumping to "0".
  const [episodeCountInput, setEpisodeCountInput] = useState('5');
  // Backend dependencies (default true so no warning flashes before the check)
  const [deps, setDeps] = useState({ ytDlpAvailable: true, ffmpegAvailable: true });

  const snatchy = getSnatchyAPI();

  // Id of the currently running download (for backend events)
  const activeIdRef = useRef(null);
  // Keep the current folder available for event handlers
  const folderRef = useRef(folder);
  useEffect(() => { folderRef.current = folder; }, [folder]);
  // Mirror notification setting + download list for event handlers
  const notificationsRef = useRef(notifications);
  useEffect(() => { notificationsRef.current = notifications; }, [notifications]);
  const openAfterRef = useRef(openAfter);
  useEffect(() => { openAfterRef.current = openAfter; }, [openAfter]);
  const openFileAfterRef = useRef(openFileAfter);
  useEffect(() => { openFileAfterRef.current = openFileAfter; }, [openFileAfter]);
  const downloadsRef = useRef(downloads);
  useEffect(() => { downloadsRef.current = downloads; }, [downloads]);

  // Initialization
  useEffect(() => {
    const init = async () => {
      const savedTheme = localStorage.getItem('snatchy-theme') || 'dark';
      setTheme(savedTheme);
      document.body.dataset.theme = savedTheme;

      const savedAuto = localStorage.getItem('snatchy-auto-start');
      if (savedAuto !== null) setAutoStart(savedAuto === 'true');
      const savedNotif = localStorage.getItem('snatchy-notifications');
      if (savedNotif !== null) setNotifications(savedNotif === 'true');
      const savedOpenAfter = localStorage.getItem('snatchy-open-after');
      if (savedOpenAfter !== null) setOpenAfter(savedOpenAfter === 'true');
      const savedOpenFileAfter = localStorage.getItem('snatchy-open-file-after');
      if (savedOpenFileAfter !== null) setOpenFileAfter(savedOpenFileAfter === 'true');
      const savedEncoding = localStorage.getItem('snatchy-encoding');
      if (savedEncoding) setEncoding(savedEncoding);
      const savedCookies = localStorage.getItem('snatchy-cookies-browser');
      if (savedCookies) setCookiesBrowser(savedCookies);
      const savedPw = localStorage.getItem('snatchy-playwright-fallback');
      if (savedPw !== null) setPlaywrightFallback(savedPw === 'true');
      const savedCoverArt = localStorage.getItem('snatchy-cover-art');
      if (savedCoverArt) setCoverArt(savedCoverArt);
      const savedModel = localStorage.getItem('snatchy-whisper-model');
      if (savedModel) setWhisperModel(savedModel);
      const savedLang = localStorage.getItem('snatchy-transcript-lang');
      if (savedLang) setTranscriptLang(savedLang);

      try {
        const state = await snatchy.getState();
        const savedFolder = localStorage.getItem('snatchy-output-folder');
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

  // Apply theme
  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem('snatchy-theme', theme);
    snatchy.setTheme(theme);
  }, [theme, snatchy]);

  // Persist behavior settings
  useEffect(() => { if (folder) localStorage.setItem('snatchy-output-folder', folder); }, [folder]);
  useEffect(() => { localStorage.setItem('snatchy-auto-start', String(autoStart)); }, [autoStart]);
  useEffect(() => { localStorage.setItem('snatchy-notifications', String(notifications)); }, [notifications]);
  useEffect(() => { localStorage.setItem('snatchy-open-after', String(openAfter)); }, [openAfter]);
  useEffect(() => { localStorage.setItem('snatchy-open-file-after', String(openFileAfter)); }, [openFileAfter]);
  useEffect(() => { localStorage.setItem('snatchy-encoding', encoding); }, [encoding]);
  useEffect(() => { localStorage.setItem('snatchy-cookies-browser', cookiesBrowser); }, [cookiesBrowser]);
  useEffect(() => { localStorage.setItem('snatchy-playwright-fallback', String(playwrightFallback)); }, [playwrightFallback]);
  useEffect(() => { localStorage.setItem('snatchy-cover-art', coverArt); }, [coverArt]);
  useEffect(() => { localStorage.setItem('snatchy-whisper-model', whisperModel); }, [whisperModel]);
  useEffect(() => { localStorage.setItem('snatchy-transcript-lang', transcriptLang); }, [transcriptLang]);
  useEffect(() => { localStorage.setItem('snatchy-history', JSON.stringify(history)); }, [history]);

  // Adapt the format automatically to the pasted URL so that no nonsensical
  // combination (e.g. podcast format with a YouTube link) remains.
  // If the URL looks like an RSS feed -> switch to podcast, otherwise away
  // from podcast back to video (the other three formats stay as they were).
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

  // Short "Saved" hint in the settings on every change -
  // skipped on first mount (loading the saved values is not a "save").
  const settingsMountedRef = useRef(false);
  const settingsSavedTimeoutRef = useRef(null);
  useEffect(() => {
    if (!settingsMountedRef.current) { settingsMountedRef.current = true; return; }
    setSettingsSaved(true);
    clearTimeout(settingsSavedTimeoutRef.current);
    settingsSavedTimeoutRef.current = setTimeout(() => setSettingsSaved(false), 1800);
    return () => clearTimeout(settingsSavedTimeoutRef.current);
  }, [folder, autoStart, notifications, openAfter, openFileAfter, encoding, cookiesBrowser, playwrightFallback, coverArt, whisperModel, transcriptLang]);

  // Backend events: progress, logs, completion, error
  useEffect(() => {
    const updateActive = (patch) => {
      setDownloads(prev => prev.map(d =>
        d.id === activeIdRef.current ? { ...d, ...(typeof patch === 'function' ? patch(d) : patch) } : d
      ));
    };

    const unsubscribeProgress = snatchy.onProgress((progress) => {
      if (progress.percent === undefined) return;
      updateActive({
        progress: progress.percent,
        speed: progress.speed || undefined,
        eta: progress.eta || undefined,
        filesize: progress.total || undefined
      });
    });

    const unsubscribeLog = snatchy.onLog((line) => {
      console.log('[Backend]', line);
      // Mark the Whisper phase so that the row shows an indeterminate progress.
      if (/^\[Whisper\]/.test(line)) updateActive({ transcribing: true });
      // For podcast episodes the clean episode title stays, instead of being
      // overwritten by the (often more technical) file name from the enclosure link.
      const activeItem = downloadsRef.current.find(d => d.id === activeIdRef.current);
      if (activeItem && activeItem.displayNameLocked) return;
      const name = parseFilenameFromLog(line);
      if (name) updateActive({ filename: name });
    });

    const unsubscribeCompleted = snatchy.onCompleted((payload) => {
      const id = activeIdRef.current;
      activeIdRef.current = null;
      const item = downloadsRef.current.find(d => d.id === id);
      // Finished file: video/MP3 path or - for transcripts - the .txt file.
      const targetPath = payload && (payload.filePath || payload.transcriptPath);
      if (notificationsRef.current && item && typeof Notification !== 'undefined') {
        try {
          const n = new Notification('Snatchy: Download abgeschlossen', { body: item.filename || item.url, icon: new URL('../assets/icons/icon-512.png', window.location.href).href });
          // Click on the notification opens the finished file directly.
          n.onclick = () => snatchy.openFile(targetPath || folderRef.current);
        } catch (e) { /* Notification not available */ }
      }
      if (openAfterRef.current) {
        snatchy.openFolder(folderRef.current);
      }
      if (openFileAfterRef.current && targetPath) {
        snatchy.openFile(targetPath);
      }
      // Completed downloads move into the history immediately instead of staying
      // in the queue as "done".
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

    const unsubscribeFailed = snatchy.onFailed((message) => {
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
  }, [snatchy]);

  // Start an entry in the backend
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
      // Applies to all formats: video (MP4), audio/podcast episodes (MP3, real
      // embedding) and transcript (TXT, preview in the history only).
      embedCoverArt: item.coverArt === 'thumbnail'
    };

    snatchy.startDownload(options).then(result => {
      if (!result.ok) {
        setDownloads(prev => prev.map(d => d.id === item.id ? { ...d, status: 'error', error: result.error } : d));
        if (activeIdRef.current === item.id) activeIdRef.current = null;
      }
    }).catch(err => {
      console.error('Backend Exception:', err);
      setDownloads(prev => prev.map(d => d.id === item.id ? { ...d, status: 'error', error: String(err) } : d));
      if (activeIdRef.current === item.id) activeIdRef.current = null;
    });
  }, [snatchy]);

  // Process the queue sequentially: one download at a time
  useEffect(() => {
    if (activeIdRef.current !== null) return;
    if (downloads.some(d => d.status === 'downloading')) return;
    const next = downloads.filter(d => d.status === 'queued').sort((a, b) => a.id - b.id)[0];
    if (next) startItem(next);
  }, [downloads, startItem]);

  // Resolve the podcast RSS feed and open the episode selection dialog. The actual
  // download only starts when the user confirms in the dialog - until then
  // nothing is added to the queue.
  const openPodcastPicker = useCallback((feedUrl) => {
    setPodcastPicker({ feedUrl, loading: true, error: null, episodes: [] });
    snatchy.resolvePodcast(feedUrl).then(result => {
      setPodcastPicker(prev => {
        if (!prev || prev.feedUrl !== feedUrl) return prev; // closed/replaced in the meantime
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
  }, [snatchy]);

  const closePodcastPicker = useCallback(() => setPodcastPicker(null), []);

  const toggleEpisode = useCallback((idx) => {
    setPodcastPicker(prev => prev ? { ...prev, episodes: prev.episodes.map(ep => ep.idx === idx ? { ...ep, selected: !ep.selected } : ep) } : prev);
  }, []);

  const selectAllEpisodes = useCallback((selected) => {
    setPodcastPicker(prev => prev ? { ...prev, episodes: prev.episodes.map(ep => ({ ...ep, selected })) } : prev);
  }, []);

  // Feeds usually list episodes newest first - "First N" = start of the
  // list (newest), "Last N" = end of the list (oldest). n=0 is explicitly
  // allowed (selects nothing) instead of being forced up to at least 1.
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

  // Confirmation: only add the selected episodes to the queue
  // (audio, URL = direct enclosure link -> runs through the normal MP3
  // pipeline, yt-dlp downloads directly linked audio files directly).
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

  // Add download(s) to the queue. Detects several links at once
  // (one per line/separated by whitespace, e.g. pasted from the clipboard)
  // and creates a separate entry for each.
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

  // Remove download (cancel the active download first)
  const removeDownload = (id) => {
    if (activeIdRef.current === id) {
      snatchy.cancelDownload();
      activeIdRef.current = null;
    }
    setDownloads(prev => prev.filter(d => d.id !== id));
  };

  // Put an entry (again) into the queue
  const queueDownload = (id) => {
    setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'queued', progress: 0, error: undefined } : d));
  };

  // Open folder
  const openFolder = () => {
    snatchy.openFolder(folder);
  };

  // Choose folder
  const chooseFolder = async () => {
    const selected = await snatchy.selectFolder();
    if (selected) {
      setFolder(selected);
    }
  };

  // Remove failed ones from the queue (active/waiting stay)
  const clearErrors = () => {
    setDownloads(prev => prev.filter(d => d.status !== 'error'));
  };

  // Remove a single history entry - this also deletes the associated file
  // on disk (transcript .txt or video/audio file), not just the entry.
  const removeHistoryEntry = (id) => {
    const entry = history.find(h => h.id === id);
    const target = entry && (entry.transcriptPath || entry.filePath);
    if (target) {
      snatchy.deleteFile(target).catch(err => console.error('Datei konnte nicht gelöscht werden:', err));
    }
    setHistory(prev => prev.filter(h => h.id !== id));
    if (expandedHistoryId === id) setExpandedHistoryId(null);
  };

  // Clear the whole history
  const clearHistory = () => {
    setHistory([]);
    setExpandedHistoryId(null);
  };

  // Copy transcript text to the clipboard
  const copyTranscript = (id, text) => {
    navigator.clipboard.writeText(text || '').then(() => {
      setCopiedHistoryId(id);
      setTimeout(() => setCopiedHistoryId(current => current === id ? null : current), 1800);
    });
  };

  // Number of active downloads
  const activeCount = downloads.filter(d => d.status === 'downloading' || d.status === 'queued').length;
  const completedCount = history.length;

  // Format options
  const qualityOptions = format === 'video'
    ? [{ value: 'best', label: 'Beste verfügbare' }, { value: '480p', label: '480p SD' }, { value: '720p', label: '720p HD' }, { value: '1080p', label: '1080p FHD' }, { value: '2160p', label: '4K UHD' }]
    : [{ value: '128k', label: '128 kbps' }, { value: '192k', label: '192 kbps' }, { value: '256k', label: '256 kbps' }, { value: '320k', label: '320 kbps (best)' }];

  // Language options for the transcript (subtitle selection or Whisper language).
  // Default is "Automatic": the language is detected by AI (Whisper detects
  // it itself unless a fixed language is given).
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

  // Download row component
  function DownloadItem({ download }) {
    const pct = Math.min(100, Math.max(0, download.progress));
    const isTranscript = download.format === 'transcript';
    // Whisper provides no percentage value -> indeterminate (running) bar.
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

  // History entry: completed download, for transcripts with a collapsible
  // text field for direct copying (file is additionally kept saved).
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
            <IconButton aria-label="Ordner öffnen" onClick={() => snatchy.openFolder(entry.outputFolder)}><IconFolder /></IconButton>
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

  // Input card
  const InputCard = () => {
    const platform = detectPlatform(url);
    // Gray out formats that cannot match the pasted URL: for a
    // detected RSS feed video/audio/transcript are impossible, for every
    // other URL podcast is impossible. Empty field -> no restriction.
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

  // Download tab
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

  // One card for a single setting.
  function SettingsCard({ label, hint, children }) {
    return (
      <div className="settings-card">
        {label && <span className="settings-lbl">{label}</span>}
        {children}
        {hint && <div className="settings-hint">{hint}</div>}
      </div>
    );
  }

  // Settings: "Standard" always visible, "Advanced" (backend-related options
  // such as Whisper model) collapsible. Two independent columns each (no
  // grid rows), so that cards of different heights (with/without hint text)
  // do not leave gaps next to the neighboring column.
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

  // Podcast episode selection dialog: appears after resolving the RSS feed,
  // before anything is added to the queue. Allows single selection,
  // All/None and a customizable "First N"/"Last N" quick selection.
  const PodcastPickerModal = () => {
    if (!podcastPicker) return null;
    const { loading, error, episodes } = podcastPicker;
    const selectedCount = episodes.filter(ep => ep.selected).length;
    // Only for display/logic of the First/Last buttons - the input field itself
    // stays empty as long as the user has not entered anything (no forced "0").
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
                        // Allow digits only; empty stays empty (no forced "0").
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

  // Format toggle (video / audio / transcript) with a sliding marker that
  // slides over the intermediate segments on change (always teal, no color change per format).
  // Position/width are measured from the real button rects (offsetLeft/-Width),
  // instead of being computed from an equal-thirds assumption - labels have different lengths
  // (e.g. "Transkript" vs. "Audio"), a grid with 1fr columns does not reliably balance that in the
  // shrink-to-fit container and makes the marker drift.
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

    // Grayed-out formats do not match the pasted URL (e.g. podcast with
    // a YouTube link, or video/audio/transcript with an RSS feed) -
    // click is disabled instead of just being visually dimmed.
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

  // Playlist mode
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
    // A click anywhere in the field (except the paste button) should focus the text field,
    // not just a click directly on the narrow <input> area.
    const focusInput = (e) => {
      if (e.target.closest('.vurl-paste')) return;
      if (e.target.classList.contains('vurl-inp')) return; // do not disturb native click positioning
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

  // Title bar
  const TitleBar = () => (
    <div className="titlebar">
      <div className="tb-brand">
        <img className="tb-icon" src="../assets/icons/icon-512.png" alt="" width="20" height="20" draggable="false" />
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

  // Status bar
  const StatusBar = () => (
    <div className="sbar">
      {activeCount > 0
        ? <span className="sb-txt"><Spinner size="xs" color="primary" />{activeCount} Download{activeCount > 1 ? 's' : ''} aktiv</span>
        : <span className="sb-txt">Bereit</span>}
      <span className="sb-txt">· {completedCount} abgeschlossen</span>
    </div>
  );

  // Main render
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

// React root
ReactDOM.createRoot(document.getElementById('root')).render(<VelaApp />);

// Electron API for window control
if (typeof window.electron === 'undefined') {
  window.electron = {
    minimize: () => window.ipcRenderer && window.ipcRenderer.send('window:minimize'),
    maximize: () => window.ipcRenderer && window.ipcRenderer.send('window:maximize'),
    close: () => window.ipcRenderer && window.ipcRenderer.send('window:close')
  };
}

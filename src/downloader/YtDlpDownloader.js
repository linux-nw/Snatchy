/**
 * Download cascade.
 *
 * The same five stages as before, only as a FallbackManager pipeline instead
 * of nested if/try blocks. The log output in the app stays word
 * for word the same.
 *
 *   1. try yt-dlp candidates (with impersonation, if available)
 *   2. age-gate bypass (only where known)
 *   3. without impersonation
 *   4. force the generic extractor (only on "Unsupported URL")
 *   5. browser/session-based extraction (only if enabled)
 *
 * The layer only knows ResolvedMedia and the user options,
 * not the concrete providers.
 */

const { FallbackManager } = require("../core/FallbackManager");
const { nullLogger } = require("../core/logger");
const { downloadUrlOf } = require("../core/types");
const { isUnsupportedUrl, looksLikeBlock } = require("../core/errors");
const { getAgeGateExtraArgs } = require("./ytDlpArgs");

/**
 * Writes every error into the history of the pipeline state.
 *
 * Deliberately the whole history and not just the last error: a stage can
 * fail with a different message than the one before. If the later
 * stages only looked at the last error, they would be left out although
 * it would still be their turn.
 */
const track = (state, fn) => async () => {
  try {
    return await fn(state);
  } catch (err) {
    state.lastError = err;
    state.errors.push(err);
    throw err;
  }
};

const messageOf = (error) => (error && error.message) ? error.message : "";

/** Did any earlier error point to a missing extractor? */
const sawUnsupportedUrl = (state) => state.errors.some((err) => isUnsupportedUrl(messageOf(err)));

/**
 * Runs the download for a resolved medium.
 *
 * @param {Object} params
 * @param {Object} params.media        ResolvedMedia
 * @param {Object} params.options      Normalized user options (format, quality ...)
 * @param {Object} params.deps         { impersonateAvailable, ffmpegAvailable, ... }
 * @param {Array}  params.candidates   yt-dlp candidates [{command, argsPrefix}]
 * @param {(candidate: Object, options: Object, runOpts: Object) => Promise<string|null>} params.runDownload
 * @param {(url: string) => Promise<Object|null>} [params.resolveStream] Stufe 5
 * @param {() => boolean} [params.isCancelled] Did the user cancel?
 * @param {(line: string) => void} [params.log] Output to the app
 * @param {Object} [params.logger]     Structured logger
 * @returns {Promise<{ok: boolean, filePath?: string|null, candidate?: Object, error?: Error, stage?: string}>}
 */
const runDownloadCascade = async ({
  media,
  options,
  deps,
  candidates,
  runDownload,
  resolveStream,
  isCancelled,
  log = () => {},
  logger = nullLogger()
}) => {
  const downloadUrl = downloadUrlOf(media);
  const downloadOptions = { ...options, url: downloadUrl };
  const state = { workingCandidate: null, lastError: null, errors: [] };
  const cancelled = typeof isCancelled === "function" ? isCancelled : () => false;

  // Reasons that affect every following stage. After a cancellation no
  // further stage may start, otherwise the app keeps downloading after the
  // click on "Cancel".
  const sharedSkip = (s) => {
    if (cancelled()) return "cancelled";
    if (!s.workingCandidate) return "no working yt-dlp";
    return false;
  };

  const stages = [
    {
      name: "yt-dlp",
      run: track(state, async (s) => {
        let lastError;
        for (const candidate of candidates) {
          if (cancelled()) break;
          log(`[Stufe 1/5] Starte mit ${candidate.command}${candidate.argsPrefix.length ? ` ${candidate.argsPrefix.join(" ")}` : ""}${deps.impersonateAvailable ? " (Impersonation: chrome)" : ""}`);
          try {
            const filePath = await runDownload(candidate, downloadOptions, { impersonate: deps.impersonateAvailable });
            return { filePath, candidate };
          } catch (error) {
            lastError = error;
            if (error.code !== "ENOENT") {
              // Candidate runs, the error comes from the site: do not keep
              // looking for other yt-dlp installations.
              s.workingCandidate = candidate;
              throw error;
            }
            log(error.message);
          }
        }
        throw lastError || new Error("No yt-dlp candidate available.");
      })
    },
    {
      name: "age-gate",
      skip: (s) => sharedSkip(s)
        || (!deps.impersonateAvailable && "impersonation not available")
        || (!getAgeGateExtraArgs(downloadUrl) && "no age-gate bypass known for this site"),
      run: track(state, async (s) => {
        log("[Stufe 2/5] Erneuter Versuch mit Age-Gate-Bypass …");
        const filePath = await runDownload(s.workingCandidate, downloadOptions, {
          impersonate: true,
          extraArgs: getAgeGateExtraArgs(downloadUrl)
        });
        return { filePath, candidate: s.workingCandidate };
      })
    },
    {
      name: "ohne-impersonation",
      skip: (s) => sharedSkip(s)
        || (!deps.impersonateAvailable && "it ran without impersonation anyway"),
      run: track(state, async (s) => {
        log("[Stufe 3/5] Fallback: Versuch ohne Browser-Impersonation …");
        const filePath = await runDownload(s.workingCandidate, downloadOptions, { impersonate: false });
        return { filePath, candidate: s.workingCandidate };
      })
    },
    {
      name: "generic-extractor",
      skip: (s) => sharedSkip(s)
        || (!sawUnsupportedUrl(s) && "no error points to a missing extractor"),
      run: track(state, async (s) => {
        log("[Stufe 4/5] Kein Extractor – Versuch mit Generic-Extractor …");
        const filePath = await runDownload(s.workingCandidate, downloadOptions, {
          impersonate: deps.impersonateAvailable,
          extraArgs: ["--force-generic-extractor"]
        });
        return { filePath, candidate: s.workingCandidate };
      })
    },
    {
      name: "browser-session",
      skip: (s) => sharedSkip(s)
        || (typeof resolveStream !== "function" && "no browser extraction available")
        || (!options.playwrightFallback && "Playwright fallback not enabled")
        || (!sawUnsupportedUrl(s) && "no error points to a missing extractor"),
      run: track(state, async (s) => {
        log("[Stufe 5/5] Playwright-Fallback: headless Browser analysiert Seite …");
        const streamMedia = await resolveStream(downloadUrl);
        const streamUrl = streamMedia ? downloadUrlOf(streamMedia) : null;
        if (!streamUrl) {
          throw Object.assign(new Error("Kein Stream gefunden"), { code: "PLAYWRIGHT_NO_STREAM" });
        }
        log("Playwright: Stream-URL gefunden – übergebe an yt-dlp …");
        const filePath = await runDownload(s.workingCandidate, { ...downloadOptions, url: streamUrl }, {
          impersonate: deps.impersonateAvailable
        });
        return { filePath, candidate: s.workingCandidate };
      })
    }
  ];

  // stopOn applies in addition to the skip conditions: if the user cancels
  // in the middle of a running stage, the cascade ends immediately.
  const fallback = new FallbackManager({ logger, stopOn: () => cancelled() });
  const result = await fallback.run(stages, state);

  if (result.ok) {
    return {
      ok: true,
      filePath: result.value.filePath,
      candidate: result.value.candidate,
      stage: result.stage,
      attempts: result.attempts
    };
  }

  return {
    ok: false,
    // state.lastError is the original error (with .code such as ENOENT), which is
    // needed for the message to the user.
    error: state.lastError || result.error,
    attempts: result.attempts
  };
};

/**
 * Builds the error message for the UI. Carried over unchanged, only extended by the
 * structured errors of the browser stage.
 *
 * @param {Error} lastError
 * @param {{ options: Object, deps: Object }} context
 * @returns {string}
 */
const buildFailureMessage = (lastError, { options = {}, deps = {} } = {}) => {
  const details = (lastError && lastError.details) || {};
  const code = lastError && lastError.code;

  if (code === "ENOENT") {
    return "yt-dlp wurde nicht gefunden. Bitte installiere yt-dlp (z. B. \"pip install yt-dlp\") und stelle sicher, dass es im PATH liegt.";
  }
  if (code === "PLAYWRIGHT_NO_STREAM" || details.reason === "PLAYWRIGHT_NO_STREAM") {
    return "Seite nicht unterstützt (JS-Rendering, kein Stream gefunden).";
  }
  if (code === "PLAYWRIGHT_MISSING" || code === "PLAYWRIGHT_CHROMIUM_MISSING"
    || details.setup === "PLAYWRIGHT_MISSING" || details.setup === "PLAYWRIGHT_CHROMIUM_MISSING") {
    return lastError.message; // already a clear hint from the stream finder
  }

  let message = lastError ? lastError.message : "Unbekannter Download-Fehler.";
  if (isUnsupportedUrl(message)) {
    message = "Diese Seite wird von yt-dlp nicht unterstützt. Es wurde kein passender Extractor gefunden und der Generic-Extractor konnte kein Video erkennen.";
    if (!options.playwrightFallback) {
      message += " Tipp: Den Playwright-Fallback in den Einstellungen aktivieren, um JS-gerenderte Seiten zu unterstützen.";
    }
    return message;
  }

  if (!deps.ffmpegAvailable) {
    message += " Hinweis: ffmpeg wurde nicht gefunden – für die MP4-Zusammenführung und MP3-Konvertierung ist ffmpeg zwingend erforderlich.";
  }
  if (looksLikeBlock(message) || /sign in|login|age|verify|cookies?|private|members?-only/i.test(message)) {
    message += " Tipp: yt-dlp aktualisieren (pip install -U yt-dlp). Für anti-bot-geschützte Seiten Browser-Impersonation aktivieren (curl_cffi: pip install \"yt-dlp[default]\"). Für Login-/Altersschranken in den Einstellungen die Browser-Cookies wählen.";
  }
  return message;
};

module.exports = { runDownloadCascade, buildFailureMessage };

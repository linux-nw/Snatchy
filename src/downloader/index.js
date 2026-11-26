/**
 * Downloader layer.
 *
 * Works only with normalized ResolvedMedia objects and the
 * user options. Which site or provider resolver delivered the medium
 * no longer matters here.
 */

const { runDownloadCascade, buildFailureMessage } = require("./YtDlpDownloader");
const ytDlpArgs = require("./ytDlpArgs");

module.exports = {
  runDownloadCascade,
  buildFailureMessage,
  ...ytDlpArgs
};

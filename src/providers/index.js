/**
 * Registry of all bundled ProviderResolvers.
 *
 * To support a new host: create a file in this folder, derive a class from
 * ProviderResolver and add it here in createProviderRegistry().
 *
 * Priorities of the default resolvers:
 *   80 direct-media       URL already is a media file
 *   10 yt-dlp             catch-all for everything yt-dlp can do
 *    5 playwright-sniffer only if enabled in the UI, last stage
 */

const { ResolverRegistry } = require("../core/registry");
const { ProviderResolver } = require("./ProviderResolver");
const { DirectMediaProviderResolver } = require("./DirectMediaProviderResolver");
const { YtDlpProviderResolver } = require("./YtDlpProviderResolver");
const { PlaywrightProviderResolver } = require("./PlaywrightProviderResolver");

/**
 * @param {{ extra?: Array, findStream?: Function }} [options]
 * @returns {ResolverRegistry}
 */
const createProviderRegistry = (options = {}) => {
  const registry = new ResolverRegistry({ kind: "ProviderResolver" });
  registry.registerAll([
    new DirectMediaProviderResolver(),
    ...(options.extra || []),
    new YtDlpProviderResolver(),
    new PlaywrightProviderResolver({ findStream: options.findStream })
  ]);
  return registry;
};

module.exports = {
  createProviderRegistry,
  ProviderResolver,
  DirectMediaProviderResolver,
  YtDlpProviderResolver,
  PlaywrightProviderResolver
};

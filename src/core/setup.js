/**
 * Assembly of the default pipeline.
 *
 * One place where registries, cache and logger are wired together. The
 * rest of the app (main.js) only knows createDefaultResolverManager() and
 * createResolveContext().
 */

const { ResolverManager } = require("./ResolverManager");
const { ResolverCache } = require("../cache/ResolverCache");
const { createSiteRegistry } = require("../sites");
const { createProviderRegistry } = require("../providers");
const { nullLogger } = require("./logger");

/**
 * @param {Object} [options]
 * @param {Array}  [options.extraSites]
 * @param {Array}  [options.extraProviders]
 * @param {Function} [options.findStream] Replacement for the Playwright finder (tests)
 * @param {Object|null} [options.cache]   null = no cache
 * @param {Object} [options.logger]
 * @returns {ResolverManager}
 */
const createDefaultResolverManager = (options = {}) => new ResolverManager({
  sites: createSiteRegistry({ extra: options.extraSites }),
  providers: createProviderRegistry({
    extra: options.extraProviders,
    findStream: options.findStream
  }),
  cache: options.cache === undefined ? new ResolverCache() : options.cache,
  logger: options.logger || nullLogger()
});

module.exports = { createDefaultResolverManager };

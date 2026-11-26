/**
 * Registry of all bundled SiteResolvers.
 *
 * To support a new site: create a file in this folder, derive a class from
 * SiteResolver and add it here in createSiteRegistry().
 * The order in the array does not matter, priority decides.
 */

const { ResolverRegistry } = require("../core/registry");
const { SiteResolver } = require("./SiteResolver");
const { PodcastFeedSiteResolver, looksLikePodcastFeed } = require("./PodcastFeedSiteResolver");
const { GenericPageSiteResolver } = require("./GenericPageSiteResolver");

/**
 * @param {{ extra?: Array }} [options] additional resolvers (tests, plugins)
 * @returns {ResolverRegistry}
 */
const createSiteRegistry = (options = {}) => {
  const registry = new ResolverRegistry({ kind: "SiteResolver" });
  registry.registerAll([
    new PodcastFeedSiteResolver(),   // priority 90
    ...(options.extra || []),
    new GenericPageSiteResolver()    // priority 1, catches everything else
  ]);
  return registry;
};

module.exports = {
  createSiteRegistry,
  SiteResolver,
  PodcastFeedSiteResolver,
  GenericPageSiteResolver,
  looksLikePodcastFeed
};

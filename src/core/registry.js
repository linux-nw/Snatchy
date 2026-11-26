/**
 * Registry for site and provider resolvers.
 *
 * Replaces if/else chains: a resolver registers with canHandle(url) and
 * a priority, and the registry returns the matching candidates in
 * descending priority. A broken canHandle implementation must not
 * break the selection, so it is called in isolation.
 */

const DEFAULT_PRIORITY = 50;

/** Check the required shape of a resolver before it is registered. */
const assertResolverShape = (resolver, kind) => {
  if (!resolver || typeof resolver !== "object") {
    throw new TypeError(`${kind}: resolver object expected.`);
  }
  if (typeof resolver.name !== "string" || !resolver.name.trim()) {
    throw new TypeError(`${kind}: resolver needs a name.`);
  }
  if (typeof resolver.canHandle !== "function") {
    throw new TypeError(`${kind} "${resolver.name}": canHandle(url) missing.`);
  }
  if (typeof resolver.resolve !== "function") {
    throw new TypeError(`${kind} "${resolver.name}": resolve(url, context) missing.`);
  }
};

class ResolverRegistry {
  /**
   * @param {{ kind?: string, logger?: Object }} [options]
   */
  constructor(options = {}) {
    this.kind = options.kind || "Resolver";
    /** @type {Array<{resolver: Object, priority: number, order: number}>} */
    this._items = [];
    this._counter = 0;
  }

  /**
   * @param {Object} resolver  {name, canHandle, resolve, priority?}
   * @param {{ priority?: number }} [options]
   * @returns {this}
   */
  register(resolver, options = {}) {
    assertResolverShape(resolver, this.kind);
    if (this._items.some((item) => item.resolver.name === resolver.name)) {
      throw new Error(`${this.kind} "${resolver.name}" is already registered.`);
    }
    const priority = Number.isFinite(options.priority)
      ? options.priority
      : (Number.isFinite(resolver.priority) ? resolver.priority : DEFAULT_PRIORITY);
    this._items.push({ resolver, priority, order: this._counter++ });
    return this;
  }

  /** Register several at once. */
  registerAll(resolvers = []) {
    for (const resolver of resolvers) this.register(resolver);
    return this;
  }

  /** @param {string} name */
  unregister(name) {
    const before = this._items.length;
    this._items = this._items.filter((item) => item.resolver.name !== name);
    return this._items.length !== before;
  }

  /** @param {string} name */
  get(name) {
    const item = this._items.find((i) => i.resolver.name === name);
    return item ? item.resolver : null;
  }

  /** All resolvers by priority (highest first), stable on ties. */
  list() {
    return this._items
      .slice()
      .sort((a, b) => (b.priority - a.priority) || (a.order - b.order))
      .map((item) => item.resolver);
  }

  /** Names including priority, for logging/diagnostics. */
  describe() {
    return this._items
      .slice()
      .sort((a, b) => (b.priority - a.priority) || (a.order - b.order))
      .map((item) => ({ name: item.resolver.name, priority: item.priority }));
  }

  /**
   * Matching resolvers for a URL, sorted by priority.
   * @param {string} url
   * @param {{ logger?: Object }} [options]
   * @returns {Object[]}
   */
  match(url, options = {}) {
    const logger = options.logger;
    return this.list().filter((resolver) => {
      try {
        return !!resolver.canHandle(url);
      } catch (err) {
        // A faulty canHandle must not block the other resolvers.
        if (logger) {
          logger.step("resolver-fail", {
            resolver: resolver.name,
            code: "EXTRACTION_FAILED",
            message: `canHandle threw: ${err && err.message ? err.message : err}`
          });
        }
        return false;
      }
    });
  }

  /** The first matching resolver or null. */
  find(url, options = {}) {
    const matches = this.match(url, options);
    return matches.length ? matches[0] : null;
  }

  get size() {
    return this._items.length;
  }
}

module.exports = { ResolverRegistry, DEFAULT_PRIORITY, assertResolverShape };

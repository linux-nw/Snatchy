/**
 * FallbackManager: generic pipeline of stages that are tried one after another.
 *
 * Generalizes the app's existing cascade
 *   (impersonation -> age-gate bypass -> without impersonation ->
 *    Generic-Extractor -> Playwright -> Fehler)
 * into a reusable flow that the ResolverManager also uses.
 *
 * Properties:
 * - every stage is isolated: an error does not end the pipeline,
 * - stages can be skipped via skip() (condition + reason),
 * - errors are collected in a structured way (ResolveError with code),
 * - terminal errors (cancellation) stop immediately,
 * - every step is logged.
 */

const { toResolveError, pickMostRelevantError, TERMINAL_CODES } = require("./errors");
const { STEP, nullLogger } = require("./logger");

/**
 * @typedef {Object} FallbackStage
 * @property {string} name
 * @property {(state: Object) => (boolean|string)} [skip] true/reason = skip
 * @property {(state: Object) => Promise<any>} run       Result or throw
 * @property {(value: any) => boolean} [accept]          Is the result valid? (default: != null)
 */

class FallbackManager {
  /**
   * @param {{ logger?: Object, stopOn?: (error: Object, state: Object) => boolean }} [options]
   */
  constructor(options = {}) {
    this.logger = options.logger || nullLogger();
    this.stopOn = typeof options.stopOn === "function" ? options.stopOn : null;
  }

  /**
   * Runs the stages in order until one delivers a valid result.
   *
   * @param {FallbackStage[]} stages
   * @param {Object} [state] Shared, mutable state of all stages
   * @returns {Promise<{ok: boolean, value?: any, stage?: string, error?: Object, attempts: Array}>}
   */
  async run(stages, state = {}) {
    const attempts = [];
    const errors = [];

    for (const stage of stages || []) {
      if (!stage || typeof stage.run !== "function") continue;

      const skip = typeof stage.skip === "function" ? stage.skip(state) : false;
      if (skip) {
        const reason = typeof skip === "string" ? skip : "condition not met";
        attempts.push({ stage: stage.name, skipped: true, reason });
        this.logger.step(STEP.FALLBACK, { resolver: stage.name, message: `skipped: ${reason}` });
        continue;
      }

      const startedAt = Date.now();
      this.logger.step(STEP.RESOLVER_TRY, { resolver: stage.name });
      try {
        const value = await stage.run(state);
        const accept = typeof stage.accept === "function"
          ? stage.accept(value)
          : (value !== null && value !== undefined && value !== false);
        if (accept) {
          attempts.push({ stage: stage.name, ok: true, ms: Date.now() - startedAt });
          this.logger.step(STEP.RESOLVER_OK, { resolver: stage.name, ms: Date.now() - startedAt });
          return { ok: true, value, stage: stage.name, attempts };
        }
        const empty = toResolveError(new Error("Kein Ergebnis."), { resolver: stage.name });
        errors.push(empty);
        attempts.push({ stage: stage.name, ok: false, code: empty.code, message: empty.message, ms: Date.now() - startedAt });
        this.logger.step(STEP.RESOLVER_FAIL, { resolver: stage.name, code: empty.code, message: empty.message });
      } catch (rawError) {
        const error = toResolveError(rawError, { resolver: stage.name });
        errors.push(error);
        attempts.push({ stage: stage.name, ok: false, code: error.code, message: error.message, ms: Date.now() - startedAt });
        this.logger.step(STEP.RESOLVER_FAIL, { resolver: stage.name, code: error.code, message: error.message });

        if (TERMINAL_CODES.has(error.code) || (this.stopOn && this.stopOn(error, state))) {
          return { ok: false, error, stage: stage.name, attempts };
        }
      }
    }

    return { ok: false, error: pickMostRelevantError(errors), attempts };
  }
}

module.exports = { FallbackManager };

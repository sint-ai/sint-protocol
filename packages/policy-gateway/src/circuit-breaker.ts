/**
 * SINT Protocol — Circuit Breaker (ASI10 / EU AI Act Art. 14(4)(e)).
 *
 * Provides the "stop button" required by EU AI Act Article 14(4)(e) for
 * high-risk AI systems: human supervisors must be able to interrupt agent
 * operation. This implementation actually works — unlike some prior art
 * that marks compensations without executing them.
 *
 * State machine:
 *
 *   CLOSED ──(N denials in window)──▶ OPEN
 *   CLOSED ◀──(operator reset())──── OPEN
 *   OPEN   ──(halfOpenAfterMs)──────▶ HALF_OPEN
 *   HALF_OPEN ──(success)───────────▶ CLOSED
 *   HALF_OPEN ──(failure)───────────▶ OPEN
 *   * ──(operator trip())───────────▶ OPEN  (immediate)
 *
 * @module @sint/gate-policy-gateway/circuit-breaker
 */

/** Circuit state for a single agent. */
export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

/**
 * Circuit breaker plugin interface.
 *
 * Implementations can use in-memory state, Redis, or a database.
 * Called by PolicyGateway at the start and end of every intercept().
 *
 * Fail-open: if the plugin throws, PolicyGateway treats the circuit as CLOSED
 * and proceeds normally.
 */
export interface CircuitBreakerPlugin {
  /** Get the current circuit state for an agent. */
  getState(agentId: string): Promise<CircuitState>;

  /**
   * Record a policy denial for an agent.
   * Increments the failure counter. Opens the circuit if threshold is reached.
   * Returns the new state after recording.
   */
  recordDenial(agentId: string, reason: string): Promise<CircuitState>;

  /**
   * Record a successful allow for an agent.
   * Decrements failure pressure. Closes the circuit if in HALF_OPEN and
   * the success threshold is reached.
   */
  recordSuccess(agentId: string): Promise<CircuitState>;

  /**
   * Operator manual trip — force circuit OPEN immediately.
   * EU AI Act Article 14(4)(e) stop button.
   * Emits "agent.circuit.tripped" with operator reason.
   */
  trip(agentId: string, reason?: string): Promise<void>;

  /**
   * Operator manual reset — force circuit CLOSED.
   * Clears failure counters and half-open state.
   */
  reset(agentId: string): Promise<void>;
}

/** Configuration for InMemoryCircuitBreaker. */
export interface CircuitBreakerConfig {
  /**
   * Number of denials in the window before the circuit OPENS.
   * Default: 5
   */
  readonly failureThreshold?: number;

  /**
   * Number of consecutive successes in HALF_OPEN state to re-close.
   * Default: 2
   */
  readonly successThreshold?: number;

  /**
   * Time (ms) after the circuit OPENS before entering HALF_OPEN state.
   * Default: 60_000 (1 minute)
   */
  readonly halfOpenAfterMs?: number;

  /**
   * Sliding window (ms) for counting failures.
   * Denials outside this window are ignored.
   * Default: 300_000 (5 minutes)
   */
  readonly windowMs?: number;
}

interface CircuitEntry {
  state: CircuitState;
  failures: number[];          // timestamps of recent denials
  halfOpenSuccesses: number;
  openedAt?: number;           // Date.now() when circuit opened
  manualTrip: boolean;         // operator-tripped circuits don't auto-close
}

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_SUCCESS_THRESHOLD = 2;
const DEFAULT_HALF_OPEN_AFTER_MS = 60_000;
const DEFAULT_WINDOW_MS = 300_000;

/**
 * In-memory circuit breaker reference implementation.
 *
 * Suitable for single-process deployments and testing.
 * For production multi-instance deployments, use a Redis-backed implementation.
 */
export class InMemoryCircuitBreaker implements CircuitBreakerPlugin {
  private readonly circuits = new Map<string, CircuitEntry>();
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly halfOpenAfterMs: number;
  private readonly windowMs: number;

  constructor(config: CircuitBreakerConfig = {}) {
    this.failureThreshold = config.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.successThreshold = config.successThreshold ?? DEFAULT_SUCCESS_THRESHOLD;
    this.halfOpenAfterMs = config.halfOpenAfterMs ?? DEFAULT_HALF_OPEN_AFTER_MS;
    this.windowMs = config.windowMs ?? DEFAULT_WINDOW_MS;
  }

  async getState(agentId: string): Promise<CircuitState> {
    const entry = this.getEntry(agentId);
    return this.resolveState(entry);
  }

  async recordDenial(agentId: string, _reason: string): Promise<CircuitState> {
    const entry = this.getEntry(agentId);
    const now = Date.now();

    // Prune stale failures outside the window
    entry.failures = entry.failures.filter((t) => now - t < this.windowMs);
    entry.failures.push(now);

    const current = this.resolveState(entry);

    if (current === "HALF_OPEN") {
      // Failure in half-open → back to OPEN
      entry.state = "OPEN";
      // Backoff: after a failed probe, keep the circuit OPEN for another full
      // half-open interval before allowing the next probe. This reduces flapping
      // under scheduler jitter (and is the safer default for fail-closed systems).
      entry.openedAt = now + this.halfOpenAfterMs;
      entry.halfOpenSuccesses = 0;
      return "OPEN"; // return directly — don't resolveState which would re-enter HALF_OPEN
    } else if (current === "CLOSED" && entry.failures.length >= this.failureThreshold) {
      entry.state = "OPEN";
      entry.openedAt = now;
      return "OPEN";
    }

    return this.resolveState(entry);
  }

  async recordSuccess(agentId: string): Promise<CircuitState> {
    const entry = this.getEntry(agentId);
    const current = this.resolveState(entry);

    if (current === "HALF_OPEN") {
      entry.halfOpenSuccesses += 1;
      if (entry.halfOpenSuccesses >= this.successThreshold) {
        // Recovery confirmed — close the circuit
        entry.state = "CLOSED";
        entry.failures = [];
        entry.halfOpenSuccesses = 0;
        entry.openedAt = undefined;
        entry.manualTrip = false;
      }
    } else if (current === "CLOSED") {
      // Healthy operation — slowly drain failure pressure
      if (entry.failures.length > 0) {
        entry.failures.shift();
      }
    }

    return this.resolveState(entry);
  }

  async trip(agentId: string, _reason?: string): Promise<void> {
    const entry = this.getEntry(agentId);
    entry.state = "OPEN";
    entry.openedAt = Date.now();
    entry.manualTrip = true;
    entry.halfOpenSuccesses = 0;
  }

  async reset(agentId: string): Promise<void> {
    this.circuits.set(agentId, {
      state: "CLOSED",
      failures: [],
      halfOpenSuccesses: 0,
      openedAt: undefined,
      manualTrip: false,
    });
  }

  private getEntry(agentId: string): CircuitEntry {
    if (!this.circuits.has(agentId)) {
      this.circuits.set(agentId, {
        state: "CLOSED",
        failures: [],
        halfOpenSuccesses: 0,
        manualTrip: false,
      });
    }
    return this.circuits.get(agentId)!;
  }

  private resolveState(entry: CircuitEntry): CircuitState {
    if (entry.state === "CLOSED") return "CLOSED";

    if (entry.state === "OPEN") {
      // Manual trips never auto-transition to HALF_OPEN
      if (entry.manualTrip) return "OPEN";

      const elapsed = Date.now() - (entry.openedAt ?? 0);
      if (elapsed > this.halfOpenAfterMs) {
        // Transition to HALF_OPEN for probe
        entry.state = "HALF_OPEN";
        entry.halfOpenSuccesses = 0;
        return "HALF_OPEN";
      }
      return "OPEN";
    }

    return entry.state;
  }
}

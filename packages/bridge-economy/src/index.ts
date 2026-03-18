/**
 * SINT Protocol — Economy Bridge.
 *
 * Port/adapter integration between sint-protocol's PolicyGateway
 * and external economy services (balance, budget, trust, pricing).
 *
 * @module @sint/bridge-economy
 */

// ─── Interfaces (Ports) ──────────────────────────────────────
export type {
  IBalancePort,
  BalanceInfo,
  IBudgetPort,
  BudgetCheckParams,
  BudgetCheckResult,
  ITrustPort,
  TrustEvalParams,
  TrustEvalResult,
  EconomyTrustLevel,
  IPricingPort,
  PricingContext,
  PricingInfo,
} from "./interfaces.js";

// ─── Economy Plugin ──────────────────────────────────────────
export { EconomyPlugin } from "./economy-plugin.js";
export type { EconomyPluginConfig, PreInterceptResult } from "./economy-plugin.js";

// ─── Pricing Calculator ──────────────────────────────────────
export {
  computeActionCost,
  getBaseCost,
  BASE_TOOL_CALL_COST,
  BASE_CHAT_MESSAGE_COST,
  BASE_CAPSULE_EXEC_COST,
  BASE_ROS2_PUBLISH_COST,
  GLOBAL_MARKUP_MULTIPLIER,
  TOKENS_PER_DOLLAR,
  INITIAL_USER_BALANCE,
} from "./pricing-calculator.js";

// ─── Trust/Tier Mapping ──────────────────────────────────────
export {
  mapTrustLevelToApprovalTier,
  mergedTier,
  wouldEscalate,
} from "./trust-tier-mapper.js";

// ─── Ledger Emitter ──────────────────────────────────────────
export { EconomyLedgerEmitter } from "./ledger-emitter.js";

// ─── Errors ──────────────────────────────────────────────────
export {
  EconomyError,
  InsufficientBalanceError,
  BudgetExceededError,
  TrustBlockedError,
} from "./errors.js";

// ─── In-Memory Adapters (Testing) ────────────────────────────
export { InMemoryBalanceAdapter } from "./adapters/in-memory-balance-adapter.js";
export { InMemoryBudgetAdapter } from "./adapters/in-memory-budget-adapter.js";
export { InMemoryTrustAdapter } from "./adapters/in-memory-trust-adapter.js";
export { InMemoryPricingAdapter } from "./adapters/in-memory-pricing-adapter.js";

// ─── HTTP Adapters (Production) ──────────────────────────────
export { HttpBalanceAdapter } from "./adapters/http-balance-adapter.js";
export { HttpBudgetAdapter } from "./adapters/http-budget-adapter.js";
export { HttpTrustAdapter } from "./adapters/http-trust-adapter.js";
export { HttpPricingAdapter } from "./adapters/http-pricing-adapter.js";

// ─── HTTP Client ─────────────────────────────────────────────
export { HttpClient } from "./adapters/http-client.js";
export type { HttpClientConfig } from "./adapters/http-client.js";

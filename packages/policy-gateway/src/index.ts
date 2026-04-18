export { PolicyGateway } from "./gateway.js";
export type {
  PolicyGatewayConfig,
  TokenResolver,
  LedgerEmitter,
  EconomyPluginHooks,
  CsmlEscalationPlugin,
  DynamicEnvelopePlugin,
  EdgeControlPlanePlugin,
  VerifiableComputePlugin,
} from "./gateway.js";
export { DefaultSupplyChainVerifier } from "./supply-chain.js";
export type {
  SupplyChainVerifierPlugin,
  SupplyChainVerificationResult,
} from "./supply-chain.js";
export { DefaultGoalHijackDetector } from "./goal-hijack.js";
export type { GoalHijackPlugin, GoalHijackResult } from "./goal-hijack.js";
export { DefaultMemoryIntegrityChecker } from "./memory-integrity.js";
export type {
  MemoryIntegrityPlugin,
  MemoryIntegrityResult,
} from "./memory-integrity.js";
export { InMemoryCircuitBreaker } from "./circuit-breaker.js";
export type { CircuitBreakerPlugin, CircuitBreakerConfig, CircuitState } from "./circuit-breaker.js";
export { ProactiveEscalationEngine } from "./proactive-escalation.js";
export type { EscalationAlert, EventSource, ProactiveEscalationEngineOptions } from "./proactive-escalation.js";
export { assignTier } from "./tier-assigner.js";
export type { TierAssignment } from "./tier-assigner.js";
export { checkConstraints, extractPhysicalContext } from "./constraint-checker.js";
export type { ConstraintViolation } from "./constraint-checker.js";
export { checkForbiddenCombos } from "./forbidden-combos.js";
export type { ComboCheckResult } from "./forbidden-combos.js";
export type { SafetyPermitPlugin, SafetyPermitResult, PermitState, InterlockState, EstopState } from "./safety-permit.js";
export { NoopSafetyPermitPlugin } from "./safety-permit.js";
export { DefaultArgInjectionDetector } from "./arg-injection-detector.js";
export type { ArgInjectionDetector, ArgInjectionResult } from "./arg-injection-detector.js";
export { ApprovalQueue } from "./approval-flow.js";
export type {
  ApprovalRequest,
  ApprovalResolution,
  ApprovalEvent,
  ApprovalEventHandler,
  ApprovalQueueConfig,
  ApprovalQuorum,
} from "./approval-flow.js";

// Compatibility re-exports for bridge packages (Home Assistant, Matter, etc.).
// The source of truth for these types lives in @pshkv/core, but downstream code
// commonly imports them from the gateway package.
export type { SintRequest as PolicyContext, PolicyDecision } from "@pshkv/core";

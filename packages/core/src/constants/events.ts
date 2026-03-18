/**
 * SINT Protocol — Event type constants.
 *
 * @module @sint/core/constants/events
 */

/** All SINT event types as string constants for switch/case usage. */
export const SINT_EVENTS = {
  // Lifecycle
  AGENT_REGISTERED: "agent.registered",
  CAPABILITY_GRANTED: "agent.capability.granted",
  CAPABILITY_REVOKED: "agent.capability.revoked",

  // Request/Response
  REQUEST_RECEIVED: "request.received",
  POLICY_EVALUATED: "policy.evaluated",
  APPROVAL_REQUESTED: "approval.requested",
  APPROVAL_GRANTED: "approval.granted",
  APPROVAL_DENIED: "approval.denied",
  APPROVAL_TIMEOUT: "approval.timeout",

  // Execution
  ACTION_STARTED: "action.started",
  ACTION_COMPLETED: "action.completed",
  ACTION_FAILED: "action.failed",
  ACTION_ROLLEDBACK: "action.rolledback",

  // Safety
  ESTOP_TRIGGERED: "safety.estop.triggered",
  GEOFENCE_VIOLATION: "safety.geofence.violation",
  FORCE_EXCEEDED: "safety.force.exceeded",
  HUMAN_DETECTED: "safety.human.detected",
  ANOMALY_DETECTED: "safety.anomaly.detected",

  // Engine — System 1
  SYSTEM1_INFERENCE: "engine.system1.inference",
  SYSTEM1_ANOMALY: "engine.system1.anomaly",

  // Engine — System 2
  SYSTEM2_PLAN_CREATED: "engine.system2.plan.created",
  SYSTEM2_PLAN_VALIDATED: "engine.system2.plan.validated",
  SYSTEM2_PLAN_STEP_EXECUTED: "engine.system2.plan.step.executed",
  SYSTEM2_TICK: "engine.system2.tick",

  // Engine — Arbitration
  ARBITRATION_DECIDED: "engine.arbitration.decided",
  ARBITRATION_OVERRIDE: "engine.arbitration.override",
  ARBITRATION_ESCALATED: "engine.arbitration.escalated",

  // Engine — Capsule Sandbox
  CAPSULE_LOADED: "capsule.loaded",
  CAPSULE_VALIDATED: "capsule.validated",
  CAPSULE_EXECUTED: "capsule.executed",
  CAPSULE_UNLOADED: "capsule.unloaded",
  CAPSULE_RESOURCE_EXCEEDED: "capsule.resource.exceeded",

  // Engine — HAL
  HAL_HARDWARE_DETECTED: "hal.hardware.detected",
  HAL_PROFILE_SELECTED: "hal.profile.selected",

  // Economic — Marketplace
  CAPSULE_PURCHASED: "capsule.purchased",
  TASK_BID_PLACED: "task.bid.placed",
  PAYMENT_SETTLED: "payment.settled",

  // Economic — Balance
  ECONOMY_BALANCE_CHECKED: "economy.balance.checked",
  ECONOMY_BALANCE_DEDUCTED: "economy.balance.deducted",
  ECONOMY_BALANCE_INSUFFICIENT: "economy.balance.insufficient",

  // Economic — Budget
  ECONOMY_BUDGET_CHECKED: "economy.budget.checked",
  ECONOMY_BUDGET_EXCEEDED: "economy.budget.exceeded",
  ECONOMY_BUDGET_ALERT: "economy.budget.alert",

  // Economic — Trust & Billing
  ECONOMY_TRUST_EVALUATED: "economy.trust.evaluated",
  ECONOMY_TRUST_BLOCKED: "economy.trust.blocked",
  ECONOMY_ACTION_BILLED: "economy.action.billed",
} as const;

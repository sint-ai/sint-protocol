/**
 * SINT Protocol — OWASP Agentic Top 10 coverage map.
 *
 * Formal declaration of which OWASP ASI categories SINT addresses,
 * at what coverage level, and via which components.
 *
 * @module @sint/core/constants/compliance
 */

import { OwaspAsi, type OwaspCoverageEntry } from "../types/compliance.js";

/**
 * SINT Protocol OWASP Agentic Top 10 coverage.
 *
 * Coverage summary:
 *   Full    (8/10): ASI01, ASI02, ASI03, ASI04, ASI07, ASI08, ASI09, ASI10
 *   Partial (2/10): ASI05, ASI06
 *   None    (0/10)
 */
export const SINT_OWASP_COVERAGE: readonly OwaspCoverageEntry[] = [
  {
    category: OwaspAsi.ASI01_GOAL_HIJACK,
    level: "full",
    implementedBy: [
      "@sint/gate-policy-gateway (forbidden-combos)",
      "@sint/avatar (CSML drift detection)",
      "@sint/gate-policy-gateway (GoalHijackPlugin)",
    ],
    description:
      "Forbidden action-sequence detection catches known goal-hijack patterns " +
      "(e.g., read + exfiltrate combo). CSML drift score detects anomalous " +
      "action-frequency shifts that may indicate injected objectives. " +
      "GoalHijackPlugin provides 5-layer heuristic detection of prompt injection, " +
      "role override, semantic escalation, exfiltration probes, and cross-agent injection.",
  },
  {
    category: OwaspAsi.ASI02_TOOL_MISUSE,
    level: "full",
    implementedBy: [
      "@sint/bridge-mcp (TAM enforcement)",
      "@sint/gate-policy-gateway (tier assignment)",
      "@sint/gate-capability-tokens (resource scope)",
    ],
    description:
      "Tool Authorization Manifests (TAM) define per-tool security requirements. " +
      "Every MCP tool call is validated against the manifest before execution. " +
      "Capability token resource scope ensures tools can only be called within " +
      "the authorized resource pattern.",
  },
  {
    category: OwaspAsi.ASI03_IDENTITY_ABUSE,
    level: "full",
    implementedBy: [
      "@sint/gate-capability-tokens (Ed25519 signing)",
      "@sint/gate-capability-tokens (did:key identity)",
      "@sint/gate-capability-tokens (delegation chain)",
    ],
    description:
      "Every capability token is Ed25519-signed with the issuer's private key. " +
      "Agent identity = did:key (Ed25519 public key). Delegation chain is verified " +
      "at every level — a forged token or broken chain is rejected at step 2 of intercept(). " +
      "Revocation store provides instant invalidation.",
  },
  {
    category: OwaspAsi.ASI04_SUPPLY_CHAIN,
    level: "full",
    implementedBy: [
      "@sint/bridge-mcp (TAM manifest validation)",
      "@sint/gate-capability-tokens (Ed25519 plugin signing)",
    ],
    description:
      "TAM manifests are defined by the operator (not the tool provider) — " +
      "a malicious tool cannot self-declare elevated permissions. " +
      "All tool schemas are validated against the operator-controlled manifest " +
      "before any call is forwarded.",
  },
  {
    category: OwaspAsi.ASI05_CODE_EXECUTION,
    level: "partial",
    implementedBy: [
      "@sint/gate-policy-gateway (forbidden-combos)",
      "@sint/engine-capsule-sandbox (isolation)",
    ],
    description:
      "Capsule sandbox provides process-level isolation for agent execution. " +
      "Forbidden combo rules block known shell-execution sequences.",
    gaps:
      "No semantic analysis of tool arguments for code injection. " +
      "Shell tool calls are not specifically classified at T3_COMMIT tier by default.",
  },
  {
    category: OwaspAsi.ASI06_MEMORY_POISONING,
    level: "partial",
    implementedBy: [
      "@sint/gate-policy-gateway (DefaultMemoryIntegrityChecker)",
    ],
    description:
      "DefaultMemoryIntegrityChecker detects history anomalies: suspicious " +
      "repetition (replay attack), unauthorized privilege claims in recentActions, " +
      "history length overflow, and UUIDv7 timestamp monotonicity violations. " +
      "High-severity anomalies (privilege claims, timestamp rollback) → deny. " +
      "Medium/low → warn-and-allow with audit event.",
    gaps:
      "Memory store not yet persisted — checker state is per-gateway-instance only. " +
      "No semantic analysis of memory embedding space for vector poisoning. " +
      "Cross-session memory continuity not yet verified.",
  },
  {
    category: OwaspAsi.ASI07_INTER_AGENT,
    level: "full",
    implementedBy: [
      "@sint/bridge-a2a (A2A protocol enforcement)",
      "@sint/gate-capability-tokens (did:key per agent)",
    ],
    description:
      "A2A bridge validates the sender's capability token before processing " +
      "any inter-agent message. Each agent's identity is a did:key — " +
      "spoofed messages from unknown or unauthorized senders are rejected. " +
      "APS↔SINT interop mapping covers cross-org agent communication.",
  },
  {
    category: OwaspAsi.ASI08_CASCADE,
    level: "full",
    implementedBy: [
      "@sint/gate-policy-gateway (CircuitBreakerPlugin)",
      "@sint/gate-policy-gateway (rate limiting)",
      "@sint/bridge-swarm (SwarmCoordinator collective constraints)",
    ],
    description:
      "CircuitBreakerPlugin opens the circuit (OPEN state) when an agent trips " +
      "N consecutive denials — all subsequent requests auto-deny without processing. " +
      "Rate limiting prevents runaway tool-call storms. SwarmCoordinator caps " +
      "collective kinetic energy Σ(½mv²) and escalated-fraction across fleets.",
  },
  {
    category: OwaspAsi.ASI09_TRUST_EXPLOIT,
    level: "full",
    implementedBy: [
      "@sint/gate-policy-gateway (T2/T3 human approval)",
      "@sint/gate-policy-gateway (M-of-N quorum)",
      "@sint/avatar (CSML drift detection)",
    ],
    description:
      "T2_act requires operator review before physical execution. " +
      "T3_commit requires explicit human sign-off with configurable M-of-N quorum. " +
      "CSML drift detection auto-escalates agents showing deceptive behavioral patterns " +
      "(anomalous persona) regardless of their token tier.",
  },
  {
    category: OwaspAsi.ASI10_ROGUE_AGENT,
    level: "full",
    implementedBy: [
      "@sint/gate-policy-gateway (CircuitBreakerPlugin)",
      "@sint/avatar (CSML anomalous persona)",
      "@sint/gate-policy-gateway (DynamicEnvelopePlugin)",
    ],
    description:
      "CircuitBreakerPlugin provides the EU AI Act Article 14(4)(e) 'stop button': " +
      "operators can manually trip() the circuit, instantly blocking all actions " +
      "from an agent. CSML anomalous persona auto-trips the circuit when safety events " +
      "are detected. DynamicEnvelopePlugin enforces environment-adaptive physical limits " +
      "even when the agent presents a valid token.",
  },
] as const;

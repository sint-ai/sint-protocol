# SINT Protocol: A Runtime Authorization Framework for Physical AI Agents

**Submission target:** 1st IJCAI Workshop on Safe Physical AI (SPAI 2026)
**Venue:** IJCAI/ECAI 2026, Bremen, Germany, August 15–17, 2026
**Deadline:** May 7, 2026 · **Track:** Extended abstract (1 page + references)
**Contact:** openreview.net/group?id=ijcai.org/IJCAI-ECAI/2026/Workshop/SPAI

---

## Abstract

Physical AI agents — LLM-driven systems controlling robots, drones, and actuators — introduce a safety failure mode that neither classical robot safety (IEC 62443, ISO 10218) nor LLM alignment research fully addresses: **an authenticated, aligned agent issuing a physically irreversible command without appropriate human oversight, at the wrong moment, in a degraded environment**.

We present **SINT Protocol**, an open-source runtime authorization framework that enforces four safety invariants at every agent action boundary:

1. **Capability confinement.** Every action is authorized by a signed, expiring capability token scoped to a specific resource, action, and physical constraint envelope (max velocity, max force, geofence polygon). Tokens cannot be self-issued or silently expanded.

2. **Tier-based human oversight.** Actions are classified into four approval tiers — `T0_observe` (auto-allow), `T1_prepare` (audit), `T2_act` (human review), `T3_commit` (explicit sign-off with M-of-N quorum). Classification is driven by a resource pattern matching engine with 50+ rules covering ROS 2 topics, MAVLink commands, and MCP tool calls. Shell and code-execution tool names (bash, exec, eval, run_command, etc.) are explicitly classified at `T3_commit` to address ASI05.

3. **Behavioral drift detection (CSML).** The Composite Safety-Model Latency score tracks an agent's out-of-policy action rate, timing anomalies, and safety event frequency across a sliding window of evidence. When CSML exceeds a threshold θ, the agent's tier is automatically escalated — making behavioral drift a live enforcement trigger rather than a post-incident finding. Empirically, frontier LLMs exhibit up to 4.8× differences in out-of-policy action proposal rates on identical tasks [Cardenas et al., 2026]; SINT makes this variance enforcement-visible.

4. **Environment-adaptive constraint tightening (DynamicEnvelopePlugin).** Token constraints are necessarily static at issuance. SINT introduces a plugin interface through which real-time sensor state (obstacle distance, human proximity) is mapped to tighter effective limits: `effective_max_velocity = min(token.maxVelocityMps, obstacle_distance × reaction_factor)`. This closes the gap identified in ROSClaw [Cardenas et al., 2026] between "configurable safety envelope" and "environment-adaptive safety envelope."

5. **Active safety plugins.** The GoalHijackPlugin (ASI01) provides 5-layer heuristic detection of prompt injection, role override, semantic escalation, exfiltration probes, and cross-agent injection. The MemoryIntegrityChecker (ASI06) detects replay attacks, privilege claims, and history overflow anomalies. The DefaultSupplyChainVerifier (ASI04) validates model fingerprint hashes and model ID allowlists at runtime to detect tampered tools or swapped model versions.

6. **CircuitBreakerPlugin (EU AI Act Art. 14(4)(e) stop button).** Operators can manually `trip()` the circuit to instantly block all actions from a rogue agent. N consecutive denials auto-open the circuit. CSML anomalous-persona detection auto-trips the circuit. HALF_OPEN probe recovery ensures self-healing after incident resolution.

**Swarm safety.** For multi-agent deployments, SINT's `SwarmCoordinator` enforces collective constraints before individual gateway calls: maximum concurrent actors in T2+ tier, total kinetic energy ceiling (Σ½mv²), minimum inter-agent distance, and maximum escalated fraction. These collective constraints cannot be captured by per-agent token scoping alone.

**Implementation.** SINT is implemented in TypeScript, structured as 31 packages. Current coverage: 1,105 tests across the full stack (core, gateway, bridges, avatar layer, swarm coordinator). Bridge adapters exist for ROS 2, MAVLink v2, MCP tool calls, Google A2A, MQTT/CoAP IoT, OPC-UA, Open-RMF, and Sparkplug B. The Evidence Ledger implements a SHA-256 hash chain with optional TEE attestation (Intel SGX, ARM TrustZone, AMD SEV) for post-incident forensics, with PostgreSQL-backed persistence and hash-chain preservation across restarts.

**Compliance.** SINT covers all 10 OWASP Agentic Top 10 categories (ASI01 goal hijack, ASI02 tool misuse, ASI03 identity abuse, ASI04 supply chain, ASI05 code execution, ASI06 memory poisoning, ASI07 inter-agent, ASI08 cascade, ASI09 trust exploit, ASI10 rogue agent). Coverage is formally declared in the compliance module and is regression-tested as part of the 1,105-test suite, including a dedicated 10-test MCP attack surface conformance suite that validates each ASI category against the gateway choke point.

**Position.** Safe physical AI requires that authorization be treated as a first-class runtime concern — not a deployment configuration or a prompt engineering problem. The safety properties that matter (who approved this action, was the envelope respected, was the agent's drift within bounds) must be cryptographically auditable and enforced before hardware execution, not after. SINT Protocol is a concrete instantiation of this position.

**Open source:** https://github.com/sint-ai/sint-protocol

---

## References

- Cardenas, I.S., Arnett, M.A., Yeo, N.C., Sah, L., Kim, J.-H. (2026). ROSClaw: An OpenClaw ROS 2 Framework for Agentic Robot Control and Interaction. arXiv:2603.26997.
- IEC 62443-3-3:2013. Industrial communication networks — IT security for networks and systems.
- ISO 10218-1:2011. Robots and robotic devices — Safety requirements for industrial robots.
- NIST AI RMF 1.0 (2023). Artificial Intelligence Risk Management Framework.
- NIST SP 800-82 Rev. 3 (2023). Guide to Operational Technology (OT) Security.

---

*Word count target: 500 words (abstract only). Full 4-page version available on request.*

---

## Submission Instructions (SPAI 2026)

- Submit at: https://openreview.net/group?id=ijcai.org/IJCAI-ECAI/2026/Workshop/SPAI
- Deadline: May 7, 2026 (23:59 AoE)
- Format: 1-page extended abstract + references (PDF)
- Template: IJCAI 2026 latex template
- Track: Position paper / Extended Abstract
- Contact: spai2026@example.com (check workshop website for actual email)

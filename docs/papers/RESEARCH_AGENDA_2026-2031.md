# SINT Protocol — Research Agenda 2026–2031

> Thinking like a scientist: what are the hardest open problems in physical AI
> security over the next five years, and how does SINT address them?

---

## Problem Statement

Physical AI is undergoing a phase transition. In 2024–2025, LLMs became robotic
co-pilots. By 2026–2027, they will be primary controllers. By 2029–2031,
multi-agent physical systems — drone swarms, robot fleets, autonomous factories
— will operate with minimal human oversight. The security model for this world
does not yet exist.

**The core problem**: capability tokens and approval tiers solve single-agent
authorization. They do not solve multi-agent emergent behavior, Byzantine
coordination, or the physics of distributed systems operating below human
reaction time.

---

## Problem 1: Swarm Coordination Security (2026–2027)

**The threat**: A drone swarm of N agents shares a task. Each individual agent
has a valid capability token. But the *collective* action — N drones converging
on a target point — is dangerous in ways no individual token expresses.

**Current SINT gap**: The capability token is per-agent. There is no
cross-agent constraint. N agents with `maxVelocityMps: 5` can collectively
produce a 500-agent convergence event that no individual constraint captures.

**Research directions**:

1. **Swarm token** — a group capability token that encodes collective constraints:
   ```typescript
   interface SwarmCapabilityToken extends SintCapabilityToken {
     swarmConstraints: {
       maxSwarmDensity: number;      // agents per m³
       minInterAgentDistance: number; // meters
       maxCollectiveKineticEnergy: number; // joules = Σ(½mv²)
       synchronizationWindow: number; // ms — how tightly agents can be coordinated
     };
   }
   ```

2. **Collective CSML** — `computeCsml()` extended to agent cohorts. If the
   swarm CSML exceeds θ_swarm (tighter than individual θ), the entire swarm
   tier escalates.

3. **Byzantine-resilient coordination** — some swarm members may be compromised.
   SINT needs a threshold signature scheme: actions require k-of-N agents to
   present valid tokens (extends existing M-of-N quorum model to distributed agents).

**Target standard**: NATO STANAG 4586 (UAS control), MIL-STD-1553B (bus security)

---

## Problem 2: Sub-Human-Reaction-Time Safety (2026–2028)

**The threat**: Physical AI operates at 1 kHz (ROS 2 control loops). Human
approval (T2_ACT) has 200–500 ms latency. A robot can execute 200–500 control
cycles while waiting for human approval — during which the physical state is
undefined.

**The "pre-approved corridor" problem**: Today, operators pre-approve trajectories.
But the robot's real-time sensor state diverges from the planned state. At what
divergence threshold should the pre-approved plan be invalidated?

**Research directions**:

1. **Probabilistic constraint envelopes** — replace binary constraint checks with
   Gaussian confidence bounds. A velocity of `0.5 ± 0.1 m/s` is allowed;
   `0.5 ± 0.5 m/s` escalates.
   ```typescript
   interface StochasticConstraint {
     nominalValue: number;
     stdDev: number;
     confidenceLevel: 0.95 | 0.99 | 0.999; // P(safe)
   }
   ```

2. **Incremental approval** — instead of approving actions, approve *corridors*.
   The PolicyGateway approves a 10-second trajectory envelope. Actions within
   the envelope auto-allow. Deviations require real-time escalation.

3. **Hardware interrupt escalation** — bypass software stack for emergency tier
   promotion. `safety.force.exceeded` triggers a hardware interrupt that sets
   a capability token flag before any software can react.

**Target standard**: ISO 26262 (functional safety for automotive — ASIL D equiv)

---

## Problem 3: LLM Behavioral Drift Under Distribution Shift (2026–2029)

**The finding** (ROSClaw, arXiv:2603.26997): 3.4× behavioral divergence between
frontier LLMs on identical robotic tasks. A robot authorized for GPT-4 behavior
operates differently when the foundation model is updated or swapped.

**The current SINT solution**: `foundation_model_id` field in `SintLedgerEvent`,
`computeCsmlPerModel()` for per-model CSML tracking.

**The open problem**: CSML detects *historical* divergence. It cannot predict
future divergence or catch a newly deployed model before it causes harm.

**Research directions**:

1. **Model fingerprint tokens** — capability tokens bound to a specific model
   hash, not just an agent ID. Token invalidated when model updated.
   ```typescript
   interface ModelBoundToken extends SintCapabilityToken {
     modelConstraints: {
       allowedModelIds: string[];           // ["gpt-4o-2024-11-20"]
       maxModelVersion?: string;            // semver ceiling
       modelFingerprintHash?: string;       // SHA-256 of model weights/config
     };
   }
   ```

2. **Behavioral baseline tokens** — issue a token that encodes expected behavior
   distribution (action frequency histogram, velocity distribution, force profile).
   CSML compares live behavior against baseline; divergence triggers escalation.

3. **Cross-model quorum for T3** — irreversible actions require sign-off from
   k ≥ 2 distinct foundation models. If GPT-5 and Claude 5 both recommend the
   action, confidence is higher than any single model.

**Target publication**: Nature Machine Intelligence, ICML 2027

---

## Problem 4: IoT + Edge Mesh Authorization (2027–2029)

**The scenario**: A factory has 10,000 IoT sensors, 500 robots, and 50 AI
agents. The SINT gateway is a bottleneck. Every sensor read going through
PolicyGateway is unrealistic.

**The challenge**: Edge authorization — how do you push SINT's security model
down to devices that have 64 KB of RAM?

**Research directions**:

1. **Lightweight capability tokens** — strip Ed25519 to the minimum viable
   representation for embedded systems. A SINT-nano token: 32 bytes subject +
   32 bytes issuer + 8 bytes expiry + 4 bytes resource hash + 64 bytes sig = 140 bytes.

2. **Offline token verification** — edge devices verify tokens locally using
   cached public keys. No network round-trip for T0/T1. Only T2/T3 require
   gateway contact.

3. **Hierarchical trust domains** — factory floor has a local SINT proxy that
   handles T0/T1 autonomously. Only T2+ propagate to the central gateway.
   The evidence ledger is replicated asynchronously.

4. **MQTT/CoAP bridge** (`bridge-mqtt`) — bridge SINT into the IoT protocol stack.
   MQTT topic = SINT resource URI. QoS level = approval tier.
   ```
   mqtt://factory.example.com/robot/01/cmd_vel → mavlink://1/cmd_vel mapping
   CoAP PUT /sensor/temperature → T0_OBSERVE (auto-allow, no gateway)
   CoAP PUT /actuator/valve → T2_ACT (requires gateway check)
   ```

**Target standard**: IEC 62443-3-3 (System security requirements), NIST SP 800-82 (ICS security)

---

## Problem 5: Physical Security Side Channels (2027–2030)

**The threat**: An attacker who cannot compromise the cryptographic layer can
still observe the *pattern* of SINT gate decisions — which commands are approved
at what tier — to infer the robot's mission, route, and physical state. This is
the physical analog of traffic analysis.

**Research directions**:

1. **Decision traffic normalization** — pad T0/T1 decisions to uniform timing
   (adds artificial latency to prevent timing side channels).

2. **Differential privacy for ledger analytics** — CSML computations run on
   the evidence ledger. Publishing aggregate CSML scores must not leak individual
   trajectory data. Apply DP noise to public metrics.

3. **Sealed evidence ledger** — for T3 events, the event payload is encrypted
   under a TEE-sealed key. Only the operator's HSM can decrypt post-hoc.
   The hash chain remains public for integrity; content is private.

---

## Problem 6: Autonomous Economic Coordination (2028–2031)

**The scenario**: Drone fleets bid on delivery tasks in real-time auctions. A
robot accepts a task, performs it, and expects payment — all autonomously, without
human intermediation. The economic layer must be as secure as the physical layer.

**Current SINT solution**: SLA bond slashing (`sla.bond.slashed`), token
economy via bridge-economy (BalanceService, BudgetService).

**The open problem**: Cryptographic commitments for robot-to-robot economic
contracts. A drone commits to a delivery; if it fails, its Solana stake is
slashed. But the commit/reveal cycle must not block the flight.

**Research directions**:

1. **Zero-knowledge delivery proofs** — drone proves it reached waypoint W at
   time T without revealing its full trajectory (privacy-preserving delivery
   verification). ZK-SNARK over GPS + barometer + timestamp.

2. **Capability token as economic instrument** — tokens carry a stake amount.
   If the token holder causes a safety violation, the stake is slashed on-chain.
   The token IS the bond.

3. **Multi-party computation for fleet bidding** — N drones bid on a task
   without revealing their individual capabilities to competitors. MPC produces
   a winning assignment; each drone receives an attenuated token for their
   specific subtask.

---

## The 5-Year Roadmap

```
2026 Q1: Avatar Layer + CSML auto-escalation (✅ shipped)
         MAVLink bridge (✅ shipped)
         APS↔SINT interop mapping (✅ shipped)

2026 Q2: Swarm token + collective CSML (SwarmCoordinator package)
         MQTT/CoAP bridge for IoT edge (bridge-iot)
         ISO 10218 body-force model

2026 Q3: Model fingerprint tokens (ModelBoundToken)
         Byzantine-resilient k-of-N swarm quorum
         IROS 2026 submission deadline (August)

2026 Q4: Probabilistic constraint envelopes (StochasticConstraint)
         IEEE RA-L submission (CSML empirical validation)

2027 Q1: Lightweight SINT-nano tokens (embedded 140-byte format)
         Offline T0/T1 verification (edge mode)
         OPC-UA bridge (IEC 62541)

2027 Q2: Hardware Security Module integration (PKCS#11)
         Hierarchical trust domain proxies
         Cross-model quorum for T3

2028+:   Zero-knowledge delivery proofs
         Differential privacy for ledger analytics
         Autonomous economic coordination (robot Solana staking)
```

---

## Key Open Questions

1. **Is there a formal proof of the DFA invariants I-G1/I-G2/I-G3?**
   Target: TLA+ or Coq proof by IROS 2026.

2. **What is the minimum viable CSML window for real-time escalation?**
   Hypothesis: 50 events is sufficient; 200 is stable. Needs empirical validation.

3. **Can APS attestation grade be used as a prior for CSML θ?**
   Grade 0 agents → θ=0.10 (untrusted). Grade 3 → θ=0.40 (legal entity).

4. **What is the attack surface of a MAVLink-SINT deployment?**
   Known: token replay (mitigated by timeWindow), command injection (mitigated
   by physical constraint check). Unknown: timing attacks on the intercept path.

5. **How does CSML behave under adversarial prompt injection (arXiv:2601.17549)?**
   Hypothesis: prompt injection increases AR (denied/total) and decreases CR
   (completed/started). CSML should detect injection campaigns as CSML > θ
   within 20–30 events.

---

*SINT Protocol — exploring the open execution-governance layer for physical AI.*
*For the current public project story and implementation entry points, see the README and docs site.*

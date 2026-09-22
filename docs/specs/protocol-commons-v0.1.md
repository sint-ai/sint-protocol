# Protocol Commons — Product Specification v0.1

*A coordination interface for emergent multi-project protocol negotiation*

**Author:** Illia Pashkov (pshkv)
**Date:** 2026-04-11
**Status:** Draft

---

## I. The Problem

What's happening across google/A2A #1713, #1716, aeoess/agent-passport-system#13, and 15+ adjacent threads is a new kind of software development: independent projects discovering architectural convergence in public, then negotiating shared primitives through executable artifacts rather than committees.

GitHub Issues are the wrong primitive for this. They're designed for bug reports, not for multi-party protocol negotiation where:

- **7+ independent projects** arrive at Ed25519 + DID + scoped delegation from different starting points
- **Cross-verification** (executable tests proving compatibility) replaces design documents
- **Vocabulary convergence** happens through YAML crosswalks, not RFC prose
- **Trust is established through artifacts** — shipping code, publishing test fixtures, running live endpoints — not through authority or reputation
- **Response latencies range from 1 minute to 5 days** depending on whether the interaction is synchronous co-authoring or async review
- **AI agents are active participants** alongside human builders

Protocol Commons wraps this pattern into a repeatable, legible, and governable process.

---

## II. Evidence Base

All data points below are drawn from observed collaboration across these threads:

| Thread | Messages | Participants | Duration |
|--------|----------|-------------|----------|
| google/A2A #1713 | 20 | 7 (kevin-biot, aeoess, pshkv, 64R3N, viftode4, kevinkaylie, aeoess) | Apr 4–10 |
| google/A2A #1716 | 28 | 7 (pshkv, 64R3N, aeoess, MoltyCel, ZhengShenghan, kevinkaylie) | Apr 5–11 |
| aeoess/agent-passport-system #13 | 32+ | 10+ (aeoess, 0xbrainkid, QueBallSharken, tomjwxf, MoltyCel, douglasborthwick-crypto, nanookclaw, schchit, rnwy) | Apr 10–11 |
| 15+ cross-repo issues by pshkv | — | — | Apr 4–11 |
| aeoess/agent-governance-vocabulary | — | 8+ contributors | Apr 10–11 |

Key metric: pshkv↔aeoess went from **first contact to 9/9 bidirectional cross-verification to production interop spec in 6 hours and 38 minutes**. No standards body, no working group, no RFC process. Just executable artifacts and public threads.

---

## III. Actor Taxonomy

### 3.1 Actor Classes

| Class | Behavior Pattern | Observed Examples |
|-------|-----------------|-------------------|
| **Bridge Actor** | Appears in 5+ threads, connects projects that don't know about each other, synthesizes across conversations | pshkv (18 threads), aeoess (7+ threads) |
| **System Builder** | Maintains a live system with API endpoints, contributes crosswalks mapping their system to shared vocabulary | MoltyCel (MolTrust), douglasborthwick-crypto (InsumerAPI), kevinkaylie (AgentNexus) |
| **Formal Verifier** | Contributes proofs, counterexamples, or formal models that stress-test proposed primitives | ZhengShenghan (TLA+ delegation amplification proof) |
| **Vocabulary Steward** | Maintains the naming layer, enforces contribution bar (artifact > description), prevents premature standardization | aeoess (agent-governance-vocabulary) |
| **Framework Contributor** | Adds structured dimensions or categories that organize existing terms | QueBallSharken (6 descriptor dimensions), nanookclaw (decision trajectory) |
| **Receipt/Evidence Builder** | Builds the signed-artifact infrastructure that makes trust portable | tomjwxf (VeritasActa/ScopeBlind), 0xbrainkid (SATP) |
| **Thread Originator** | Opens the negotiation space with a concrete problem statement | kevin-biot (OBO cold-start trust) |

### 3.2 Actor Relationship Graph

```
kevin-biot ──opens──→ A2A#1713 ──attracts──→ aeoess, pshkv
                                               │         │
pshkv ──cross-verifies──→ aeoess (9/9 tests)  │         │
aeoess ──cross-verifies──→ pshkv (9/9 tests)  │         │
                                               ↓         ↓
pshkv ──opens──→ A2A#1716 ──attracts──→ MoltyCel, 64R3N, ZhengShenghan, kevinkaylie
                                               │
MoltyCel ──offers-endpoint──→ pshkv, aeoess   │
64R3N ──proposes-history-layer──→ all          │
ZhengShenghan ──proves-vulnerability──→ all    │
kevinkaylie ──maps-enclave-model──→ all        │
                                               ↓
aeoess ──opens──→ governance-vocabulary ──attracts──→ douglasborthwick, tomjwxf,
                                                      QueBallSharken, nanookclaw,
                                                      0xbrainkid, rnwy, schchit
```

### 3.3 Trust Signals (how actors establish credibility)

| Signal | Weight | Example |
|--------|--------|---------|
| **Cross-verification pass** | 1.0 | pshkv↔aeoess: 9/9 tests, zero code changes, independent convergence |
| **Formal proof** | 0.9 | ZhengShenghan: TLA+ 5-state counterexample for delegation amplification |
| **Live endpoint** | 0.8 | MoltyCel: `api.moltrust.ch/capability/verify`, free tier 1000 agents |
| **Crosswalk PR** | 0.7 | douglasborthwick-crypto: insumerapi.yaml with JWKS endpoint |
| **Fixture contribution** | 0.6 | pshkv: `agentskill-delegated-authority.v1.json` with 4 interop cases |
| **Naming correction** | 0.5 | douglasborthwick: `behavioral_fingerprint` → `behavioral_trust` |
| **Synthesis comment** | 0.4 | aeoess: "3 properties for first-contact trust" |
| **Code commit** | 0.3 | Implementation, but single-project |
| **Thread appearance** | 0.1 | Participation signal only |

---

## IV. Interaction Flow Definitions

### Flow 1: Convergent Architecture Discovery

**Trigger:** Two independent systems discover they use the same cryptographic primitives.

```
Phase 1: RECOGNITION (minutes)
  Actor A posts system description in shared thread
  Actor B recognizes structural similarity
  Both identify specific shared primitives (Ed25519, DID, scoped delegation)

Phase 2: CROSS-VERIFICATION (minutes to hours)
  Actor A writes executable tests against Actor B's published spec
  Tests pass without code changes → strongest convergence signal
  Actor B reciprocates with their own test suite
  Both publish commit hashes as evidence

Phase 3: MAPPING (hours)
  One actor ships formal constraint mapping (function signatures)
  apsScopeToSintMapping(), sintTokenToApsProjection()
  Test count published as progress metric

Phase 4: SPECIFICATION (days)
  Joint fixture pack defining canonical test vectors
  Schema published for non-TS runtimes (JSON, YAML)
  Version-pinned interop contract
```

**Policy rules:**
- Cross-verification claims MUST include commit hash and test file path
- Reciprocal verification (both directions) required before "interoperable" label
- Fixture packs MUST include at least: allow, scope-mismatch deny, revoked deny, missing-attestation deny

### Flow 2: Vocabulary Negotiation

**Trigger:** Multiple projects use similar-sounding terms with different semantics.

```
Phase 1: INVENTORY
  Steward collects terms from 5+ live systems
  Each term documented with: field-level schema, signed payload shape, issuer

Phase 2: DISAMBIGUATION
  Match semantics applied: exact | structural | partial | non_equivalent_similar_label | no_mapping
  Naming corrections surface (e.g., behavioral_fingerprint ≠ behavioral_trust)
  Out-of-scope terms explicitly excluded with reasoning

Phase 3: DIMENSION ANNOTATION
  Each canonical term gets 6 descriptor dimensions:
    enforcement_class, validity_temporal, refusal_authority,
    invariant_survival, replay_class, governed_action_class

Phase 4: CROSSWALK CONTRIBUTION
  Each system submits a YAML crosswalk with field-level mappings
  Contribution bar: working artifact with verifiable endpoints, not prose descriptions
  PR review by at least 2 other system maintainers
```

**Policy rules:**
- Renaming live signed envelope `type` values is FORBIDDEN (breaks JWKS-verified payloads)
- `no_mapping` is a valid and expected outcome — not every system needs every term
- Dual-home candidates (terms spanning two categories) require explicit justification
- Contribution must include `kid` (key ID) and signed field enumeration

### Flow 3: Vulnerability Discovery & Patch

**Trigger:** Formal verifier finds a flaw in a proposed primitive.

```
Phase 1: PROOF
  Formal model (TLA+, Alloy, etc.) discovers counterexample
  Published with state trace and minimal reproduction

Phase 2: CROSS-PROJECT TRIAGE
  Each affected project checks if their implementation is vulnerable
  Result posted: "APS monotonic narrowing prevents this" or
                 "SINT delegation_depth_floor blocks at depth 3"

Phase 3: HARDENING
  Projects that lack protection implement the fix
  Fixture added to shared test vectors
  Delegation depth becomes first-class token field across all systems
```

**Policy rules:**
- Counterexamples with state traces get priority response (< 24 hours)
- Fix MUST be demonstrated with executable test, not just code change
- Shared fixture pack updated within 48 hours of confirmed vulnerability

### Flow 4: Endpoint Integration

**Trigger:** System builder offers a live API for cross-project testing.

```
Phase 1: ENDPOINT ANNOUNCEMENT
  Builder publishes: base URL, auth model (API key / open / DID-auth), rate limits
  Example: MolTrust POST /identity/resolve, GET /skill/trust-score/{did}

Phase 2: INTEGRATION PROPOSAL
  Consumer proposes: weight/role of external signal in their system
  Example: "0.3 import weight for external trust scores"

Phase 3: FIXTURE EXCHANGE
  Both parties agree on canonical test DID
  Example: did:moltrust:d34ed796a4dc4698
  Cross-verification results published

Phase 4: PRODUCTION BINDING
  Consumer implements call in their SDK with version pin
  Fail-open semantics on timeout (external service down ≠ deny)
```

### Flow 5: Thread Synthesis

**Trigger:** Discussion reaches 15+ messages with 4+ participants.

```
Phase 1: SYNTHESIS COMMENT
  Bridge actor crystallizes thread into 3-5 actionable properties
  Example: "3 properties for first-contact trust: self-certifying identity,
           attestation provenance, evidence composability"

Phase 2: STACK IDENTIFICATION
  Layered architecture emerges from synthesis:
    L0: Constitutional (what agents are allowed to want)
    L1: Identity (self-certifying DIDs)
    L2: Trust (behavioral attestation, history)
    L3: Authorization (capability tokens, tier enforcement)
    L4: Constraint (physical limits, CL-1.0 envelopes)
    L5: Evidence (hash-chained ledgers, signed receipts)
    L6: Vocabulary (canonical naming, crosswalks)

Phase 3: NEXT THREAD SPAWN
  Unresolved questions become new issues
  Cross-referenced to parent thread
```

---

## V. Data Model

```typescript
interface ProtocolThread {
  id: string;                          // github:{owner}/{repo}/issues/{number}
  participants: ThreadParticipant[];
  signals: Signal[];                   // trust-building events
  crossRefs: CrossReference[];         // links to other threads
  convergenceScore: number;            // 0-1, computed from signals
  stackLayers: StackLayer[];           // which layers this thread negotiates
  status: "discovery" | "verification" | "specification" | "adopted" | "stale";
}

interface ThreadParticipant {
  actor: ActorId;                      // github username
  role: ActorClass;
  firstAppearance: ISO8601;
  messageCount: number;
  signalTypes: SignalType[];           // what trust signals they've contributed
  projects: ProjectRef[];              // what systems they maintain
  responseLatency: {
    p50_minutes: number;
    p99_minutes: number;
  };
}

interface Signal {
  type: "cross_verification" | "live_endpoint" | "crosswalk_pr" |
        "formal_proof" | "fixture_contribution" | "naming_correction" |
        "synthesis_comment" | "code_commit";
  actor: ActorId;
  timestamp: ISO8601;
  evidence: {
    commitHash?: string;
    testCount?: number;
    endpointUrl?: string;
    fixtureFilePath?: string;
    proofStateCount?: number;
  };
  weight: number;                      // 0-1 trust signal strength
}

interface CrossReference {
  sourceThread: ThreadId;
  targetThread: ThreadId;
  type: "cites" | "extends" | "refutes" | "implements" | "cross_verifies";
  actor: ActorId;
  timestamp: ISO8601;
}

interface VocabularyTerm {
  canonical_name: string;
  definition: string;
  signal_type: string;
  descriptor_dimensions: {
    enforcement_class: "advisory" | "binding" | "refusal_authority";
    validity_temporal: "at_issuance" | "at_acceptance" | "at_processing" |
                       "continuously" | "sequence" | "windowed";
    refusal_authority: "issuer" | "verifier" | "consumer_policy" | "shared";
    invariant_survival: "pre_action" | "during_action" | "post_action" | "permanent";
    replay_class: "full_replay" | "decision_replay" | "fingerprint_only" | "no_replay";
    governed_action_class: "read" | "write" | "transfer" | "delegate" | "publish" | "compose";
  };
  crosswalks: Map<SystemId, CrosswalkMapping>;
  issuers: IssuerRef[];
}

interface CrosswalkMapping {
  match: "exact" | "structural" | "partial" | "non_equivalent_similar_label" | "no_mapping";
  source_field: string;
  target_field: string;
  divergence_notes?: string;           // required when match is "partial"
}

type StackLayer =
  | "L0_constitutional"
  | "L1_identity"
  | "L2_trust"
  | "L3_authorization"
  | "L4_constraint"
  | "L5_evidence"
  | "L6_vocabulary";

type ActorClass =
  | "bridge"
  | "builder"
  | "verifier"
  | "steward"
  | "framework_contributor"
  | "receipt_builder"
  | "thread_originator";
```

---

## VI. System Architecture

```
┌─────────────────────────────────────────────────────┐
│                  PROTOCOL COMMONS                    │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐   │
│  │  THREAD   │───>│  SIGNAL  │<───│    ACTOR     │   │
│  │  GRAPH    │    │  STREAM  │    │    GRAPH     │   │
│  └─────┬────┘    └────┬─────┘    └──────┬───────┘   │
│        │              │                  │           │
│        v              v                  v           │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐   │
│  │ STACK    │    │VOCABULARY│    │ CONVERGENCE  │   │
│  │ LAYER    │<──>│  REGISTRY│<──>│   TRACKER    │   │
│  │ MAP      │    │          │    │              │   │
│  └──────────┘    └──────────┘    └──────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │           CROSSWALK ENGINE                    │   │
│  │  Validates YAML crosswalks, runs match        │   │
│  │  semantics, detects naming conflicts          │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │         FIXTURE EXCHANGE                      │   │
│  │  Shared test vectors, schema validation,      │   │
│  │  cross-project CI verification                │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## VII. Policy Rules

### 7.1 Contribution Policies

| Policy | Rule | Enforcement |
|--------|------|-------------|
| **Artifact Bar** | Contributions must be executable artifacts (tests, YAML, endpoints), not prose proposals | Crosswalk PRs without field-level mappings auto-rejected |
| **Naming Immutability** | Live signed envelope `type` values cannot be renamed | Vocabulary steward has veto on rename PRs |
| **Reciprocal Verification** | "Interoperable" label requires bidirectional cross-verification with commit hashes | Convergence score capped at 0.5 without reciprocal tests |
| **Explicit Non-Equivalence** | Similar-sounding terms must be mapped as `non_equivalent_similar_label` if semantics differ | Crosswalk engine flags lexical similarity without semantic mapping |
| **Fail-Open on External** | External service integration must fail-open on timeout | CI fixture tests include timeout simulation |
| **Tighten-Only Delegation** | Cross-project credential propagation can only narrow scope | Formal model (TLA+) run against proposed delegation chains |

### 7.2 Escalation Policies

| Trigger | Escalation Path |
|---------|----------------|
| Naming conflict (two systems claim same canonical term) | Vocabulary steward mediates → descriptor dimensions decide → if unresolvable, both terms coexist with `non_equivalent_similar_label` |
| Formal vulnerability discovered | 24-hour response window → cross-project triage → fixture update within 48h |
| Live endpoint goes down | Fail-open semantics activate → status page updated → thread notification |
| Actor goes inactive (>14 days no signal) | Role downgraded from active to observer → crosswalk ownership transfers |
| Crosswalk PR has 0 field-level mappings | Auto-rejected with template for required artifact format |

### 7.3 Convergence Scoring

```
convergence_score(thread) =
  sum(signal.weight * signal.recency_decay) / max_possible_score

signal_weights:
  cross_verification:  1.0    (highest — executable proof of compatibility)
  formal_proof:        0.9    (proves or disproves properties)
  live_endpoint:       0.8    (running code > specification)
  crosswalk_pr:        0.7    (structured artifact with field mappings)
  fixture_contribution: 0.6   (shared test vectors)
  naming_correction:   0.5    (improves precision of shared vocabulary)
  synthesis_comment:   0.4    (crystallizes understanding)
  code_commit:         0.3    (implementation, but single-project)
  thread_appearance:   0.1    (participation signal only)

recency_decay = exp(-days_since_signal / 30)

actor_credibility(actor) =
  unique_threads * 0.3 +
  cross_verification_count * 0.3 +
  live_endpoints * 0.2 +
  formal_proofs * 0.2
```

---

## VIII. Interface Views

### 8.1 Thread Graph View (Primary)

Force-directed graph: threads as nodes, cross-references as edges, colored by stack layer.

```
         +- A2A#1713 ---------------+
         |  L1:Identity              |
         |  L3:Authorization         |------cross-verifies-----> APS#1
         |  Score: 0.92              |                           Score: 0.85
         |  8 actors, 20 msgs       |
         +----------+---------------+
                    |extends
                    v
         +- A2A#1716 ---------------+
         |  L3:Authorization         |------implements---------> sint-protocol#111
         |  L2:Trust                 |
         |  Score: 0.88              |------cross-verifies-----> MolTrust API
         |  7 actors, 28 msgs       |
         +----------+---------------+
                    |spawns
                    v
         +- APS#13 -----------------+
         |  L6:Vocabulary            |------cites-------> insumer#1, verify#1
         |  Score: 0.78              |
         |  10+ actors, 32 msgs     |
         +---------------------------+
```

Each node expands to: participant list with roles, signal timeline, convergence score history.

### 8.2 Actor Constellation

Radial layout: actors as nodes sized by credibility score, connected by co-participation.

### 8.3 Vocabulary Explorer

Interactive term browser with crosswalk visualization. Each term shows:
- Definition and 6 descriptor dimensions
- Crosswalk table (system, match type, field mapping, divergence notes)
- Naming history (corrections, out-of-scope decisions)
- Issuer list with `kid` and JWKS endpoints

### 8.4 Convergence Timeline

Horizontal timeline showing how independent projects converge:

```
Apr 4                Apr 5              Apr 7              Apr 10
  |                    |                  |                   |
  +- pshkv posts SINT  |                  |                   |
  +- aeoess maps APS   |                  |                   |
  +- 9/9 cross-verify <-- CONVERGENCE     |                   |
  +- reciprocal 9/9   <-- CONFIRMED       |                   |
  +- mapping shipped   |                  |                   |
  |                    +- 64R3N: history   |                   |
  |                    +- MoltyCel joins   |                   |
  |                    +- ZhengShenghan    |                   |
  |                    |   TLA+ proof     |                   |
  |                    |                  +- fixture pack      |
  |                    |                  +- MolTrust tests    |
  |                    |                  |                   +- vocab v0.1
  |                    |                  |                   +- 10 terms
  |                    |                  |                   +- 4 crosswalks
```

### 8.5 Stack Layer Map

Coverage dashboard showing which layers are addressed, by whom, and where gaps remain:

```
L6: VOCABULARY     ████████████░░░░  75%  aeoess (vocab repo, 10 terms, 4 crosswalks)
L5: EVIDENCE       ████████████████  95%  SINT (ledger), APS (receipts), VeritasActa, JEP
L4: CONSTRAINT     ████████████░░░░  70%  SINT (CL-1.0), APS (aggregate), MolTrust (matrix)
L3: AUTHORIZATION  ████████████████  90%  SINT (gateway), APS (delegation), AgentNexus (Enclave)
L2: TRUST          ██████████░░░░░░  60%  MolTrust, RNWY, WTRMRK, SATP
L1: IDENTITY       ████████████████  95%  did:key (shared), did:agentnexus, did:moltrust
L0: CONSTITUTIONAL ████░░░░░░░░░░░░  25%  APS (fidelity probe), PDR (decision trajectory)
```

### 8.6 Fixture Exchange Matrix

Red/green matrix showing which projects pass which shared test fixtures:

```
                 SINT  APS   MolTrust  AgentNexus
allow             Y     Y      Y          Y
scope-mismatch    Y     Y      Y          -
revoked-token     Y     Y      -          Y
missing-attest    Y     Y      Y          -
delegation-amp    Y     Y      -          -
estop-override    Y     -      -          -
```

---

## IX. Product Features

### 9.1 Cross-Verification Dashboard

When any project publishes a cross-verification test suite, Protocol Commons:
1. Detects the commit via webhook
2. Runs the reciprocal test suite (if published)
3. Updates convergence score
4. Notifies both actors
5. Generates interoperability badge: `SINT <-> APS: 9/9`

### 9.2 Vocabulary Conflict Detector

Monitors all crosswalk PRs for:
- Two systems claiming same canonical term with different semantics
- Field name collisions across signed payloads
- Descriptor dimension mismatches indicating deeper semantic gaps

### 9.3 Fixture Exchange Protocol

Shared fixture registry where:
- Any project publishes canonical test vectors (JSON with schema)
- Other projects subscribe and run them in CI
- Results published back to Protocol Commons
- Red/green matrix shows cross-project compatibility

### 9.4 Thread Synthesis Bot

At synthesis threshold (15+ messages, 4+ participants, 3+ signal types):
1. Generates structured summary (participants, signals, cross-refs, stack layers)
2. Identifies unresolved questions
3. Proposes next-thread topics
4. Updates stack layer map

### 9.5 Actor Reputation (Artifact-Based)

Credibility computed from artifacts, never from self-declaration:
- Cross-verification suites: +0.3 per reciprocal pair
- Live endpoints: +0.2 per verified endpoint
- Crosswalk PRs merged: +0.15 per PR
- Formal proofs: +0.2 per proof
- Naming corrections: +0.1 per correction
- Decay: -0.05 per 14 days of inactivity

No tokens. No staking. No governance votes. Credibility is earned through artifacts.

### 9.6 SINT Crosswalk Auto-Generator

Auto-generates draft `crosswalk/sint.yaml` from SINT type definitions:

```yaml
system: sint-protocol
version: "0.1.0"
mappings:
  behavioral_trust:
    match: no_mapping
    note: "SINT enforces physical constraints, not behavioral scoring"

  trust_verification:
    match: structural
    source_field: "SintCapabilityToken.delegationChain"
    target_field: "trust_verification.grade"
    divergence: "SINT tokens scoped to (subject, resource, action) triples"

  security_posture:
    match: partial
    source_field: "ConstraintEnvelope.attestation"
    target_field: "security_posture"
    divergence: "SINT attestation is per-token, not per-wallet"

  settlement_witness:
    match: structural
    source_field: "LedgerEvent"
    target_field: "settlement_witness"
    divergence: "SINT ledger events hash-chained (SHA-256), not individually signed"
```

---

## X. Implementation Priority

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| P0 | Thread graph view + cross-reference tracking | 2 weeks | Makes the ecosystem legible |
| P0 | Vocabulary explorer with crosswalk visualization | 2 weeks | The canonical reference |
| P1 | Actor constellation + credibility scoring | 1 week | Trust signal aggregation |
| P1 | Fixture exchange registry + CI integration | 2 weeks | Executable interop proof |
| P2 | Cross-verification dashboard with badges | 1 week | Viral adoption signal |
| P2 | Convergence timeline | 1 week | Narrative for outsiders |
| P3 | Thread synthesis bot | 2 weeks | Reduces Bridge Actor burden |
| P3 | Stack layer gap analysis | 1 week | Guides ecosystem investment |

---

## XI. What Makes This Different

This is not a developer portal, package registry, or standards body. It's the first interface designed for **convergent architecture discovery** — the process where independent projects realize they've built the same thing from different starting points, and need to negotiate shared primitives without a committee, without authority, and without slowing down.

The key insight: executable artifacts (test suites, live endpoints, formal proofs) are stronger trust signals than any governance process. Protocol Commons makes this legible, scoreable, and repeatable.

---

## Appendix A: Current Ecosystem Participants

| Handle | System | Stack Layers | Actor Class |
|--------|--------|-------------|-------------|
| pshkv | SINT Protocol | L3, L4, L5 | Bridge |
| aeoess | APS + governance-vocabulary | L1, L3, L6 | Bridge + Steward |
| MoltyCel | MolTrust | L1, L2 | Builder |
| kevinkaylie | AgentNexus/Enclave | L1, L3 | Builder |
| 64R3N | WTRMRK | L1, L2 | Builder |
| ZhengShenghan | TLA+ verification | — | Verifier |
| kevin-biot | OBO Protocol | L3 | Originator |
| douglasborthwick-crypto | InsumerAPI | L2 | Builder |
| tomjwxf | VeritasActa | L5 | Receipt Builder |
| QueBallSharken | Descriptor dimensions | L6 | Framework Contributor |
| nanookclaw | PDR / decision trajectory | L0, L6 | Framework Contributor |
| schchit | JEP | L5 | Receipt Builder |
| 0xbrainkid | SATP | L2 | Builder |
| rnwy | RNWY | L2 | Builder |
| viftode4 | Dual-signature economy | L5 | Builder |

## Appendix B: Vocabulary v0.1 Signal Types

10 canonical terms: `wallet_state`, `behavioral_trust`, `wallet_intelligence`, `reasoning_integrity`, `compliance_risk`, `passport_grade`, `trust_verification`, `security_posture`, `job_performance`, `settlement_witness`.

6 descriptor dimensions per term: `enforcement_class`, `validity_temporal`, `refusal_authority`, `invariant_survival`, `replay_class`, `governed_action_class`.

5 crosswalk match types: `exact`, `structural`, `partial`, `non_equivalent_similar_label`, `no_mapping`.

4 crosswalk files shipped: InsumerAPI, VeritasActa, SATP, RFC category taxonomy.

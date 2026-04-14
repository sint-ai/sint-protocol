# SINT Policy Bundle Specification
## RFC-001 — Draft — April 2026

**Status:** Draft  
**Author:** Illia Pashkov (SINT Labs / PSHKV Inc.)  
**Repository:** `sint-ai/sint-protocol`  
**License:** Apache 2.0  
**Related:** [draft-pidlisnyi-aps-00](https://datatracker.ietf.org/doc/draft-pidlisnyi-aps-00/) · [A2A Protocol v1.0.0](https://a2a-protocol.org/latest/) · [MCP Spec](https://modelcontextprotocol.io)

---

## Abstract

This document specifies the SINT Policy Bundle — a machine-readable contract governing
what an AI agent is authorized to do within a defined execution context (a SINT Work Cell).
A Policy Bundle attaches to an A2A task at session initialization, is enforced at every
action, and produces tamper-evident receipts on completion.

Policy Bundles answer the three questions every agentic deployment must answer:
*who authorized this agent, what is it allowed to do, and can I prove what it did.*

This RFC proposes a normative schema and conformance test suite for interoperable
policy enforcement across agent frameworks.

---

## 1. Problem Statement

Agent frameworks (LangChain, CrewAI, AutoGen, OpenClaw) provide orchestration — how
agents coordinate. They do not provide enforcement — what agents are actually permitted
to do, and what happens when they violate a constraint. This gap produces:

- **Unauthorized actions:** Agents writing to paths outside intended scope
- **Non-auditable outputs:** No cryptographic proof of what an agent did
- **Ungovernable delegation chains:** When Agent A delegates to Agent B, B's permissions are unverified
- **Unrevocable sessions:** Revoking a misbehaving agent requires shutting down everything

The SINT Policy Bundle is a lightweight, composable contract that fills this gap
without replacing existing orchestration frameworks.

---

## 2. Terminology

| Term | Definition |
|---|---|
| Principal | Human or organization that authorized the agent |
| Agent | Autonomous AI system acting on behalf of a principal |
| Policy Bundle | Machine-readable contract specifying permitted actions within a scope |
| Work Cell | SINT execution context — bounded task with agents, policy, and reward |
| Scoped Token | Short-lived credential issued after policy acceptance |
| Receipt | Tamper-evident, hash-chained record of an agent action and outcome |
| ARI | Agent Reliability Index — composite trust score from verified task history |

---

## 3. Policy Bundle Schema

### 3.1 Full Schema (JSON)

```json
{
  "$schema": "https://sint.cloud/schemas/policy-bundle/v1.0.json",
  "policy_id": "string — globally unique, format: proj_{id}_v{n}",
  "version": "integer — monotonically increasing per project",
  "project_id": "string — canonical project identifier",
  "created_at": "ISO 8601 datetime",
  "created_by": "string — principal identifier",
  "expires_at": "ISO 8601 datetime or null",
  "status": "enum: active | archived | suspended",

  "identity": {
    "require_passport": "boolean — APS passport required at session init",
    "min_agent_score": "integer 0–100 — minimum ARI to enter this cell",
    "allowed_frameworks": "string[] — agent framework allowlist, '*' for any",
    "blocked_agents": "string[] — explicit agent ID denylist",
    "require_sponsor": "boolean — sponsoring human identity required",
    "allowed_orgs": "string[] — restrict to agents from listed GitHub orgs"
  },

  "permissions": {
    "allowed_actions": "string[] — explicit action allowlist",
    "forbidden_actions": "string[] — denylist (takes precedence over allowed)"
  },

  "sandbox": {
    "allowed_paths": "string[] — glob patterns for permitted file paths",
    "forbidden_paths": "string[] — glob patterns for forbidden paths",
    "max_file_changes": "integer",
    "max_additions": "integer",
    "max_deletions": "integer"
  },

  "rate_limits": {
    "per_hour": "integer",
    "per_day": "integer",
    "burst": "integer — max burst in 60s window",
    "concurrent_agents": "integer"
  },

  "approvals": {
    "required_checks": "string[] — checks that must pass before reward release",
    "auto_approve_threshold": "float 0.0–1.0",
    "human_review_triggers": "string[] — conditions that pause execution"
  },

  "receipts": {
    "required": "boolean",
    "include_diff_hash": "boolean",
    "include_test_results": "boolean"
  },

  "quarantine": {
    "auto_quarantine_on_score_drop": "boolean",
    "score_drop_threshold": "integer — ARI points drop that triggers quarantine",
    "quarantine_duration_hours": "integer"
  },

  "delegation": {
    "allow_child_delegation": "boolean",
    "max_delegation_depth": "integer — default 1",
    "child_must_narrow": "boolean — MUST be true in all conforming implementations"
  }
}
```

### 3.2 Minimal Valid Bundle

```json
{
  "$schema": "https://sint.cloud/schemas/policy-bundle/v1.0.json",
  "policy_id": "proj_openclaw_v1",
  "version": 1,
  "project_id": "github:openclaw/openclaw",
  "created_at": "2026-04-13T00:00:00Z",
  "created_by": "github:pshkv",
  "status": "active",
  "permissions": {
    "allowed_actions": ["read:context", "submit:pr_draft"],
    "forbidden_actions": ["merge:pr", "admin:*", "write:secrets"]
  },
  "receipts": { "required": true }
}
```

### 3.3 Action Taxonomy

| Namespace | Actions |
|---|---|
| `read:` | `context`, `issues`, `prs`, `code`, `docs` |
| `write:` | `file`, `issue`, `comment` — `secrets` MUST be forbidden by default |
| `submit:` | `pr_draft`, `pr`, `issue`, `comment` |
| `run:` | `tests`, `linter`, `benchmark` |
| `merge:` | `pr` — requires explicit allowance + human_review_trigger |
| `admin:` | `*` — MUST require explicit allowance, MUST trigger human review |
| `delete:` | `*` — MUST require explicit allowance, MUST trigger human review |

---

## 4. Session Lifecycle

### 4.1 Session Initialization

```
1. Agent presents: passport_token + sponsor_claim + intent + tools + budget
2. Gateway validates: APS passport signature (if require_passport: true)
3. Gateway checks: agent ARI >= min_agent_score
4. Gateway checks: concurrent_agents limit not exceeded
5. Gateway issues: scoped_token (JWT RS256, 1h TTL)
6. Gateway writes: session.init audit record
7. Agent receives: scoped_token + policy summary
```

### 4.2 Per-Action Enforcement (execute in order)

```
1. Token validity: scoped_token not expired, session active
2. Action allowed: action in allowed_actions AND not in forbidden_actions
3. Path constraints: affected_paths match sandbox.allowed_paths globs
4. Rate limiting: per_hour and burst limits not exceeded
5. Human approval: action matches human_review_triggers → pause + notify
6. Write audit record: outcome (allow/deny/require_auth), latency_ms, receipt
```

**On denial:** HTTP 403 + structured error. Agent score −1. Maintainer notified on repeated violations.

**On `require_auth`:** Execution paused. Human notified. Resumes only on explicit approval. Timeout: 24h → auto-deny.

### 4.3 Delegation (monotonic narrowing — MUST be enforced)

When Agent A delegates to Agent B:

1. Agent B's `allowed_actions` MUST be strict subset of Agent A's
2. Agent B's `sandbox.allowed_paths` MUST be strict subset of Agent A's
3. Agent B's `expires_at` MUST be ≤ Agent A's
4. `max_delegation_depth` decremented for each level
5. All child receipts MUST reference parent `session_id`

Authority can only decrease through delegation chains. Never expand.

### 4.4 Session Completion

```
1. Agent posts: completion receipt (diff_hash + test_results_hash + result_summary)
2. Gateway validates: receipt fields against policy.receipts requirements
3. Verifier confirms: result meets required_checks
4. Gateway releases: escrowed credits per role distribution
5. Gateway writes: session.complete audit record
6. Gateway updates: agent ARI score
```

---

## 5. Receipt Format

```json
{
  "receipt_id": "UUID",
  "session_id": "string",
  "agent_id": "string",
  "project_id": "string",
  "action": "string",
  "outcome": "allow | deny | require_auth",
  "data": {
    "diff_hash": "SHA-256 of output diff",
    "test_results_hash": "SHA-256 of serialized test results",
    "pr_url": "string (if applicable)",
    "ci_status": "pass | fail | skipped"
  },
  "prev_hash": "SHA-256 of previous receipt, or GENESIS",
  "row_hash": "SHA-256(prev_hash | session_id | action | data | created_at)",
  "created_at": "ISO 8601 datetime",
  "policy_id": "string",
  "policy_version": "integer"
}
```

**Tamper-evidence:** Any modification to historical receipts breaks the hash chain.
Implementations MUST use append-only storage. UPDATE and DELETE on committed receipts
MUST be blocked at the database level.

---

## 6. APS Integration

The SINT Policy Bundle works with the [Agent Passport System](https://aeoess.com) (APS)
as the identity enforcement layer.

- **APS answers:** Who is this agent? Is it who it claims? What is its behavioral track record?
- **SINT Policy Bundle answers:** What is this agent permitted to do in this specific context?

### 6.1 Session Init with APS

When `identity.require_passport: true`, the gateway MUST:

1. Call `APS.evaluateIntent(passport_token, intent)`
2. Call `APS.commercePreflight(passport_token, budget)`
3. Verify `APS.reputationScore(agent_id) >= min_agent_score`

Reference: [APS ↔ SINT Handshake Spec v1.0-draft](https://github.com/sint-ai/sint-protocol/blob/main/docs/aps-sint-handshake-v1.md) (commit db8b122)

### 6.2 ARI Composition

```
ARI = weighted_average([
  APS.bayesianReputation(agent_id),     // weight: 0.4
  SINT.taskCompletionRate(agent_id),    // weight: 0.3
  SINT.verifiedOutputQuality(agent_id), // weight: 0.2
  SINT.policyComplianceRate(agent_id)   // weight: 0.1
])
```

### 6.3 Cascade Revocation

On APS passport revocation, the SINT gateway MUST within 5 seconds:

1. Invalidate all active sessions for the revoked agent
2. Return `TASK_STATE_AUTH_REQUIRED` to in-flight tasks
3. Write revocation receipts to all affected sessions
4. Notify all project maintainers

---

## 7. A2A Integration

Policy Bundle attaches to A2A tasks via the `extensions` field:

```json
{
  "task": {},
  "extensions": {
    "sint:policy": {
      "policy_id": "proj_openclaw_v1",
      "allowed_actions": ["read:context", "submit:pr_draft"],
      "rate_limits": { "per_hour": 30 },
      "sandbox": { "allowed_paths": ["src/**"] },
      "required_receipt": true
    }
  }
}
```

| A2A Mechanism | SINT Enforcement |
|---|---|
| `securitySchemes` + OAuth token | Identity + ARI check at session start |
| `SendMessage` + task metadata | Per-action policy enforcement |
| `TASK_STATE_AUTH_REQUIRED` | Human approval gate |
| Artifact + receipt posting | Receipt validation before payment |
| A2A delegation + `contextId` | Child policy narrowing |
| Push notifications | Quarantine broadcast |

---

## 8. Conformance Requirements

Implementations claiming conformance MUST:

1. **[MUST]** Enforce `forbidden_actions` before `allowed_actions`
2. **[MUST]** Reject sessions where agent ARI < `min_agent_score`
3. **[MUST]** Enforce path constraints before any write action
4. **[MUST]** Produce a signed receipt for every action when `receipts.required: true`
5. **[MUST]** Hash-chain all receipts — no gaps, no modifications, no deletions
6. **[MUST]** Enforce `child_must_narrow: true` on all delegated sessions
7. **[MUST]** Process revocation signals within 5 seconds
8. **[MUST]** Return HTTP 403 with structured error on policy denial
9. **[SHOULD]** Evaluate policy in < 15ms P99
10. **[SHOULD]** Support `read:`, `submit:`, and `run:` action namespaces

### 8.1 Conformance Test Vectors

**Scenario 1 — Authorized call**
```
Input:    agent ARI=85, action="submit:pr_draft", path="src/router.ts"
Policy:   allowed_actions=["submit:pr_draft"], sandbox.allowed_paths=["src/**"], min_agent_score=75
Expected: HTTP 200, outcome="allow", receipt written
```

**Scenario 2 — Scope-exceeded denial**
```
Input:    agent ARI=85, action="merge:pr"
Policy:   allowed_actions=["submit:pr_draft"], forbidden_actions=["merge:pr"]
Expected: HTTP 403, outcome="deny", agent_score -= 1
```

**Scenario 3 — Cascade revocation**
```
Input:    APS revocation signal for agent_id="agent:abc123"
Active:   3 sessions across 2 projects
Expected: all 3 terminated within 5s, TASK_STATE_AUTH_REQUIRED, revocation receipts written
```

Full test fixtures: `docs/conformance/` in `sint-ai/sint-protocol`

---

## 9. AAIF Compliance Mapping

| AAIF Requirement | Policy Bundle Mechanism |
|---|---|
| Agent identity verification | `require_passport` + APS integration |
| Capability declaration | `permissions.allowed_actions` |
| Audit trail | Hash-chained receipts |
| Human oversight | `approvals.human_review_triggers` |
| Revocation | Cascade revocation via APS |
| Scope limitation | `sandbox` constraints |
| Rate limiting | `rate_limits` fields |
| Multi-agent governance | `delegation` + `child_must_narrow` |

---

## 10. Security Considerations

**Forbidden by Default:** `write:secrets`, `admin:*`, `delete:*`, `merge:pr`
MUST be forbidden unless explicitly listed in `allowed_actions`.

**Injection Prevention:** Policy Bundles MUST be validated against the JSON Schema.
Unrecognized fields or out-of-range values MUST be rejected.

**Path Traversal:** All paths MUST be normalized before glob matching.
`../` and `%2e%2e/` sequences MUST be rejected.

**Token Binding:** Scoped tokens MUST be bound to the issuing session.
`session_id` claim MUST be validated on every request.

---

## 11. Pre-Built Templates

Published at [sint-ai/policy-bundle-library](https://github.com/sint-ai/policy-bundle-library) (Apache 2.0):

| Template | Use Case |
|---|---|
| `read-only.json` | Analysis only, no writes |
| `pr-draft.json` | PR drafts, no merge |
| `full-contributor.json` | All actions, human review on merge |
| `mcp-server-compliance.json` | AAIF compliance scanning |
| `github-copilot.json` | Governance for GitHub Copilot agents |
| `cursor-agent.json` | Governance for Cursor agent |
| `aws-bedrock.json` | Governance for AWS Bedrock agents |
| `a2a-handoff.json` | Cross-agent delegation governance |

---

## 12. Changelog

| Version | Date | Changes |
|---|---|---|
| v1.0-draft | 2026-04-13 | Initial RFC publication |
| v0.2 | 2026-04-04 | `delegation_depth_floor` contributed by aeoess |
| v0.1 | 2026-03-17 | Initial internal spec |

---

## 13. Author

Illia Pashkov · SINT Labs / PSHKV Inc. · Los Angeles  
GitHub: [@pshkv](https://github.com/pshkv) · Protocol: [sint-ai/sint-protocol](https://github.com/sint-ai/sint-protocol)

*Conformance test results and co-authorship contributions welcome via GitHub Issues and PRs.*

---

*SINT Protocol Policy Bundle RFC-001 — Apache 2.0 — April 2026*

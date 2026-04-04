# SINT Protocol — Tokenomics

This document describes how SINT's economic layer works. It is grounded in the
implementation in `packages/bridge-economy/` and is intentionally free of
on-chain or Solana specifics (those live outside `sint-protocol`).

---

## 1. Token Unit

SINT uses an **integer token** — no fractional units. All costs and balances are
whole numbers.

| Constant | Value | Source |
|---|---|---|
| `TOKENS_PER_DOLLAR` | 250 | `pricing-calculator.ts` |
| `INITIAL_USER_BALANCE` | 250 tokens | `pricing-calculator.ts` |
| Launch pricing | 1 token ≈ $0.001 | 1 / TOKENS_PER_DOLLAR |

New users start with 250 tokens ($1.00 equivalent), enough for ~27 default MCP
tool calls before recharging.

---

## 2. Billing Formula

Every action that passes `PolicyGateway.intercept()` has a cost computed by
`computeActionCost()` in `packages/bridge-economy/src/pricing-calculator.ts`:

```
cost = ceil(baseCost × costMultiplier × globalMarkupMultiplier)
```

| Parameter | Default | Notes |
|---|---|---|
| `baseCost` | 6 tokens | MCP/tool call |
| `costMultiplier` | 1.0 | Per-resource or MCP marketplace rate |
| `globalMarkupMultiplier` | 1.5 | `GLOBAL_MARKUP_MULTIPLIER` constant |
| **Default MCP result** | **9 tokens** | `ceil(6 × 1.0 × 1.5)` |

The `costMultiplier` comes from `IPricingPort.getPrice()`. If the pricing port is
absent or returns an error, `costMultiplier` defaults to 1.0 (fail-open).

---

## 3. Action Cost Table

Costs are derived from the base constants in `pricing-calculator.ts`. Tier
labels align with the SINT approval tier system (T0–T3).

| Tier | Action type | Base cost | Typical multiplier | **Token cost** |
|---|---|---|---|---|
| T0 — Observe | Read/query (sensor, subscribe) | 4–6 | 1.0 | **~6–9** |
| T1 — Prepare | Low-impact write (save waypoint, file write) | 6 | 1.0 | **9** |
| T2 — Act | Physical state change (ROS 2 topic publish) | 8 | 1.0 | **12** |
| T3 — Commit | Capsule execution, irreversible action | 12 | 1.0 | **18** |

The 3x tier escalation in the design spec (1 → 3 → 9 → 27 tokens) reflects a
conceptual pricing model where each approval tier costs three times the previous.
The actual constants produce a shallower curve because the billing system
differentiates by *action category*, not purely by tier label.

Physical-domain bridges carry higher multipliers:

| Bridge / resource prefix | Typical `costMultiplier` |
|---|---|
| MCP tool call (default) | 1.0 |
| ROS 2 publish (`ros2://`) | 1.0–2.0 |
| MAVLink command | 2.0–5.0 |
| Capsule execution (`capsule://`) | 1.0–3.0 |

---

## 4. Budget Enforcement

Budget enforcement runs in `EconomyPlugin.preIntercept()`, called before
`PolicyGateway` assigns tiers.

### Per-agent budget cap

Each agent has a total budget cap managed by `IBudgetPort`. Before an action
executes:

1. `checkBudget({ userId, action, resource, estimatedCost })` is called.
2. If `allowed === false` → the plugin returns a `deny` decision immediately.
3. If `usagePercent > 80` → a `economy.budget.alert` event is emitted to the
   evidence ledger.

### Session-level collective spend cap

The design supports a `maxCollectiveSpend` field in a `CollectiveConstraintManifest`
that limits total token spend across all agents in a multi-agent session. This is
a planned constraint; the per-agent `IBudgetPort` is the current enforcement
boundary.

---

## 5. Balance Model

Agents carry a token balance maintained by `IBalancePort`.

**Flow for every request:**

```
preIntercept:
  1. computeActionCost(request) → tokens
  2. IBudgetPort.checkBudget()  → deny if budget exceeded
  3. IBalancePort.getBalance()  → deny if balance < tokens
  4. ITrustPort.evaluateTrust() → deny if blocked, escalate if high_risk

postIntercept (only when decision === "allow"):
  IBalancePort.withdraw(userId, tokens, description, "sint_protocol")
```

The balance check happens **before** any physical action executes. A balance
shortfall produces a `deny` — not an escalation. The ledger receives
`economy.balance.insufficient` and `economy.action.billed` events.

Both the budget check and balance check are fail-open: if the port is
unreachable, the request proceeds through normal gateway logic.

### Cost-aware route selection (Economic Layer v1)

`@sint/bridge-economy` now includes route scoring helpers for multi-bridge
execution choices:

- `selectCostAwareRoute(input)` scores candidates using cost + latency + reliability.
- `applyX402Quotes(candidates, x402Port)` can enrich candidates with optional
  x402 pay-per-call USD quotes.
- `POST /v1/economy/route` exposes this behavior through the gateway API.

The route API is additive and optional. Existing billing/budget integrations
continue to work unchanged when route selection is not used.

---

## 6. Fraud Prevention

### Rate limiting

Capability tokens carry `constraints.rateLimit.{ maxCalls, windowMs }`.
`PolicyGateway` counts calls per token against a `RateLimitStore`. Exceeding
`maxCalls` within `windowMs` results in an immediate deny
(`RATE_LIMIT_EXCEEDED`). This is enforced in the security layer, independently
of economy billing.

### Circuit breaker

`CircuitBreakerPlugin` tracks denial counts per agent. After `N` consecutive
denials the circuit trips to `OPEN` and all subsequent requests are denied
without evaluation. This prevents abusive retry loops from consuming gateway
resources or economy-service quota.

### Balance insufficient → deny, not escalate

An `InsufficientBalanceError` always produces `action: "deny"` with
`policyViolated: "INSUFFICIENT_BALANCE"`. The gateway will not escalate to a
human approver for economic failures — there is nothing a human can authorise
that would fix a zero balance.

---

## 7. Revenue Split (Design)

When tokens are spent by an agent, the protocol's intent is:

| Recipient | Share |
|---|---|
| Operator (MCP server / bridge host) | 70% |
| Protocol treasury | 20% |
| Safety reserve fund | 10% |

This split is aspirational design. The current implementation performs a single
`IBalancePort.withdraw()` call; distribution to operator, treasury, and safety
reserve is handled by the external economy service that implements `IBalancePort`,
not by `sint-protocol` itself.

---

## 8. What This Document Does Not Cover

- **On-chain mechanics** — Solana token programme, SPL accounts, DEX liquidity.
  These are defined in the `sint-ai-workspace` context, outside this repository.
- **Fiat on-ramp / off-ramp** — also external.
- **MCP marketplace pricing catalogue** — operator-set `costMultiplier` values
  per MCP server are resolved at runtime via `IPricingPort`; no static list is
  maintained here.

---

*Last updated: 2026-04-04. Tied to `@sint/bridge-economy` v0.2.*

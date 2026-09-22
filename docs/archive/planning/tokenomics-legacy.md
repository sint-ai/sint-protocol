# SINT Token Economics

**Version 0.1 — Draft**
**Date:** March 2026

---

## Overview

SINT Protocol's economic layer aligns incentives between AI agent operators, infrastructure providers, and security validators. The token model ensures that the cost of misbehavior always exceeds the benefit, creating a self-enforcing security perimeter.

---

## Token: $SINT

**Purpose:** Governance, staking, and economic enforcement for the SINT Protocol network.

### Utility

1. **Staking for Capability Tokens** — Agents must stake $SINT to receive capability tokens. Higher-tier capabilities (T2, T3) require proportionally larger stakes. If an agent violates policy, its stake is slashed.

2. **Validator Rewards** — Nodes that validate evidence ledger entries and verify policy compliance earn $SINT rewards.

3. **Governance** — $SINT holders vote on protocol upgrades, tier classification changes, and constraint parameter adjustments.

4. **Fee Market** — T2/T3 approval requests incur a small fee paid in $SINT, creating sustainable economics for approval validators (human or automated).

---

## Supply

| Parameter | Value |
|-----------|-------|
| Total supply | 1,000,000,000 $SINT |
| Initial circulating | 15% (150M) |
| Vesting | 4-year linear with 1-year cliff |

### Allocation

| Bucket | % | Tokens | Vesting |
|--------|---|--------|---------|
| Protocol development | 25% | 250M | 4yr linear, 1yr cliff |
| Team + advisors | 15% | 150M | 4yr linear, 1yr cliff |
| Community + ecosystem | 30% | 300M | Unlocked per governance milestones |
| Validators + staking rewards | 20% | 200M | Emission schedule over 10 years |
| Strategic partners | 10% | 100M | 2yr linear, 6mo cliff |

---

## Staking Model

### Capability Stake Requirements

| Tier | Minimum Stake | Slash Risk | Slash % |
|------|--------------|------------|---------|
| T0 (Observe) | 0 $SINT | None | 0% |
| T1 (Prepare) | 100 $SINT | Low | 5% |
| T2 (Act) | 1,000 $SINT | Medium | 25% |
| T3 (Commit) | 10,000 $SINT | High | 50% |

### Slashing Conditions

- **Policy violation:** Agent action blocked by gateway after capability was issued
- **Ledger tampering:** Attempted modification of evidence ledger entries
- **Constraint breach:** Physical constraint exceeded (velocity, force, geofence)
- **Token forgery:** Invalid delegation chain detected

Slashed tokens are split: 50% burned, 50% to the reporting validator.

---

## Validator Economics

Validators perform two functions:

1. **Ledger verification:** Validate hash chain integrity of evidence ledger entries
2. **Policy attestation:** Confirm that gateway decisions match published policy

### Reward Structure

- Base reward: proportional to stake weight
- Bonus: for catching violations (share of slash)
- Penalty: for false attestations (own stake slashed)

---

## Fee Market

T2 and T3 approval requests create demand for human and automated approvers:

- **T2 approvals:** Small fee, can be automated by approved validator sets
- **T3 approvals:** Higher fee, requires human-in-the-loop from authorized approver

Fees create a sustainable market for security review without centralized approval bottlenecks.

---

## Governance

$SINT holders can propose and vote on:

- Protocol parameter changes (tier thresholds, constraint defaults)
- Bridge adapter certification
- Validator set changes
- Treasury allocation for ecosystem grants

Voting weight: 1 token = 1 vote, with quadratic scaling option for major protocol changes.

---

## Open Questions

- Exact emission curve for validator rewards
- Cross-chain bridge design (Ethereum L2 vs Solana vs standalone)
- Insurance pool mechanics for T3 incident coverage
- Dynamic stake requirements based on historical agent behavior

---

*This document is a working draft. Token economics will be refined through community feedback and simulation before any token launch.*

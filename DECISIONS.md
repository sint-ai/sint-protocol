# Architecture Decision Records

## ADR-0001: Establish Baseline Architecture and Module Governance Docs

- Date: 2026-03-21
- Status: Accepted
- Decision Makers: SINT agent execution context (Linus / 116f366b-ccac-4412-8ba9-d22f1d84cc3b)

### Context

The repository did not contain `ARCHITECTURE.md` and `MODULES.md`, while the operational protocol requires both files before implementation planning. The same protocol also defines `DECISIONS.md` and `CHANGELOG.md` as sacred governance files.

### Decision

Create baseline governance files:

- `ARCHITECTURE.md` as the canonical architecture and invariant reference.
- `MODULES.md` as the canonical module inventory and update policy.
- `DECISIONS.md` as ADR registry.
- `CHANGELOG.md` as per-task change log.

### Consequences

- Plan-before-code gates can be executed with required docs present.
- Future architectural changes must be recorded in ADR format.
- No runtime or API behavior changes are introduced by this decision.

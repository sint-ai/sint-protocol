---
name: Protocol Proposal
about: Propose a change or extension to the SINT Protocol specification
title: "[Proposal] "
labels: proposal
assignees: ''
---

## Summary

One-paragraph summary of the proposed protocol change.

## Motivation

Why is this change needed? What problem does it solve for SINT users or implementors?

## Specification

### Current Behavior

How does the protocol currently handle this?

### Proposed Behavior

Detailed description of the proposed change. Include:
- New types or schemas (if applicable)
- API changes (if applicable)
- Tier/policy implications (if applicable)

### Wire Format

```typescript
// Include relevant type definitions or JSON examples
```

## Security Considerations

How does this change affect SINT's security properties? Consider:
- [ ] Does it maintain the single choke point invariant?
- [ ] Does it preserve attenuation-only delegation?
- [ ] Does it maintain append-only ledger integrity?
- [ ] Does it introduce new escalation paths?

## Backward Compatibility

Is this change backward compatible? If not, what migration path is proposed?

## Reference Implementation

Link to a branch or PR with a reference implementation, if available.

## Open Questions

Any unresolved design decisions or areas needing community input.

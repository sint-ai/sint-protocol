## Summary
- what changed and why

## Validation
- [ ] `pnpm run build`
- [ ] package-level tests for touched areas
- [ ] conformance tests when bridge/gateway/policy behavior changes

## Safety + Compatibility Checklist
- [ ] If protocol/runtime behavior changed, I updated conformance fixtures/tests
- [ ] If protocol/runtime behavior changed, I updated docs (`README`, guides, or protocol docs)
- [ ] Backward compatibility for older clients is preserved (or explicitly documented)
- [ ] No fail-open behavior introduced for T2/T3 paths

## Scope Notes
- touched packages/apps:
- related issue(s):

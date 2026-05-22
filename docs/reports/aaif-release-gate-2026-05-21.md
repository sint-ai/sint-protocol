# AAIF Release Gate Evidence — 2026-05-21

Generated: 2026-05-22T06:42:09Z  
Commit: `b187ce9d7dfce93e41dd9e6c2cb8c43e317b1aca`  
Release Candidate: `v0.3.0-rc1`  
Result: PASS

## Command

```bash
pnpm run aaif:release-gate
```

## Gate Results

- `pnpm run build`: passed
- `pnpm run test`: passed (workspace)
- `pnpm run docs:build`: passed
- `pnpm --filter @pshkv/conformance-tests test`: passed

## Conformance Snapshot

- Test files: `38` passed
- Tests: `278` passed
- ROS2 control-loop benchmark (`strict=false`):
  - `p50`: `1.9076669999999467`
  - `p95`: `8.102250000000026`
  - `p99`: `13.691790999999967`
  - `steadyP95`: `7.83012500000018`
  - `steadyP99`: `13.178915999999845`
  - `worstBatchP99`: `21.032708000000184`

## Notes

- This evidence run is linked from RC checklist issue `#207`.
- OpenSSF Gap `#195` uses this report as the first tagged RC checklist artifact.

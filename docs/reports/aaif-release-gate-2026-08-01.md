# AAIF Release Gate

Generated: 2026-08-01T05:16:20.277Z
Commit: 2769d013ca3c9e5e4451d761b008b25ca86125c1
Release Candidate: unspecified
Result: PASS

## Command

```bash
pnpm run aaif:release-gate
```

## Gate Steps

| Step | Status | Duration (ms) |
|---|---:|---:|
| build | passed | 689 |
| test | passed | 33518 |
| docs:build | passed | 17865 |
| conformance:report | passed | 4776 |

## Evidence Links

- Conformance report: `docs/reports/conformance-validation-artifact.md`
- Conformance JSON: `docs/reports/conformance-validation-artifact.json`
- Production-slice report: `docs/reports/production-slice-validation-artifact.md`
- Production-slice JSON: `docs/reports/production-slice-validation-artifact.json`

## Signature

- Algorithm: ed25519
- Payload hash (sha256): `a1288d91d0fb6c32d6443ee818fdd1e09685598cb782815e90dd115fff4ddcc4`
- Verification key fingerprint (sha256): `6a527b83bb938687245699ed6c514bdbf8559b879d4f728d10329d275a4149c1`
- Key scope: report-local-ephemeral

# NIST Submission Playbook (AI Agent Standards Initiative)

This playbook packages SINT artifacts for submission to the NIST AI Agent Standards Initiative.

## Scope

The generated bundle is an operator-review packet. It does not send email automatically.

## Prerequisites

- Repository checked out and up to date
- Node.js 22+
- `pnpm` installed

## Generate the Bundle

```bash
pnpm run nist:bundle
```

This command generates:

- `docs/reports/nist-submission-bundle.json`
- `docs/reports/nist-submission-bundle.md`

Each artifact in the packet includes:

- existence check
- SHA-256 checksum
- generation timestamp

## Included Artifacts

The default bundle verifies:

- `docs/specs/nist-ai-rmf-crosswalk.md`
- `docs/SINT_v0.2_SPEC.md`
- `docs/SPAI_2026_ABSTRACT.md`
- `docs/CONFORMANCE_CERTIFICATION_MATRIX_v0.2.md`
- `docs/reports/certification-bundle-summary.json`
- `docs/reports/certification-bundle-summary.md`
- `docs/reports/industrial-benchmark-report.json`
- `docs/reports/industrial-benchmark-report.md`
- `docs/reports/ros2-control-loop-benchmark.json`
- `docs/reports/ros2-control-loop-benchmark.md`

## Operator Submission Steps

1. Run `pnpm run nist:bundle`.
2. Confirm `Result: READY` in `docs/reports/nist-submission-bundle.md`.
3. Review the checksum table for completeness.
4. Attach the listed artifacts and send the packet to `ai-inquiries@nist.gov`.
5. Record submission timestamp and Git commit SHA in your internal tracking issue.

## Notes

- The generated files are deterministic for a fixed commit.
- If any artifact is missing, the bundle is marked `INCOMPLETE`.

# Project Facts

This page is the canonical source for current repository inventory claims.
Counts in papers and dated reports are snapshots of the commit named by those
artifacts; they must not be presented as current counts without rerunning the
corresponding command.

## Current inventory

Verified at commit `60bad21` on 12 August 2026:

| Measure | Count | Reproduction command |
|---|---:|---|
| pnpm workspace projects (excluding the repository root) | 53 | `pnpm -r list --depth -1 --json` |
| packages under `packages/` | 40 | filter the workspace result for `/packages/` |
| protocol bridge packages under `packages/bridge-*` | 15 | filter the workspace result for `/packages/bridge-` |

The bridge count includes `bridge-mqtt`. The SEP-1763
`sint-pdp-interceptor` reference implementation is not counted as a protocol
bridge.

## Tests and performance

SINT does not publish an undated, hand-maintained “passing tests” total here.
The suite changes frequently, and Vitest assertions, test cases, files, and
Turbo tasks are different units. For a current result, run `pnpm test` or use
the test artifact attached to the commit's CI run. Dated research papers retain
their recorded totals as historical results.

Latency numbers are benchmark results, not product guarantees. A latency claim
must identify the benchmark, hardware, commit, sample size, and percentile.
See the [ROS 2 control-loop benchmark](./reports/ros2-control-loop-benchmark.md)
and [industrial benchmark report](./reports/industrial-benchmark-report.md).

## Claim policy

- “Passing” means the cited command completed successfully at the cited commit.
- “Conformant” means only that the named SINT fixture or mapping passed; it is
  not regulatory certification.
- “Third-party validated,” “production deployment,” and “notified-body
  assessed” must not be claimed without a public, attributable artifact.
- Release versions, stars, forks, and package counts are time-sensitive and
  require a retrieval date.

Run `node scripts/check-public-facts.mjs` to verify the inventory above against
the checked-out workspace.

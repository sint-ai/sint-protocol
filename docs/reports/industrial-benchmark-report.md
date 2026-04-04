# Industrial Benchmark Report

Generated: 2026-04-04T22:08:55.448Z
Commit: local

Result: PASS

## Totals

- Suites: 2/2 passed
- Tests: 9/9 passed

## Suite Summary

| Suite | Status | Duration (ms) | Tests | Failed |
|---|---:|---:|---:|---:|
| packages/conformance-tests/src/industrial-benchmark-scenarios.test.ts | passed | 39.96 | 7 | 0 |
| packages/conformance-tests/src/industrial-interoperability.test.ts | passed | 15.908 | 2 | 0 |

## Scenario Summary

| Scenario | Status | Duration (ms) |
|---|---:|---:|
| Industrial Benchmark Scenarios human enters aisle: cmd_vel request escalates to T3 | passed | 9.375 |
| Industrial Benchmark Scenarios stale corridor request is deterministically denied | passed | 3.145 |
| Industrial Benchmark Scenarios revocation under load never fails open | passed | 17.114 |
| Industrial Benchmark Scenarios safety-zone breach is deterministically denied | passed | 2.446 |
| Industrial Benchmark Scenarios model swap against token modelConstraints is denied | passed | 2.3 |
| Industrial Benchmark Scenarios edge disconnect never allows T2/T3 fail-open behavior | passed | 2.591 |
| Industrial Benchmark Scenarios multi-fleet conflict path escalates to T3 with approval quorum | passed | 2.96 |
| Industrial Interoperability Conformance warehouse move intent yields equivalent tiering for RMF->ROS2 and Sparkplug paths | passed | 12.448 |
| Industrial Interoperability Conformance A2A -> Open-RMF dispatch path maps into the same gateway approval semantics | passed | 2.908 |

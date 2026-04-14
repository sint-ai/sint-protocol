# Industrial Benchmark Report

Generated: 2026-04-13T21:35:12.502Z
Commit: local

Result: PASS

## Totals

- Suites: 2/2 passed
- Tests: 11/11 passed

## Suite Summary

| Suite | Status | Duration (ms) | Tests | Failed |
|---|---:|---:|---:|---:|
| packages/conformance-tests/src/industrial-benchmark-scenarios.test.ts | passed | 40.917 | 7 | 0 |
| packages/conformance-tests/src/industrial-interoperability.test.ts | passed | 31.97 | 4 | 0 |

## Scenario Summary

| Scenario | Status | Duration (ms) |
|---|---:|---:|
| Industrial Benchmark Scenarios human enters aisle: cmd_vel request escalates to T3 | passed | 9.589 |
| Industrial Benchmark Scenarios stale corridor request is deterministically denied | passed | 2.842 |
| Industrial Benchmark Scenarios revocation under load never fails open | passed | 17.837 |
| Industrial Benchmark Scenarios safety-zone breach is deterministically denied | passed | 2.725 |
| Industrial Benchmark Scenarios model swap against token modelConstraints is denied | passed | 2.59 |
| Industrial Benchmark Scenarios edge disconnect never allows T2/T3 fail-open behavior | passed | 2.493 |
| Industrial Benchmark Scenarios multi-fleet conflict path escalates to T3 with approval quorum | passed | 2.917 |
| Industrial Interoperability Conformance warehouse move intent yields equivalent tiering for RMF->ROS2 and Sparkplug paths | passed | 19.168 |
| Industrial Interoperability Conformance A2A -> Open-RMF dispatch path maps into the same gateway approval semantics | passed | 2.603 |
| Industrial Interoperability Conformance Gazebo model-scoped cmd_vel maps to equivalent ROS2 control-tier semantics | passed | 4.663 |
| Industrial Interoperability Conformance Isaac Sim namespaced cmd_vel maps to equivalent ROS2 control-tier semantics | passed | 4.97 |

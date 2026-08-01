# Conformance Validation Artifact

Generated: 2026-08-01T05:02:48.256Z
Commit: 3b8034f5f49e6b789a366aafb7536ca7f18ca470
Result: PASS

## Scope

- Surface: `@pshkv/conformance-tests`
- Command: `pnpm --filter @pshkv/conformance-tests exec vitest run --reporter=json`
- Contract: package the external conformance suite as a repeatable report artifact

## Redaction Boundary

- Included: suite status, timing, assertion names, git SHA, timestamp
- Excluded: secret material, live deployment credentials, private endpoints, raw local environment values

## Summary

- Suites: 55/55 passed
- Tests: 382/382 passed

## Signature

- Algorithm: ed25519
- Payload hash (sha256): `44f73b1ab74364788f51101b62f3b59f64d918e63f4c0d16d6a515e4308bccf9`
- Verification key fingerprint (sha256): `0b3d26acea3ba1ea15756f8ede7e174f17f1fe390af7899f6280a7ec61be3d4b`
- Key scope: report-local-ephemeral

## Suite Detail

| Suite | Status | Duration (ms) | Passed | Failed |
|---|---:|---:|---:|---:|
| packages/conformance-tests/src/a2a-fixtures-conformance.test.ts | passed | 34.181396484375 | 5 | 0 |
| packages/conformance-tests/src/action-ref-explainability-conformance.test.ts | passed | 1.58935546875 | 2 | 0 |
| packages/conformance-tests/src/agent-commerce-governance-conformance.test.ts | passed | 2.64990234375 | 3 | 0 |
| packages/conformance-tests/src/agentskill-authz-fixtures-conformance.test.ts | passed | 355.31884765625 | 2 | 0 |
| packages/conformance-tests/src/aps-sint-handshake.test.ts | passed | 65.14501953125 | 11 | 0 |
| packages/conformance-tests/src/autogen-interop-conformance.test.ts | passed | 88.22802734375 | 3 | 0 |
| packages/conformance-tests/src/autonomy-supervisor-conformance.test.ts | passed | 3.534423828125 | 4 | 0 |
| packages/conformance-tests/src/backward-compatibility-v0-clients.test.ts | passed | 84.07568359375 | 3 | 0 |
| packages/conformance-tests/src/bridge-mcp-regression.test.ts | passed | 54.445068359375 | 10 | 0 |
| packages/conformance-tests/src/bridge-ros2-regression.test.ts | passed | 56.118896484375 | 10 | 0 |
| packages/conformance-tests/src/canonical-fixtures-conformance.test.ts | passed | 65.45751953125 | 5 | 0 |
| packages/conformance-tests/src/code-as-policy-skill-guard-conformance.test.ts | passed | 5.305419921875 | 7 | 0 |
| packages/conformance-tests/src/deployment-envelope-base-conformance.test.ts | passed | 46.791748046875 | 2 | 0 |
| packages/conformance-tests/src/e2e-demo.test.ts | passed | 37.66455078125 | 10 | 0 |
| packages/conformance-tests/src/economy-fixtures-conformance.test.ts | passed | 2.553466796875 | 1 | 0 |
| packages/conformance-tests/src/economy-regression.test.ts | passed | 103.532958984375 | 15 | 0 |
| packages/conformance-tests/src/edge-mode-conformance.test.ts | passed | 30.380859375 | 2 | 0 |
| packages/conformance-tests/src/eu-ai-act-conformity-pack-conformance.test.ts | passed | 8.242919921875 | 5 | 0 |
| packages/conformance-tests/src/factory-action-demo-conformance.test.ts | passed | 22.8203125 | 11 | 0 |
| packages/conformance-tests/src/hardware-safety-handshake-conformance.test.ts | passed | 110.279296875 | 21 | 0 |
| packages/conformance-tests/src/humanoid-multivendor-fleet-conformance.test.ts | passed | 2.650390625 | 6 | 0 |
| packages/conformance-tests/src/humanoid-profile-conformance.test.ts | passed | 70.40576171875 | 4 | 0 |
| packages/conformance-tests/src/humanoid-warehouse-pilot-conformance.test.ts | passed | 29.3564453125 | 5 | 0 |
| packages/conformance-tests/src/industrial-benchmark-scenarios.test.ts | passed | 67.89794921875 | 7 | 0 |
| packages/conformance-tests/src/industrial-cell-safety-pack-conformance.test.ts | passed | 6.29052734375 | 7 | 0 |
| packages/conformance-tests/src/industrial-humanoid-shipyard-safety-pack-conformance.test.ts | passed | 4.113037109375 | 8 | 0 |
| packages/conformance-tests/src/industrial-interoperability.test.ts | passed | 51.92822265625 | 4 | 0 |
| packages/conformance-tests/src/kinetic-envelope-conformance.test.ts | passed | 4.267333984375 | 8 | 0 |
| packages/conformance-tests/src/lerobot-policy-actuation-receipts-conformance.test.ts | passed | 3.41748046875 | 7 | 0 |
| packages/conformance-tests/src/manufacturing-execution-envelope-conformance.test.ts | passed | 38.63330078125 | 4 | 0 |
| packages/conformance-tests/src/mcp-attack-surface.test.ts | passed | 145.26318359375 | 10 | 0 |
| packages/conformance-tests/src/mission-authority-conformance.test.ts | passed | 4.300537109375 | 4 | 0 |
| packages/conformance-tests/src/mission-authority-reference-gateway-conformance.test.ts | passed | 3.254150390625 | 5 | 0 |
| packages/conformance-tests/src/mission-authority-reference-slice-conformance.test.ts | passed | 83.0244140625 | 1 | 0 |
| packages/conformance-tests/src/mission-authority-release-lane-evidence-conformance.test.ts | passed | 2.180908203125 | 5 | 0 |
| packages/conformance-tests/src/moveit-manipulation-policy-receipts-conformance.test.ts | passed | 3.107177734375 | 7 | 0 |
| packages/conformance-tests/src/nav2-navigation-policy-receipts-conformance.test.ts | passed | 4.19921875 | 7 | 0 |
| packages/conformance-tests/src/open-rmf-handoff-policy-receipts-conformance.test.ts | passed | 3.57958984375 | 6 | 0 |
| packages/conformance-tests/src/owasp-asi-conformance.test.ts | passed | 163.855712890625 | 29 | 0 |
| packages/conformance-tests/src/payment-governance-fixtures-conformance.test.ts | passed | 0.782470703125 | 2 | 0 |
| packages/conformance-tests/src/phase4-regression.test.ts | passed | 104.260986328125 | 18 | 0 |
| packages/conformance-tests/src/physical-ai-runtime-safety-fixtures-conformance.test.ts | passed | 47.407958984375 | 8 | 0 |
| packages/conformance-tests/src/physical-work-market-conformance.test.ts | passed | 18.054443359375 | 19 | 0 |
| packages/conformance-tests/src/post-quantum-crypto-agility-conformance.test.ts | passed | 81.30224609375 | 5 | 0 |
| packages/conformance-tests/src/px4-offboard-policy-receipts-conformance.test.ts | passed | 3.27490234375 | 8 | 0 |
| packages/conformance-tests/src/px4-ulog-correlation-artifact-conformance.test.ts | passed | 3.149658203125 | 4 | 0 |
| packages/conformance-tests/src/regulated-agent-runtime-conformance.test.ts | passed | 5.34130859375 | 9 | 0 |
| packages/conformance-tests/src/regulated-consent-extensions-conformance.test.ts | passed | 7.588134765625 | 6 | 0 |
| packages/conformance-tests/src/ros2-agent-scenarios.test.ts | passed | 67.434326171875 | 8 | 0 |
| packages/conformance-tests/src/ros2-control-loop-latency.test.ts | passed | 1838.759033203125 | 1 | 0 |
| packages/conformance-tests/src/security-iot-fixtures-conformance.test.ts | passed | 78.899169921875 | 3 | 0 |
| packages/conformance-tests/src/security-regression.test.ts | passed | 113.72705078125 | 9 | 0 |
| packages/conformance-tests/src/signed-effect-pack-conformance.test.ts | passed | 81.88525390625 | 3 | 0 |
| packages/conformance-tests/src/sint-industrial-pack-conformance.test.ts | passed | 6.837158203125 | 6 | 0 |
| packages/conformance-tests/src/solar-field-operations-policy-receipts-conformance.test.ts | passed | 3.203369140625 | 7 | 0 |

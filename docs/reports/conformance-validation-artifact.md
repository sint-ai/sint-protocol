# Conformance Validation Artifact

Generated: 2026-08-01T05:16:20.253Z
Commit: 2769d013ca3c9e5e4451d761b008b25ca86125c1
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
- Payload hash (sha256): `57896a1a551fab5d4214a3fa0d7deb13bb57b4d2c292d8774299ba27d0d1d7cf`
- Verification key fingerprint (sha256): `f9c2fa856918b80d46b3ef57740e45b1e1a5155da64863eccc61b2ccbc2fce7f`
- Key scope: report-local-ephemeral

## Suite Detail

| Suite | Status | Duration (ms) | Passed | Failed |
|---|---:|---:|---:|---:|
| packages/conformance-tests/src/a2a-fixtures-conformance.test.ts | passed | 119.355224609375 | 5 | 0 |
| packages/conformance-tests/src/action-ref-explainability-conformance.test.ts | passed | 2.6474609375 | 2 | 0 |
| packages/conformance-tests/src/agent-commerce-governance-conformance.test.ts | passed | 4.150146484375 | 3 | 0 |
| packages/conformance-tests/src/agentskill-authz-fixtures-conformance.test.ts | passed | 358.8427734375 | 2 | 0 |
| packages/conformance-tests/src/aps-sint-handshake.test.ts | passed | 121.37841796875 | 11 | 0 |
| packages/conformance-tests/src/autogen-interop-conformance.test.ts | passed | 49.19775390625 | 3 | 0 |
| packages/conformance-tests/src/autonomy-supervisor-conformance.test.ts | passed | 3.155517578125 | 4 | 0 |
| packages/conformance-tests/src/backward-compatibility-v0-clients.test.ts | passed | 34.961669921875 | 3 | 0 |
| packages/conformance-tests/src/bridge-mcp-regression.test.ts | passed | 82.342529296875 | 10 | 0 |
| packages/conformance-tests/src/bridge-ros2-regression.test.ts | passed | 87.76318359375 | 10 | 0 |
| packages/conformance-tests/src/canonical-fixtures-conformance.test.ts | passed | 68.059326171875 | 5 | 0 |
| packages/conformance-tests/src/code-as-policy-skill-guard-conformance.test.ts | passed | 3.14990234375 | 7 | 0 |
| packages/conformance-tests/src/deployment-envelope-base-conformance.test.ts | passed | 68.58203125 | 2 | 0 |
| packages/conformance-tests/src/e2e-demo.test.ts | passed | 33.45703125 | 10 | 0 |
| packages/conformance-tests/src/economy-fixtures-conformance.test.ts | passed | 2.209716796875 | 1 | 0 |
| packages/conformance-tests/src/economy-regression.test.ts | passed | 98.1904296875 | 15 | 0 |
| packages/conformance-tests/src/edge-mode-conformance.test.ts | passed | 32.338623046875 | 2 | 0 |
| packages/conformance-tests/src/eu-ai-act-conformity-pack-conformance.test.ts | passed | 3.49755859375 | 5 | 0 |
| packages/conformance-tests/src/factory-action-demo-conformance.test.ts | passed | 25.708251953125 | 11 | 0 |
| packages/conformance-tests/src/hardware-safety-handshake-conformance.test.ts | passed | 117.38525390625 | 21 | 0 |
| packages/conformance-tests/src/humanoid-multivendor-fleet-conformance.test.ts | passed | 6.312744140625 | 6 | 0 |
| packages/conformance-tests/src/humanoid-profile-conformance.test.ts | passed | 98.144775390625 | 4 | 0 |
| packages/conformance-tests/src/humanoid-warehouse-pilot-conformance.test.ts | passed | 44.16357421875 | 5 | 0 |
| packages/conformance-tests/src/industrial-benchmark-scenarios.test.ts | passed | 179.641845703125 | 7 | 0 |
| packages/conformance-tests/src/industrial-cell-safety-pack-conformance.test.ts | passed | 5.388427734375 | 7 | 0 |
| packages/conformance-tests/src/industrial-humanoid-shipyard-safety-pack-conformance.test.ts | passed | 7.8388671875 | 8 | 0 |
| packages/conformance-tests/src/industrial-interoperability.test.ts | passed | 67.37353515625 | 4 | 0 |
| packages/conformance-tests/src/kinetic-envelope-conformance.test.ts | passed | 5.155517578125 | 8 | 0 |
| packages/conformance-tests/src/lerobot-policy-actuation-receipts-conformance.test.ts | passed | 4.2490234375 | 7 | 0 |
| packages/conformance-tests/src/manufacturing-execution-envelope-conformance.test.ts | passed | 42.2392578125 | 4 | 0 |
| packages/conformance-tests/src/mcp-attack-surface.test.ts | passed | 90.96337890625 | 10 | 0 |
| packages/conformance-tests/src/mission-authority-conformance.test.ts | passed | 4.204345703125 | 4 | 0 |
| packages/conformance-tests/src/mission-authority-reference-gateway-conformance.test.ts | passed | 4.265869140625 | 5 | 0 |
| packages/conformance-tests/src/mission-authority-reference-slice-conformance.test.ts | passed | 55.5478515625 | 1 | 0 |
| packages/conformance-tests/src/mission-authority-release-lane-evidence-conformance.test.ts | passed | 2.1728515625 | 5 | 0 |
| packages/conformance-tests/src/moveit-manipulation-policy-receipts-conformance.test.ts | passed | 3.204345703125 | 7 | 0 |
| packages/conformance-tests/src/nav2-navigation-policy-receipts-conformance.test.ts | passed | 3.268310546875 | 7 | 0 |
| packages/conformance-tests/src/open-rmf-handoff-policy-receipts-conformance.test.ts | passed | 2.216796875 | 6 | 0 |
| packages/conformance-tests/src/owasp-asi-conformance.test.ts | passed | 143.901611328125 | 29 | 0 |
| packages/conformance-tests/src/payment-governance-fixtures-conformance.test.ts | passed | 2.72607421875 | 2 | 0 |
| packages/conformance-tests/src/phase4-regression.test.ts | passed | 131.1767578125 | 18 | 0 |
| packages/conformance-tests/src/physical-ai-runtime-safety-fixtures-conformance.test.ts | passed | 105.297607421875 | 8 | 0 |
| packages/conformance-tests/src/physical-work-market-conformance.test.ts | passed | 4.2236328125 | 19 | 0 |
| packages/conformance-tests/src/post-quantum-crypto-agility-conformance.test.ts | passed | 47.630859375 | 5 | 0 |
| packages/conformance-tests/src/px4-offboard-policy-receipts-conformance.test.ts | passed | 4.1611328125 | 8 | 0 |
| packages/conformance-tests/src/px4-ulog-correlation-artifact-conformance.test.ts | passed | 1.236328125 | 4 | 0 |
| packages/conformance-tests/src/regulated-agent-runtime-conformance.test.ts | passed | 6.377685546875 | 9 | 0 |
| packages/conformance-tests/src/regulated-consent-extensions-conformance.test.ts | passed | 6.31396484375 | 6 | 0 |
| packages/conformance-tests/src/ros2-agent-scenarios.test.ts | passed | 77.869873046875 | 8 | 0 |
| packages/conformance-tests/src/ros2-control-loop-latency.test.ts | passed | 1766.360107421875 | 1 | 0 |
| packages/conformance-tests/src/security-iot-fixtures-conformance.test.ts | passed | 139.419677734375 | 3 | 0 |
| packages/conformance-tests/src/security-regression.test.ts | passed | 64.48291015625 | 9 | 0 |
| packages/conformance-tests/src/signed-effect-pack-conformance.test.ts | passed | 56.784912109375 | 3 | 0 |
| packages/conformance-tests/src/sint-industrial-pack-conformance.test.ts | passed | 6.90185546875 | 6 | 0 |
| packages/conformance-tests/src/solar-field-operations-policy-receipts-conformance.test.ts | passed | 2.194091796875 | 7 | 0 |

# Physical AI Runtime Safety Working Group

Status: v0.1 fixture review packet

## Goal

Coordinate a small, cross-project fixture set for the safety boundary between AI agents and physical systems.

This is intentionally narrow. The first milestone is agreement on runnable fixtures, not a new broad standard.

## What We Are Asking Reviewers To Check

- Does the fixture describe pre-action authorization before actuation?
- Does the fixture make transport bypass behavior explicit?
- Does e-stop/rollback evidence have the fields a safety reviewer needs?
- Can your project translate the cases without adopting SINT internals?

## Canonical v0.1 Files

- Fixture schema: `packages/conformance-tests/fixtures/physical-ai/runtime-safety-fixture.schema.json`
- Fixture cases: `packages/conformance-tests/fixtures/physical-ai/runtime-safety-fixtures.v0.1.json`
- Reference runner: `packages/conformance-tests/src/physical-ai-runtime-safety-fixtures-conformance.test.ts`
- Fixture README: `packages/conformance-tests/fixtures/physical-ai/README.md`

## Run The Reference Runner

```bash
pnpm --filter @pshkv/conformance-tests test:physical-ai-runtime
```

## v0.1 Case Set

- `ros2_cmd_vel_authorized_escalates`
- `ros2_cmd_vel_denied_by_scope`
- `ros2_cmd_vel_escalates_human_present`
- `sros2_bypass_publish_fails`
- `estop_always_rolls_back`
- `receipt_verifies_policy_decision`

## Suggested GitHub Reply For Review Invitations

```text
We are starting a small Physical AI Runtime Safety fixture review around the boundary between AI agents and physical systems.

The goal is not to push SINT adoption. We want a protocol-neutral fixture shape that ROS2/SROS2, robotics simulators, agent runtimes, and safety gateways can all translate.

The v0.1 pack covers: pre-action authorization, transport non-bypass, e-stop rollback, and evidence receipts. Would you be open to reviewing whether these cases map cleanly to your project?

Fixture docs:
https://github.com/sint-ai/sint-protocol/tree/main/packages/conformance-tests/fixtures/physical-ai
```

## Candidate Reviewers

- ROS2/SROS2 security maintainers
- Open-RMF and ROS2 navigation/fleet workflow projects
- MCP/agent security gateway maintainers
- Agent identity and delegated authority projects
- Robotics simulation and lab teams validating physical AI actions

## Success Criterion

The v0.1 milestone is successful when two independent implementations can agree on:

- the expected decision (`allow`, `deny`, `escalate`, `rollback`)
- the expected transport outcome
- the evidence fields that prove the boundary was checked
- the claims that cannot be inferred from the evidence alone

# Code-As-Policy Robot Agent Safety

This guide captures the SINT integration pattern for robot agents that write,
revise, and execute robot control programs.

The motivating shape is Waddle-style robot agents: connect an API to a robot,
prompt the agent, let it produce an editable policy program, and grow a shared
skill library over time. SINT does not need to compete with that layer. It fits
under it as the runtime authorization and evidence boundary between generated
programs and physical actuation.

## Fit

Code-as-policy systems need at least three control points:

- generated program staging before execution
- reusable skill registration with content digests
- physical primitive execution through robot middleware such as ROS 2

SINT already has the required surfaces:

- `engine://system2/plan` for staging and reviewing generated programs
- `engine://capsule/skill-library/register` for content-bound skill promotion
- `engine://system2/execute` for reviewed generated-program execution
- ROS 2 resources such as
  `ros2:///joint_trajectory_controller/follow_joint_trajectory` for actuator
  commands
- `EvidenceLedger` receipts binding the agent, program digest, skill digest,
  primitive set, hardware profile, policy decision, and hash-chain pointers
- `DefaultCodeAsPolicyGuard` in `@pshkv/gate-policy-gateway` for runtime
  checks against generated-program digests, approved skill digests, primitive
  allowlists, robot identity shape, and autonomous trial budgets

## Run The Check

```bash
pnpm --filter @pshkv/conformance-tests exec vitest run src/code-as-policy-skill-guard-conformance.test.ts
pnpm --filter @pshkv/gate-policy-gateway exec vitest run __tests__/code-as-policy-guard.test.ts
```

The fixture is:

```text
packages/conformance-tests/fixtures/physical-ai/code-as-policy-skill-guard.v1.json
```

## Boundary

The fixture uses a vendor-neutral code-as-policy boundary:

- generated robot program: `T1_prepare`
- reusable skill registration: `T1_prepare`, content-bound
- generated program execution: `T2_act`, reviewed
- physical primitive actuation: `T2_act`, reviewed
- human detected in the workspace: escalates to `T3_commit`
- program body changed after approval: denied
- skill or primitive vocabulary changed after approval: denied
- autonomous data-collection and auto-research loops: bounded by trial budget

## Receipt Shape

Each receipt binds:

- agent identity
- robot identities
- generated program reference and digest
- reusable skill reference and digest
- approved primitive set
- hardware profile
- workspace
- resource and operation
- assigned tier and decision
- decision digest
- evidence event hash and previous hash
- timestamp

The practical goal is to make robot-agent iteration auditable. A reviewer
should be able to answer: which generated program or skill produced this
trajectory, which physical limits applied, which robot executed it, and whether
the program or skill changed after approval.

## Integration Pattern

1. The robot-agent platform emits a generated program artifact with a stable
   digest.
2. SINT records program staging as `engine://system2/plan`.
3. Reusable skills are registered only with their digest, primitive set, and
   hardware profile.
4. Before execution, the agent requests `engine://system2/execute` with the
   approved program digest and skill digests.
5. Every physical primitive routes through the relevant bridge, commonly ROS 2.
6. If a digest, primitive set, workspace, or physical constraint changes, the
   previous approval no longer applies.

This keeps generated code useful and editable while preventing silent mutation
from becoming silent physical authority.

## Runtime Guard

Configure the gateway with an explicit primitive contract:

```ts
import { DefaultCodeAsPolicyGuard, PolicyGateway } from "@pshkv/gate-policy-gateway";

const gateway = new PolicyGateway({
  resolveToken,
  codeAsPolicyGuard: new DefaultCodeAsPolicyGuard({
    allowedPrimitives: [
      "bounding_box",
      "detect_in_base",
      "preset",
      "approach_until",
      "reset_home",
    ],
    maxTrialBudget: 1_000,
  }),
});
```

Requests for generated robot programs carry `params.codeAsPolicy` metadata:

```json
{
  "codeAsPolicy": {
    "programRef": "sint://program/code-policy/fold-shirt.py",
    "programDigest": "digest:sha256:...",
    "approvedProgramDigest": "digest:sha256:...",
    "skillRef": "sint://skill/fold-grasp/v4",
    "skillDigest": "digest:sha256:...",
    "approvedSkillDigest": "digest:sha256:...",
    "primitiveSetRef": "sint://primitive-set/manipulation-safe-v1",
    "primitives": ["bounding_box", "detect_in_base", "approach_until"],
    "robotIds": ["arm-left-01", "arm-right-01"],
    "trialIndex": 12,
    "trialBudget": 100
  }
}
```

The guard denies before tier assignment when metadata is missing, a digest no
longer matches the approved artifact, a new primitive appears, duplicate robot
IDs are present, or the trial loop exceeds its budget. Violations emit
`robot.code_policy.guard_violation`.

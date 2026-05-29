# SINT Autonomy Supervisor

`@pshkv/autonomy-supervisor` adds the managed-autonomy authority axis to SINT.

The normal Policy Gateway still decides whether an action is permitted by token,
tier, physical constraints, approval, and evidence. The supervisor answers the
orthogonal question first: does the agent still have authority to act at all?

The autonomy token is a single mode:

- `stable`
- `metacognitive_recovery`
- `assisted_recovery`
- `regulated_control`

External output is structurally permitted only in `stable` with clean guards.
`metacognitive_recovery`, `assisted_recovery`, and `regulated_control` all block
unilateral external action before the normal permission pipeline can proceed.

## I-A6 External Restoration

Exit from `regulated_control` requires an external authorization signal. The
supervisor never sets `extAuth` itself, and `regulatedController` may only be
`human_operator` or `hardware_safety_controller`. `policy_gateway` is rejected
because a component cannot safely authorize its own restoration.

## Verification

```bash
pnpm --filter @pshkv/autonomy-supervisor verify
```

The verification harness exhaustively checks the macro-net over the full
4 x 128 state/guard configuration space.

Source placeholder: `[managed-autonomy-source: pending verification]`.

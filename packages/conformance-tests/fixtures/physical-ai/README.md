# Physical AI Runtime Safety Fixtures

This fixture pack defines protocol-neutral checks for the boundary between AI
agents and physical systems.

The v0.1 scope is intentionally small:

- pre-action authorization before actuation
- ROS2/SROS2 transport non-bypass behavior
- e-stop rollback semantics
- evidence pointers that bind request, action intent, and policy verdict

The shared evidence shape is intentionally small:

- `action_ref` is a deterministic public pointer to the attempted action. A
  receipt, TrailRecord, or gateway event that covers the same action should be
  able to reproduce the same value from its own attestation source.
- `delegation_ref` is an opaque content-addressed authority pointer. Physical
  runtimes preserve and forward it, but do not need to parse the upstream
  delegation envelope. Root actions use `null`, not a sentinel value.
- Deny, transport-reject, and rollback paths still produce positive evidence
  artifacts. A rejected `/cmd_vel` publish is not just the absence of motion; it
  is a receipt that names the attempted action and the authority pointer checked
  at the boundary. An e-stop rollback receipt should also point back to the
  original action it reversed.

SINT provides one reference runner, but other implementations can translate the
same cases into their own gateway, transport, or simulator. The important
interop question is whether independent systems agree on the expected decision,
transport outcome, and evidence contract.

# Physical AI Runtime Safety Fixtures

This fixture pack defines protocol-neutral checks for the boundary between AI
agents and physical systems.

The v0.1 scope is intentionally small:

- pre-action authorization before actuation
- ROS2/SROS2 transport non-bypass behavior
- e-stop rollback semantics
- evidence pointers that bind request, action intent, and policy verdict

SINT provides one reference runner, but other implementations can translate the
same cases into their own gateway, transport, or simulator. The important
interop question is whether independent systems agree on the expected decision,
transport outcome, and evidence contract.

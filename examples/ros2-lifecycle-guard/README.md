# ROS 2 Lifecycle Guard Demo

This demo shows where `PolicyGateway.intercept()` lives in a ROS 2 runtime:
the node (publisher / service caller / action client) becomes the enforcement
context and **refuses to execute** a control-path action unless the gateway
decision permits it.

What you will see:
- `allow`: a read-like action (`ros2:///camera/front subscribe`)
- `escalate`: a motion command (`ros2:///cmd_vel publish`) that requires review
- `deny`: a motion command exceeding token constraints
- `fail-closed`: if the gateway is unreachable, the node refuses to act

## Run

From repo root:

```bash
docker compose -f examples/ros2-lifecycle-guard/docker-compose.yml up --build
```

Expected output includes a short transcript from the ROS 2 container showing:
`ALLOW`, `ESCALATE`, and `DENY` decisions.

## Notes

- This is an **application-level** guard. Preventing arbitrary third-party
  publishes to ROS topics requires system-level containment (SROS2 enclaves,
  network isolation, or a transport-level interceptor). The purpose here is to
  make the enforcement-context pattern concrete and runnable.
- For the matching **transport-level** recipe — SROS2 keystore + enclaves,
  `ROS_SECURITY_STRATEGY=Enforce`, and a runnable bypass-attempt conformance
  check — see [`../ros2-transport-hardening`](../ros2-transport-hardening/).
  The two demos are intended to be read together: this one answers "what is
  the policy decision surface?"; the other answers "what makes it
  non-bypassable at the wire?".


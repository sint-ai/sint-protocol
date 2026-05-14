# ROS 2 Transport-Level Non-Bypass Hardening

This demo is the transport-hardened counterpart to
[`ros2-lifecycle-guard`](../ros2-lifecycle-guard/). That one shows the
**application-level** pattern: a node voluntarily calls
`PolicyGateway.intercept()` before acting. This one shows why that is not
enough on its own, and what to layer underneath so that bypass is not
materially possible.

> **Layered model — both layers are needed.**
>
> | Layer | Enforced by | What it catches | What it cannot catch |
> | --- | --- | --- | --- |
> | Application | `PolicyGateway.intercept()` call in the guarded node | Semantic policy: token, constraints, physical context, tier | A *different* process on the same DDS domain publishing directly |
> | Transport | SROS2 enclaves + DDS Secure (authentication + access control) | Any unauthenticated or unauthorized DDS participant | Application-semantic policy — DDS has no notion of "velocity cap" |
>
> `ros2-lifecycle-guard` covers the top row. This demo adds the bottom row.

## What gets stood up

- `gateway` — the SINT Policy Gateway (app-layer PDP).
- `keystore-init` — one-shot container that builds an SROS2 keystore with:
  - `/guarded_talker` enclave: `publish rt/cmd_vel` only (permissions.xml overlay re-signed with the permissions CA).
  - `/guarded_camera` enclave: `subscribe rt/camera/front` only.
- `guarded-talker` — ROS 2 node running under the `/guarded_talker` enclave
  with `ROS_SECURITY_ENABLE=true ROS_SECURITY_STRATEGY=Enforce`. Every
  publish is preceded by an `intercept()` call. This is the reference
  *defender*.
- `attacker` — same network, same `ROS_DOMAIN_ID`, Enforce mode, but
  **no keystore mount and no enclave**. This is the reference *bypass
  attempt*: a compromised process on the same network trying to inject a
  `/cmd_vel` command directly.

## Run

```bash
# From this directory:
docker compose up --build -d postgres redis gateway keystore-init guarded-talker
docker compose logs -f guarded-talker           # watch policy decisions
docker compose run --rm attacker                # reference bypass attempt
```

## Automated conformance check

```bash
./conformance-check.sh
```

The script fails if the attacker container exits `0` (meaning a bypass
publish reached the guarded topic). It passes if the attacker exits `2`
(no matched subscribers after 10s of discovery) or `3` (rmw refused to
create the participant). Both are valid hardening outcomes:

- **Exit 3** is the strongest rejection: the rmw security plugin refuses
  participant creation because the attacker has no identity cert.
- **Exit 2** is the next-strongest: the attacker creates a local
  participant but DDS Secure discovery never matches it to the guarded
  subscriber, so the publish traffic never leaves its own process.

Neither exit code indicates a successful injection into the guarded
topic.

## Key generation recipe (manual reference)

The `keystore-init` container runs `keystore-init.sh`. The inlined
commands are:

```bash
source /opt/ros/humble/setup.bash

# 1. Build the keystore and its internal CAs.
ros2 security create_keystore /keystore

# 2. Create an enclave per trusted node identity.
ros2 security create_enclave /keystore /guarded_talker
ros2 security create_enclave /keystore /guarded_camera

# 3. Overlay custom permissions.xml to restrict each enclave to its
#    declared topic, then re-sign with the permissions CA:
openssl smime -sign \
  -in /keystore/enclaves/guarded_talker/permissions.xml \
  -text -out /keystore/enclaves/guarded_talker/permissions.p7s \
  -signer /keystore/public/permissions_ca.cert.pem \
  -inkey /keystore/private/permissions_ca.key.pem
```

## Launching a guarded node

Any ROS 2 node can become a guarded node with three environment
variables and a matching enclave:

```bash
export ROS_SECURITY_ENABLE=true
export ROS_SECURITY_STRATEGY=Enforce   # NOT Permissive
export ROS_SECURITY_KEYSTORE=/keystore
# Then pass --enclave /guarded_talker when launching.
```

Under `Enforce`, rmw refuses to bring up a participant whose enclave is
missing, expired, or whose permissions.xml disallows the requested
topic — which is exactly the property the attacker container is
exercising.

## Optional: namespace separation + network policies

If you deploy on Kubernetes or a multi-subnet environment, pair SROS2
with one or both of:

- A distinct `ROS_DOMAIN_ID` per trust boundary (each domain is a
  separate DDS multicast plane; nodes on different domains cannot even
  discover each other).
- A `NetworkPolicy` that restricts DDS ports (default `7400-7500`) to
  the pods with a `sint-enclave=<name>` label.

These are defense-in-depth layers on top of SROS2, not replacements for
it.

## Optional: gateway-side endpoint allowlist

For air-gapped or one-way deployments, the Policy Gateway can be
configured to reject `ros2://` resources outside an operator-supplied
allowlist (e.g. `ros2:///cmd_vel`, `ros2:///camera/*`). This is useful
as a belt-and-braces check against tokens being misused against
topics that were never meant to be reachable. See
[`packages/policy-gateway`](../../packages/policy-gateway) for the
policy hook.

## Limitations

- This demo is deliberately small: one talker enclave, one subscribe
  enclave, two containers. A real deployment needs one enclave per
  distinct node identity and a governance.xml matching the
  operator's risk posture.
- A full ROS 2 middleware interceptor (a hard man-in-the-middle that
  the node cannot go around) is out of scope — see the non-goals in
  issue #161.
- SROS2 only covers DDS traffic. If your agent has *other* I/O (HTTP
  clients, file system, subprocess) you need a complementary sandbox
  (e.g. seccomp, AppArmor, or the `NemoClaw` runtime).

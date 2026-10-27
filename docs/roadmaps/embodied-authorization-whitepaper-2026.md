# Embodied authorization: whitepaper execution roadmap

**Baseline:** `8ba9660` (24 October 2026). The external repository audit examined
`915b4d7`; the current checkout already contains the predictive execution broker,
signed simulation evidence policy, world snapshot adapter, and simulation server.
Treat the whitepaper as the target design and the audit as findings to verify
against each subsequent commit, not as instructions to execute verbatim.

## Release gates

| Order | Deliverable | Exit evidence | Status at this branch |
|---|---|---|---|
| 0A | Trusted root issuers and verifiable delegated lineage | Unknown issuer, missing parent, scope expansion, expired or revoked ancestor deny at `intercept()` and preflight | Implemented for configured gateways; production server now requires `SINT_TRUSTED_ISSUERS`. Library consumers must opt in pending the next breaking release. |
| 0B | Close MCP self-approval and process-spawn path | Agent cannot call approval, token minting, delegation or server-management tools; all built-ins traverse `intercept()` | Implemented in proxy with per-server tokens. Production dashboard votes now require allowlisted operator signatures. |
| 0C | Proxy transport and credential isolation | Downstream receives only explicitly selected environment; HTTP Origin/Host and gateway CORS are deployment restricted; unsupported network transports reject private targets | Environment isolation and loopback HTTP/production CORS controls implemented. Remote downstream transport remains unsupported. |
| 0D | Evidence durability | Database refuses UPDATE, DELETE and TRUNCATE; signed proof served over HTTP; retention and authority export documented and enforced | Database guard and signed HTTP proof implemented; retention and authority export pending. |
| 1 | Signed decision and simulation receipts | Denials have signed, verifiable decision records; no simulator run is indeterminate; forged, stale, replayed and mismatched receipts deny | Predictive broker and V2 verifier landed in `8ba9660`; legacy industrial fixture now defaults to nonapproval. Decision proof route and attack reporting need review. |
| 2 | Scene-bound permits and edge continuity | Scene, robot, payload, policy and simulator digests bound; state change invalidates permit; nonce survives restart; offline runner holds a safe state | Snapshot binding exists in predictive path; file-backed edge nonce consumption now survives restart when configured. Controller hold and complete binding remain pending. |
| 3 | Robot enforcement pilot | SROS2 Enforce mode plus a command-gate node owns action endpoints; direct actuator bypass fails in an actual ROS graph | Docker demonstration exists; product binding pending. |
| 4 | Continuous safety shield | Controller-rate barrier/QP filter and tested safe-hold behavior, independent of uplink and gateway availability | Research and hardware integration pending. |
| 5 | Third-party evidence | COSE/SCITT receipts, signed ledger heads, inclusion proof export, field drift measurements | Pending. |

## Audit requirement coverage

| Whitepaper requirement | Current evidence | Remaining acceptance test |
|---|---|---|
| R1 Non-bypassable enforcement | MCP built-ins now use the gate; operator-only calls deny; SROS2 Enforce demo exists | A production ROS 2 command-gate node owns `send_goal`, `cancel_goal`, and motion writes; a same-graph bypass attempt fails. |
| R2 Agent and robot identity | Ed25519 agent signatures and platform-signed mission outcomes | Verify a nonce-bound device quote against a trusted hardware root; never trust a request's claimed attestation grade. |
| R3 Delegator lineage | Configured gateways verify root, each parent, attenuation, expiry, and ancestor revocation | Make trusted roots mandatory for all library deployments; persist and test cascade revocation across nodes. |
| R4 Least privilege | Tool action scopes, force, velocity, geofence, corridor, localization checks | Bind payload, tool, cell, and robot identity to token and execution receipt; reject substitutions. |
| R5 Context freshness | Hardware and localization age gates; predictive snapshot path | Invalidate a permit when scene, sensor preconditions, or policy version changes at dispatch. |
| R6 Human approval | Production votes are signed by allowlisted non-agent keys and recorded individually | Add dashboard key custody, approval-to-plan digest binding, and a documented K-of-N signature profile. FROST remains research. |
| R7 Local autonomy | Offline edge dispatch verifier and optional file-backed replay store, tested across restart and concurrent runners | Require durable replay storage in deployment and drive a controller-specific safe hold on uplink loss or approval timeout. |
| R8 Safety separation | E-stop and PLC permit/interlock checks deny at the gate | Prove the safety controller acts independently and test a controller-rate shield on hardware. |
| R9 Audit and retention | Hash chain, signed HTTP proof, database mutation guard | Define and enforce record-class retention, legal hold, minimization, authority export, and external anchoring. |
| R10 Interoperability | MCP bridge, JSON Ed25519 tokens, DID helpers | Publish COSE/CWT/SCITT profiles and test independent verifier interoperability. |

**Other pipeline gaps:** Isolated Inspector and temporal plan checking remain
research. The legacy industrial receipt is never approval evidence; the V2
simulation path needs a real Gazebo/MoveIt adapter and attack tests against its
production verifier. Prediction-versus-observation drift comparison needs
signed outcomes from an actual device, numeric tolerances, and a field data set.

## Decisions and limits

- Keep `PolicyGateway.intercept()` as the authorization choke point. Simulation
  evidence is an input to the gate; a simulator never grants a permission.
- Keep the local safety controller below the gate. It may stop or constrain
  motion unconditionally; SINT must not command or override a safety PLC.
- Do not call the legacy `signed_by` industrial fixture a signature or a robot
  receipt. The V2 signed receipt and production verifier are separate paths.
- Production issuance needs a provisioned root key; an agent key alone is not a
  trust anchor. Development gateways without `trustedIssuers` remain explicitly
  unsuitable for a security claim until library configuration becomes mandatory.
- Publish separate counts for adversarial tests and fixture-shape tests. Require
  a real ROS graph, simulator, and hardware pilot before any robot enforcement
  or controller shield claim.

## Next implementation slice

1. Update the dashboard to sign vote payloads with operator-held keys and
   provision those keys separately from agent and proxy keys.
2. Add a network-target validation policy before enabling remote downstream
   transport; keep the current HTTP proxy loopback-only.
3. Wire the existing signed proof receipt into the ledger HTTP route, and
   define evidence retention by record class without deleting hash-chain events.
4. Require the durable edge replay store in deployments, then test a stale
   world snapshot at dispatch and a controller safe hold on link loss.
5. Build an adversarial conformance lane that runs those behaviors against
   production code, not fixture-only JSON assertions.

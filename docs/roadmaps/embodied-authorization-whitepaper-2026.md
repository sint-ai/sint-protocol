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
| 0B | Close MCP self-approval and process-spawn path | Agent cannot call approval, token minting, delegation or server-management tools; all built-ins traverse `intercept()` | Implemented in proxy; operator workflow needs a separate authenticated interface. |
| 0C | Proxy transport and credential isolation | Downstream receives only explicitly selected environment; HTTP Origin/Host and gateway CORS are deployment restricted; unsupported network transports reject private targets | Environment isolation and loopback HTTP/production CORS controls implemented. Remote downstream transport remains unsupported. |
| 0D | Evidence durability | Database refuses UPDATE, DELETE and TRUNCATE; signed proof served over HTTP; retention and authority export documented and enforced | Database guard and signed HTTP proof implemented; retention and authority export pending. |
| 1 | Signed decision and simulation receipts | Denials have signed, verifiable decision records; no simulator run is indeterminate; forged, stale, replayed and mismatched receipts deny | Predictive broker and V2 verifier landed in `8ba9660`; legacy industrial fixture now defaults to nonapproval. Decision proof route and attack reporting need review. |
| 2 | Scene-bound permits and edge continuity | Scene, robot, payload, policy and simulator digests bound; state change invalidates permit; nonce survives restart; offline runner holds a safe state | Snapshot binding exists in predictive path; durable nonce and controller hold pending. |
| 3 | Robot enforcement pilot | SROS2 Enforce mode plus a command-gate node owns action endpoints; direct actuator bypass fails in an actual ROS graph | Docker demonstration exists; product binding pending. |
| 4 | Continuous safety shield | Controller-rate barrier/QP filter and tested safe-hold behavior, independent of uplink and gateway availability | Research and hardware integration pending. |
| 5 | Third-party evidence | COSE/SCITT receipts, signed ledger heads, inclusion proof export, field drift measurements | Pending. |

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

1. Give the proxy per-server attenuated tokens instead of one `mcp://*` token,
   and move operator actions to an authenticated, signed operator API.
2. Add a network-target validation policy before enabling remote downstream
   transport; keep the current HTTP proxy loopback-only.
3. Wire the existing signed proof receipt into the ledger HTTP route, and
   define evidence retention by record class without deleting hash-chain events.
4. Persist edge replay state atomically, then test a consumed nonce after
   process restart and a stale world snapshot at dispatch.
5. Build an adversarial conformance lane that runs those behaviors against
   production code, not fixture-only JSON assertions.

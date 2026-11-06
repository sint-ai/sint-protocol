# Turbine generator authority example and call sheet

**Synthetic; no turbine connection. This demonstrates authorization plumbing, not turbine physics or command safety.**

This is a **synthetic conversation demo**, not a Thing-Zero integration or a turbine safety system. The generator is fictional. The demo opens no socket and uses no OPC UA client, so it cannot reach a device, network endpoint, broker, PLC, or customer system. Its one "controller" is an in-memory object passed into the script.

It uses the existing SINT OPC UA mapper, capability tokens, `PolicyGateway.intercept()`, approval queue, execution broker, deterministic simulator, and hash-chained evidence ledger.

## Run it

```bash
pnpm run build
```

```bash
pnpm run demo:turbine-authority
```

For a live call, pause at each step and press Enter to continue:

```bash
pnpm run demo:turbine-authority --step
```

For a 90-second version that skips the failure tour (steps 6a to 6c):

```bash
pnpm run demo:turbine-authority --short
```

To run the conformance test for this scenario:

```bash
pnpm --filter @pshkv/conformance-tests exec vitest run src/turbine-authority-conformance.test.ts
```

A full run exits 0. Any unexpected outcome stops the demo, names the step, and exits 1.

## Authority console

[console.html](console.html) is a visual version of the same story for screen sharing. Open it directly in a browser; it needs no build, no server, and no network:

```bash
open examples/turbine-authority/console.html
```

| Key | Action |
|---|---|
| Right arrow or Space | Play the next step. Press again during a step to finish it |
| Left arrow | Back one step |
| S | Switch to the 90-second story, which ends at the dispatch |
| A | Auto-play to the end (about a minute) |
| R | Restart |
| V, T | At step 7: re-hash the chain, or tamper with a copy |

The console is a **replay of a recorded run**. It shows the real ledger events and terminal output of one run of this demo, and it does not run the gateway. Step 7 is live: the browser recomputes SHA-256 for every recorded event, and "Tamper with a copy" changes one field in a copy to show where the chain breaks. A content security policy blocks all network requests. The font and icons are embedded (see [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt)).

To replace the recording with a fresh run:

```bash
pnpm run demo:turbine-authority:console
```

## Architecture

```text
 Fictional OPC UA nodes (names only; nothing is connected)
                    |
      AI agent asks to read or write a node
                    |
     OPC UA mapper: node + operation -> SINT request
                    |
     PolicyGateway.intercept()  <-- signed token, revocation list,
      |         |        |          central approval status,
    allow      deny   escalate      signed simulation receipt
      |         |        |
    read       stop   Operator approval queue
                         |  rejected: stop
                         |  approved:
                         v
                  Execution broker
                  - asks the gateway again
                  - checks the approval belongs to this exact request
                  - re-reads current state
                  - spends a one-time nonce
                         |
                  In-memory simulated controller
                  (one call, one receipt)

 Every decision, approval, and dispatch result goes to the evidence ledger (append-only, hash-chained).

 Outside this path and never touched by it:
 emergency stop, PLC protections, plant safety interlocks.
```

## 60-second talk track

> Today your system watches the generator and never touches it. The question is what has to be true before software may change anything.
>
> This is a fictional generator with no connection to anything. An agent reads bearing temperature with a read-only token, and that is allowed and logged. It tries to change the power setpoint with the same token and is refused: the token never granted that.
>
> A separate short-lived token can propose the change, but proposing is not doing. A person has to decide. A rejected request goes nowhere. An approval lets exactly that request through, one time, and we get a receipt.
>
> Then we break it. Approval plane down, token revoked after approval, the same command replayed: nothing reaches the controller. Every decision lands in a tamper-evident record.
>
> This does not replace your interlocks or emergency stop. It governs what software may ask for, in front of the safety systems you already trust.

## Run of show and expected outcomes

Allow 3 to 5 minutes. Controller calls are cumulative.

| Step | Expected outcome | Controller calls | Point to make |
|---|---|---|---|
| 1. Read bearing temperature | `allow`, `T0_observe`, ledger event printed | 0 | Observation stays cheap and logged |
| 2. Write setpoint, read-only token | `deny`, `INSUFFICIENT_PERMISSIONS` | 0 | Authority comes from the token, not from the agent's intent |
| 3. Propose with control token | `escalate`, `T2_act` | 0 | Proposing is not doing |
| 4. Operator rejects, then approves a separate proposal | Rejected proposal refused with `APPROVAL_REQUIRED`; second proposal approved | 0 | A rejected request has no approval, so it cannot dispatch |
| 5. Dispatch | Broker dispatches; controller receipt printed | 1 | The approved request, one time |
| 6a. Central approval unavailable | `deny`, `EDGE_CENTRAL_UNAVAILABLE`; broker refuses with `AUTHORIZATION_NOT_EXECUTABLE` | 1 | No approval plane means no control action; reads can continue |
| 6b. Token revoked after approval | Broker refuses with `AUTHORIZATION_VERIFICATION_FAILED` (`TOKEN_REVOKED`) | 1 | Authority is checked again at dispatch |
| 6c. Replay step 5 | Broker refuses with `SIMULATION_RECEIPT_REPLAYED` | 1 | An authorization cannot be used twice |
| 7. Verify evidence | Chain verified; chronological summary printed | 1 | Editing any past event breaks the chain |

The tail of a successful run looks like this. IDs, times, and hashes change every run:

```text
7. Verify the evidence chain
  #01 07:40:38  gateway allow T0_observe  [sensor read, read token]
  #02 07:40:38  gateway deny T3_commit INSUFFICIENT_PERMISSIONS  [write with read-only token, read token]
  #05 07:40:38  gateway escalate T2_act  [proposal 1, control token 1]
  #07 07:40:38  operator rejected (operator-on-shift)  [proposal 1, control token 1]
  #15 07:40:38  operator approved (operator-on-shift)  [proposal 2, control token 2]
  #18 07:40:38  dispatched to simulated controller  [proposal 2, control token 2]
  #35 07:40:38  dispatch refused SIMULATION_RECEIPT_REPLAYED  [proposal 2, control token 2]
  35 append-only events (18 key events shown); chain verified
  Controller calls in total: 1
```

Rejection and approval use separate proposals in one run, each with its own token, request, and evidence.

Early denials carry the gateway's conservative T3 label. The authorized setpoint proposal itself is classified T2 and escalated.

**Pacing.** In the terminal, the control token and simulation evidence last 10 minutes, and steps 4 to 6c must fit inside that. If step 5 runs too late, it is denied and the demo stops; run it again. If only step 6c runs too late, the replay is still refused with zero new calls, but the printed reason is the expiry rather than `SIMULATION_RECEIPT_REPLAYED`. The console is a replay and has no such limit, so it is the safer choice for a conversation that may wander.

## Claim ledger

Use this to answer "does it do X?" without overclaiming.

| Claim | Status |
|---|---|
| A read-only token cannot write the setpoint | Demonstrated |
| A control action waits for an operator on a signed quorum | Demonstrated; the operator name is not authenticated |
| Approval, value, token, and receipt are bound to one request | Demonstrated |
| One approved request dispatches at most once | Demonstrated in one process; not across restarts |
| Approval plane down, revoked token, and replay are all denied | Demonstrated; the plant simply holds its last state |
| Tampering with a recorded event is detected | Demonstrated; the chain head is not anchored elsewhere |
| The setpoint took effect | Not shown: the simulated controller acknowledges, and nothing reads the state back |
| The command was predicted to be safe | Not claimed: the receipt comes from a placeholder model |
| Works on Thing-Zero's command path | Requires their interface; OPC UA is an assumption |
| Setpoint range, ramp limits, operating mode, alarm conditions | Requires safety engineering; not enforced |
| T2 is the right tier for a generator setpoint | Requires their hazard analysis. T2 is SINT's default for any OPC UA write, and names like `.Trip` get it too, so real nodes need explicit rules |

## What is enforced and what is illustrative

Enforced by running code in this demo:

- Token scope, signature, expiry, trusted issuer, and revocation.
- T0 and T2 classification of the OPC UA read and write.
- Denial by default when the central approval plane is unavailable. Reads continue.
- An approval quorum signed into the control token. Votes from names outside it are ignored.
- Binding of the receipt and approval to the exact request, so an approved 900 cannot become 1,800.
- At-most-once dispatch through a one-time nonce, including concurrent attempts.
- A rejected request is closed. Only a new proposal can reach an operator.
- The requested value, the approval, and the controller's acknowledgment are all in the hash chain.
- Hash chaining of the evidence, so an edit to a past event is detected.

Illustrative, and not to be presented as a capability:

- **The 900 kW setpoint.** Nothing limits this number. The signed token has no general power constraint, and an absurd value escalates exactly like a sensible one (the conformance test pins this). `maxPowerWatts` exists only inside `hazardousEnergyEnvelope`, which covers laser, welding, thermal, and radiation actuators, and the gateway denies any token carrying that envelope with `HAZARDOUS_ENERGY_ENFORCEMENT_UNAVAILABLE`. The operator approves a specific value; SINT does not judge whether it is safe. Equipment limits are for Thing-Zero's engineers to set.
- **The simulation receipt.** It is really signed and really checked, but its model is a placeholder that evaluates no turbine physics. Its "pass" says nothing about the generator.
- **Operator identity.** `operator-on-shift` is an unauthenticated string in this script. The gateway server has a signed-approval option, which this demo does not use.
- **Decision and approval provenance.** The broker's verifier is demo code, because the repository ships the interface but no production implementation. It trusts in-process object identity. `PolicyDecision` is not signed, so a deployment across processes would need signed decisions and approvals.
- **The re-check at dispatch.** The broker does not check revocation or central availability itself. Those cases are caught because this demo's verifier calls `PolicyGateway.intercept()` again. A real integration must do the same. A small window remains between that check and the controller call.
- **The path to the controller.** The broker is the demo's only route to the controller by convention. A deployment must give the broker the only credential or network path to the device; the demo does not show that.
- **Agent path only.** SINT here governs what an AI agent asks for. It does not sit on HMI, manual, or protection paths.
- **Durability.** The ledger, nonce store, and revocation list live in memory and vanish on exit. Single dispatch across restarts needs a durable nonce store.
- **Evidence anchoring.** The chain is unsigned and its head is not stored anywhere else, so someone able to rewrite the whole log could recompute it. Proving that needs the head hash anchored outside the system.
- **Evidence windows.** The demo widens the receipt and world-state age limits from their 30-second and 5-second defaults to 10 minutes so a person can talk over it.
- **OPC UA.** This demo uses only the resource mapper from `@pshkv/bridge-opcua`. Node names, the bearing temperature, and the `.invalid` endpoint are invented, and are not Thing-Zero interfaces or turbine operating limits.
- **The console.** It replays a recording, so only the step 7 hash check happens live.
- **Ledger event names.** The broker's `execution.*` events are recorded as `action.completed` and `action.failed`, the closest existing ledger types, with the original name in the payload.

**Emergency stop.** The demo does not model an emergency stop and never routes one through approval. It belongs on the plant's own hardwired path. SINT's default rules would send an OPC UA write to an `*estop*` node to T3 human approval, which is exactly why a stop command must not travel this route.

## Simple SINT explanation

**One sentence:** SINT checks whether an AI-proposed action is authorized before it can reach a physical system, then records the decision.

```text
Sensors / Thing-Zero edge and analytics
                |
        AI proposes an action
                |
      SINT protocol adapter
                |
   Capability token + policy gateway
       | allow | deny | ask a human
                |
     Audited execution boundary
                |
        Existing OT controller
                |
  Independent plant safety interlocks
```

The adapter translates an OT operation such as an OPC UA read or write into a standard SINT request. A signed capability token identifies the agent, permitted resource and action, and any applicable limits. The policy gateway evaluates every request. Read-only observation can be logged and allowed. A proposed physical change is reviewed according to its consequence and site policy. The evidence ledger records the decision in an append-only hash chain. The execution boundary must only dispatch a command backed by authorization. Existing PLC protections, turbine controls, and independent safety systems still perform their own jobs.

For this call, avoid promising that any turbine setpoint is safe to automate or that a specific response time is suitable. Those depend on their controller, hazard analysis, process limits, and connectivity model.

## Fifteen-minute call flow

Lead with Chris's architecture. Show the demo only if he asks how SINT would sit in the control path, and start with the 90-second version. In speech, say "the requested setpoint" rather than quoting 900 kW.

1. **First 6 minutes:** Ask Chris to walk through the device, cloud analytics, current read-only boundary, and proposed future control path.
2. **Next 5 minutes:** Reflect his architecture back. Use the one-sentence SINT explanation and, if useful, the synthetic demo with the 60-second talk track.
3. **Last 4 minutes:** Agree on one narrow technical follow-up and who would own it.

## Questions for a possible collaboration

Pick two or three during the call; use the rest in a follow-up.

1. What exact control action is the first candidate after read-only monitoring: advisory recommendation, operator-approved setpoint, or autonomous response?
2. What protocol and command boundary reaches the controller: OPC UA, Modbus, MQTT/Sparkplug, a vendor API, or something else? Where can a pre-execution gate sit?
3. Which limits are fixed by the equipment and safety case, and which may an operator authorize per action? What does the system do if cloud connectivity or approval is unavailable?
4. What should the operator see to approve a proposed action: sensor trend, model confidence, predicted consequence, current operating mode, and rollback plan?
5. What evidence must be retained after a decision: proposed command, identity, authority, approvals, measured outcome, and incident trace?
6. Could we jointly define a **single synthetic use case** with a sensor read, anomaly alert, proposed control action, deny case, approval case, and offline case? Who can provide a protocol schema or simulator, with no plant credentials or production access?

## Suggested follow-up artifact

A small shared test plan for one command: exact resource and action names, token scope, physical limits from their engineers, approval rule, edge outage behavior, simulator interface, and expected evidence. This should be agreed after seeing their architecture.

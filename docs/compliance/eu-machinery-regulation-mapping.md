# EU Machinery Regulation (EU) 2023/1230 Mapping

> Engineering crosswalk, not legal advice or a declaration of conformity.
> Product classification and the applicable conformity-assessment route must
> be determined for the complete machinery by the manufacturer and, when
> required, a notified body.

Regulation (EU) 2023/1230 generally applies from **20 January 2027**. It does
not impose mandatory third-party assessment on every AI-controlled machine.
The especially relevant Annex I, Part A category is a **safety component with
fully or partially self-evolving behaviour using machine-learning approaches
that ensures safety functions**. Article 25 sets different assessment routes
for Annex I Part A, Annex I Part B, and machinery not listed in Annex I.

This scope distinction matters: an agent that commands machinery is not, by
that fact alone, the Annex I Part A ML safety component. SINT can contribute
runtime controls and evidence to a machinery safety case, but the repository
does not claim that SINT itself is CE marked, certified, or a substitute for a
safety-related control system.

Primary text: [Regulation (EU) 2023/1230 on EUR-Lex](https://eur-lex.europa.eu/eli/reg/2023/1230/oj/eng).

## Engineering evidence crosswalk

| Regulation concern | Relevant SINT mechanism | Evidence available now | Important limitation |
|---|---|---|---|
| Prevent corruption of safety-related control behaviour (Annex III 1.1.9 and 1.2.1) | Signed, scoped capability tokens; revocation; request validation | Capability-token and gateway conformance tests | Does not establish machinery-level cybersecurity or safety integrity |
| Safe control-system behaviour and prevention of hazardous commands | `PolicyGateway.intercept()` choke point, physical constraints, forbidden sequences | Gateway and bridge regression fixtures | The gateway is an application-layer control, not a certified safety PLC |
| Traceability of interventions and decisions | Append-only SHA-256 hash-chained `EvidenceLedger` | Ledger integrity tests and generated conformance artifacts | Tamper evidence is not the same as independent assessment or secure retention |
| Human intervention and stop | T2/T3 approval paths and unconditional e-stop transition | DFA, approval, and e-stop conformance tests | Deployment must prove stop latency and independence on the actual machine |
| Software/configuration change control | Model fingerprints, signed effect packs, token-bound limits | Signed-effect-pack and model-fingerprint fixtures | No notified-body assessment, lifecycle QMS, or ten-year support commitment |
| Reproducible verification | Machine-readable fixtures and CI reports | `packages/conformance-tests`, `docs/reports/` | Most results are self-produced; independent replication is still required |

## Gaps before a conformity-assessment claim

1. Classify the complete product and identify whether Annex I Part A, Part B,
   or the non-listed route applies.
2. Build the Annex IV technical file for the actual machinery, including its
   risk assessment, drawings, control architecture, standards, validation,
   instructions, and declarations.
3. Validate deterministic safety functions below the model on representative
   hardware, including fault injection, human-presence cases, stop time, and
   worst-case communications loss.
4. Establish configuration management, secure update, vulnerability handling,
   retention, and support processes for the required product lifecycle.
5. Obtain independent test reproduction and engage an eligible notified body
   when the selected Article 25 route requires one.

The evidence ledger is useful input to those activities. It is not “third-party
proof” until an independent assessor has reviewed the defined product, test
method, results, and lifecycle controls.

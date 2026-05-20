# Bug Bounty Launch Plan

Issue: [#72](https://github.com/sint-ai/sint-protocol/issues/72)

This page is a launch-ready planning draft for a public SINT Protocol bug bounty program. It is intentionally non-binding until maintainers choose a platform, approve funding, and publish the final scope on the selected platform.

## Launch status

| Item | Draft recommendation | Owner before launch |
| --- | --- | --- |
| Platform | Immunefi for crypto/economic-security reach; HackerOne if broader industrial/robotics researchers are the priority. | Engineering management |
| First scope | Protocol packages, policy gateway, conformance fixtures, SDK request signing, and public docs that affect safety/security claims. | Security lead |
| Funding | Ring-fence the first 90-day reward budget before public launch. | Finance / foundation |
| Intake | Private platform reports only; no public GitHub vulnerability reports. | Security triage owner |
| Launch gate | Dry-run one report from intake to disclosure decision before announcing. | Engineering management |

## Recommended starting scope

### In scope

- `packages/policy-gateway`: authorization, decision caching, replay handling, and enforcement boundaries.
- `packages/conformance-tests`: fixtures that determine whether an integration is certified/safe.
- `packages/bridge-iot` and related hardware-safety bridge code: permit/deny handshakes, stale-signal handling, and fail-safe behavior.
- `sdks/typescript`: request signing, client-side validation, policy metadata handling, and SDK examples that could create unsafe deployments.
- `docs/guides`, `docs/specs`, and `docs/compliance`: security or safety claims that could mislead integrators if materially wrong.

### Out of scope for the first 90 days

- Denial-of-service requiring excessive traffic, live scanning, or degradation of third-party services.
- Vulnerabilities requiring physical access to equipment the reporter does not own or have explicit permission to test.
- Social engineering, phishing, spam, credential stuffing, or attacks on maintainers and users.
- Issues only present in unsupported forks, debug-only builds, or local configurations that contradict documented deployment guidance.
- Generic dependency reports without a SINT-specific exploit path or reachable impact.

## Draft severity and reward tiers

These are placeholders for budgeting and platform configuration. Publish final amounts only after funding is approved.

| Severity | Example impact | Draft reward range |
| --- | --- | --- |
| Critical | Unauthorized policy bypass that can allow unsafe physical action, forged certification evidence, or remote compromise of a production gateway. | USD 10,000-50,000 |
| High | Privilege escalation, signature/replay flaw, or conformance bypass that materially weakens safety or economic controls. | USD 2,500-10,000 |
| Medium | Security boundary confusion, unsafe default, or docs/API mismatch likely to cause insecure deployment. | USD 500-2,500 |
| Low | Hardening issue with limited exploitability, missing validation, or minor disclosure/process weakness. | USD 100-500 |

## Report template

Every valid report should include:

1. Affected package, commit SHA, and environment.
2. Clear impact statement tied to authorization, safety, certification, or economic enforcement.
3. Minimal reproduction steps or a failing test/fixture.
4. Expected vs actual behavior.
5. Suggested remediation, if known.
6. Whether the issue was tested only against local code or an explicitly authorized deployment.

## Triage SLA

| Stage | Target |
| --- | --- |
| Initial acknowledgement | 3 business days |
| Repro/impact classification | 10 business days |
| Fix owner assigned | 15 business days for valid High/Critical reports |
| Disclosure decision | Coordinated with reporter after fix or mitigation is available |
| Reward decision | After impact is confirmed and duplicate status is checked |

## Safe harbor draft

SINT should authorize good-faith research only when researchers:

- Test against local code, their own deployments, or explicitly authorized environments.
- Avoid privacy violations, data destruction, service degradation, and unsafe physical actions.
- Stop and report immediately if they encounter sensitive data, live credentials, or physical-safety risk.
- Give maintainers reasonable time to remediate before public disclosure.

Final safe-harbor text should be reviewed by legal counsel before the program goes live.

## Disclosure pipeline dry run

Before public launch, run one internal rehearsal:

1. Create a fake but realistic report against `packages/policy-gateway`.
2. Confirm the platform/intake path routes to the private security owner.
3. Reproduce the issue in a local sandbox.
4. Assign severity and draft a remediation issue without leaking exploit details.
5. Prepare a release note and coordinated disclosure response.
6. Confirm the reward decision record can be stored privately.

## Launch checklist

- [ ] Choose Immunefi, HackerOne, or a self-hosted private intake for the first 90 days.
- [ ] Approve the first reward budget and maximum single-report payout.
- [ ] Confirm the security contact in `SECURITY.md` is monitored.
- [ ] Publish final in-scope repos/packages and first supported release/commit range.
- [ ] Publish out-of-scope boundaries and safe-harbor terms.
- [ ] Run the disclosure dry run and record the result privately.
- [ ] Announce the live program from the official SINT channels.

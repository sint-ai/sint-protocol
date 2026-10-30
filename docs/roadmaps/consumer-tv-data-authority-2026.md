# Consumer TV Data Authority

## Purpose

Create a SINT deployment track that gives the household—not the television
manufacturer or an advertising intermediary—cryptographically enforceable
control over a connected television's sensing, data collection, data egress,
and high-impact device actions.

This is a governance and enforcement product, not a claim that every existing
television can be retrofitted. SINT can only enforce at a point it controls:
an OEM/OS integration, a trusted local companion, or a managed network
gateway. A network-only deployment can contain and audit network behavior, but
cannot reliably inspect encrypted payloads or prove that a compromised device
is not recording locally.

## Why This Track Exists

Automatic content recognition (ACR) is an operating-system-level tracking
mechanism, distinct from ordinary third-party app analytics. Academic
measurement of LG and Samsung TVs found that it can operate when a TV is used
as an external HDMI display; in that study, opting out stopped ACR network
traffic. [1] LG Ad Solutions markets a direct-to-glass advertising model using
ACR-derived audience insights and cross-screen retargeting. [2]

The policy and enforcement environment has also changed. Texas announced in
May 2026 that its LG settlement requires an informed-consent ACR model, a TV
disclosure, and a simple opt-out path for viewing-data collection. [3] This
does not establish the security claims in any individual investigation, but it
does demonstrate an immediate, independently verifiable requirement for clear
consent and revocation. Historical enforcement is similarly clear: the FTC's
2017 Vizio settlement addressed undisclosed collection of viewing histories
across broadcast, streaming, and external inputs. [4]

The supplied investigation transcript raises additional allegations about
voice capture, local retention, device discovery, and exploitability. Those
claims should be treated as allegations pending the researchers' full
technical disclosure and vendor response; do not use them as product facts or
make them the basis of a public security claim. The track below addresses the
risk classes regardless: covert sensing, cross-device profiling, unauthorized
egress, stale consent, and compromise containment.

## Product Thesis

The right primitive is a **Household Data Capability**: a short-lived,
revocable capability token that permits one precisely described data flow.
It makes collection and egress separate authorizations, binds each to a
purpose and recipient, and writes a tamper-evident receipt.

Example: a household may authorize `tv://living-room/display/acr-fingerprint`
to create a content fingerprint only while LG Channels is active, only for
recommendation quality, only to a named endpoint, and only until midnight. It
does not authorize microphone access, raw-frame retention, advertising use,
cross-device matching, or later forwarding to another recipient.

## Reference Architecture

```text
TV OS / media app / microphone / camera
              |
   Consumer Media Bridge (OEM or trusted local companion)
              |
        PolicyGateway.intercept()
    /           |              \
capability   consent/revocation  risk policy
tokens       + receipts          + household profile
              |
       EvidenceLedger (append-only)
              |
 Network egress gateway / DNS allow-list / quarantine VLAN
```

The bridge never decides whether collection or transfer is permitted. It maps a
device operation to a `SintRequest` and passes it through
`PolicyGateway.intercept()`. The gateway remains the sole authorization choke
point. In an OEM deployment, the bridge is called before sensor activation,
fingerprint generation, storage, upload, device discovery, and firmware update.
In a gateway deployment, the network layer enforces egress destination,
transport, rate, device segment, and quarantine policy, while explicitly
reporting payload visibility limits.

For continuous sensing, an authorization must cover an effect lifecycle rather
than only its initial command: `activate` creates a named effect, `renew`
requires a fresh gateway decision before continued operation, and `stop` is a
separate auditable operation. A production integration must bind the physical
sensor/runtime to expiry, revocation, failed renewal, and emergency-stop
signals; the bridge models these operations but cannot itself force an opaque
vendor device to stop.

## Authority Model

| Operation | Default tier | Required authority | Default result |
|---|---:|---|---|
| Read local playback state | T0 | device-local capability | allow and log |
| Collect diagnostics with no identifier | T1 | bounded diagnostics capability | allow and receipt |
| Create an ACR fingerprint | T2 | purpose-bound viewing capability | explicit approval |
| Capture microphone, camera, or raw screen content | T3 | separate sensor capability + visible indicator proof | deny by default; quorum approval only where lawful |
| Upload, match, or share a fingerprint | T2 | recipient-bound egress capability | explicit approval |
| Cross-device/household identity linking | T3 | named-purpose, recipient, retention, and revocation terms | deny by default |
| Discover LAN devices or Wi-Fi environment | T2 | network-inventory capability | deny by default |
| Firmware update / remote management | T2 | vendor identity and signed-update proof | approve or block |

The tier table is a safe starting policy, not a legal classification. A
jurisdictional policy pack must be able to raise a tier or make a category
non-delegable. Physical privacy indicators should be independently attestable
where hardware supports it; an on-screen indicator alone is not sufficient
evidence for a camera or microphone permission.

## Minimum Viable Product

### 1. Consumer-media policy surface

Add `@pshkv/bridge-consumer-media`, initially with a vendor-neutral media
operation model rather than reverse-engineering a private LG interface.

- Resource URIs: `tv://{home}/{room}/{device}/{sensor|display|network}/{operation}`.
- Actions: `collect`, `fingerprint`, `retain`, `upload`, `share`, `discover`,
  `activate`, `update`, and `remote-admin`.
- Data labels: `playback-metadata`, `acr-fingerprint`, `raw-frame`,
  `ambient-audio`, `voice-transcript`, `camera-frame`, `lan-inventory`, and
  `wifi-environment`.
- A `dataEgress` constraint binds data label, purpose, recipient identity,
  endpoint, jurisdiction, maximum volume, retention deadline, and onward-share
  prohibition.

### 2. Household Data Capability and receipts

Extend capability-token constraints without weakening attenuation:

- child tokens may narrow recipient, purpose, time, data class, volume, or
  retention; they may never broaden any of them;
- consent is explicit, expires, is revocable, and is bound to a household
  authority key rather than a vendor account alone;
- every collection, denial, upload, and revocation produces a hash-chained
  receipt with a payload digest—not raw sensitive content;
- consent change is an event, not a mutable flag, preserving the audit trail.

### 3. Managed-home enforcement profile

Ship a `home-media-private` deployment profile:

- deny microphone/camera/raw-frame collection, LAN discovery, and cross-device
  matching unless a matching capability is presented;
- default-deny new egress destinations, permit only signed vendor update and
  time services through an allow-list, and place TVs on an isolated VLAN;
- rate-limit telemetry and alert on destination changes, unexpected traffic
  volume, consent/behavior mismatch, and revoked-token use;
- revoke immediately on a household panic action and quarantine the device.

### 4. Proof-oriented dashboard

Add a household-facing view to the existing approval experience:

- a plain-language live signal: "microphone off / no authorization" rather
  than a vague privacy toggle;
- approve once, approve until time, deny, and revoke controls;
- an exportable, verifiable timeline of what was requested, why, to whom, and
  whether it was transferred;
- a prominent capability boundary: "network-enforced" versus "OS-enforced."

## Delivery Plan

| Window | Deliverable | Exit criteria |
|---|---|---|
| Weeks 0–2 | Threat model, privacy vocabulary, policy schemas, and adversarial conformance fixtures | Coverage for no-token denial, attenuation, expiry, revocation, recipient mismatch, and raw-content redaction |
| Weeks 3–6 | `bridge-consumer-media`, Household Data Capability, ledger receipt schema, `home-media-private` profile | All operations route through `PolicyGateway.intercept()`; no bridge-side authorization; CI conformance green |
| Weeks 7–10 | Network enforcement reference adapter and dashboard consent/revocation flow | Egress allow-list, segmentation, quarantine, receipt export, and a clear statement of encrypted-payload limits |
| Weeks 11–14 | Hardware/OEM integration kit | Signed sensor-indicator attestation interface, OEM integration guide, and independent security review scope |
| Weeks 15–18 | Controlled household pilot | Consent usability study, false-denial/alert metrics, telemetry minimization review, and a public, non-sensitive evidence report |

## Validation and Non-Negotiables

- No sensor, fingerprint, retention, or transfer request bypasses
  `PolicyGateway.intercept()`.
- Tokens are attenuation-only; an app cannot turn a diagnostics permission into
  an advertising or cross-device identity permission.
- The ledger records metadata and content hashes only; it never becomes a new
  store of voice, video, screenshots, or viewing history.
- A revoked token blocks new activity immediately. Existing queued transfers
  must be cancelled and logged.
- Network containment is not represented as proof that local collection did
  not occur. The dashboard must show the enforcement boundary truthfully.
- No vendor-specific reverse engineering, traffic interception, or vulnerability
  exploitation belongs in the first release. Obtain a documented OEM API or
  limit the implementation to network-policy controls.

## Strategic Sequence

Do this before another broad consumer bridge. It converts SINT's existing
consumer foundations—Home Assistant, Matter, `home-safe`, Delta-human, token
delegation, approvals, and the evidence ledger—into a concrete privacy and
data-authority product. It also creates a reusable pattern for speakers,
cameras, home robots, and connected appliances: sensor permission plus
purpose-bound egress, independently auditable and revocable by the household.

The first external ask should be an OEM, open-source media platform, router
vendor, or consumer-privacy lab willing to test the open policy/receipt model.
Do not lead with an assertion that SINT "fixes LG TVs." Lead with a verifiable
claim: **SINT provides enforceable, revocable data authority wherever it is
deployed at the OS, companion, or network control point.**

## Sources

1. Gianluca Anselmi et al., "[Watching TV with the Second-Party: A First Look
   at Automatic Content Recognition Tracking in Smart TVs](https://arxiv.org/abs/2409.06203),"
   ACM IMC, 2024.
2. LG Ad Solutions, "[Seize the Screen: Advantages of Leveraging a
   Direct-To-Glass Strategy](https://lgads.tv/insights/seize-the-screen-advantages-direct-to-glass/),"
   2023.
3. Office of the Attorney General of Texas, "[Attorney General Ken Paxton
   Secures Major Agreement With LG to Protect Texans’ Privacy and Stop Data
   from Being Collected Without Their Knowledge](https://www.texasattorneygeneral.gov/news/releases/attorney-general-ken-paxton-secures-major-agreement-lg-protect-texans-privacy-and-stop-data-being),"
   May 11, 2026.
4. Federal Trade Commission, "[VIZIO to Pay $2.2 Million to FTC, State of New
   Jersey to Settle Charges It Collected Viewing Histories on 11 Million Smart
   Televisions without Users’ Consent](https://www.ftc.gov/news-events/news/press-releases/2017/02/vizio-pay-22-million-ftc-state-new-jersey-settle-charges-it-collected-viewing-histories-11-million),"
   February 6, 2017.
5. LG USA, "[How to Accept the Updated User Agreements on Your LG
   TV](https://www.lg.com/us/support/help-library/seeing-a-user-agreements-screen-on-your-lg-tv-CT10000018-20155426555618),"
   September 2, 2026.
6. National Vulnerability Database, "[CVE-2022-23727](https://nvd.nist.gov/vuln/detail/CVE-2022-23727),"
   updated June 17, 2026.

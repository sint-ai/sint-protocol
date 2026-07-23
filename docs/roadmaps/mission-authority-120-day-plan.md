# Mission Authority 120-Day Execution Plan

Start date: June 6, 2026

The objective is to create the evidence required to open a $12M-$18M Series A
process. Repository breadth is not a financing milestone. A paid prototype,
named design partners, operational demonstration, independent review, and a
credible U.S. defense operating structure are.

## Days 0-45: Product Extraction

Engineering exit criteria:

- stable `MissionManifest`, `AuthorityDecision`, `OperatorAuthorization`,
  `EffectConstraint`, and `MissionEvidenceBundle` contracts;
- offline Rust edge evaluator with signature-verifier and hardware-signer ports;
- attenuation-only delegation tests;
- portable signed evidence bundles;
- PX4 and ROS 2 conformance coverage;
- SPDX SBOM generation and reproducible release checklist;
- public code contains no customer mission data or controlled technical data.

Company exit criteria:

- Delaware corporation and IP assignment completed;
- export-control counsel retained;
- controlled-data repository and U.S.-person access policy designed;
- SAM.gov, UEI, and CAGE registration initiated;
- CMMC Level 2 enclave and assessment roadmap approved.

## Days 46-90: Operational Demonstration

Build one PX4 air and one ROS 2 ground demonstration around the same protocol.
The scripted acceptance run must show:

1. valid mission execution;
2. wrong-platform and unauthorized mission denial;
3. expired and revoked authority denial;
4. geographic-boundary denial;
5. communications-loss safe response;
6. compromised-autonomy isolation;
7. operator quorum for supervised effects;
8. unconditional e-stop;
9. signed evidence replay and mutation detection.

Run hardware-in-the-loop where available. Publish only unclassified, synthetic
mission data. Contract an independent security review before day 90.

## Days 91-120: Buyer Validation

Required financing gates:

- three named design partners covering an autonomy vendor, integrator or prime,
  and government test organization;
- one paid prototype between $250K and $750K;
- written confirmation of operational requirement, integration owner, budget
  owner, test venue, and production-transition route;
- preliminary assurance case mapped to DoD Directive 3000.09;
- reference architecture for on-platform, tactical-node, and disconnected use.

Do not formally open the Series A until at least four of the five gates are met,
including the paid prototype.

## Months 5-18: Production Readiness

- TPM/HSM identity, secure boot evidence, anti-rollback, remote attestation, and
  signed updates;
- disconnected revocation with bounded freshness;
- formal verification for attenuation, no-bypass, quorum, and e-stop;
- CMMC Level 2-ready engineering environment;
- live testing across air, ground, and maritime or fixed-site platform families;
- hardened console, integration packs, assurance exports, and support model.

## Fundraising Package

Raise target: $15M, with a $12M minimum and $18M hard cap.

Use of funds:

- 45% engineering;
- 20% platform integration and field testing;
- 15% security and compliance;
- 15% defense programs and business development;
- 5% operations.

Core narrative: every autonomous defense platform needs an independent authority
layer. The evidence room must contain the live demonstration, test report,
security review, design-partner documents, paid-prototype agreement, compliance
roadmap, hiring plan, and 24-month operating model.

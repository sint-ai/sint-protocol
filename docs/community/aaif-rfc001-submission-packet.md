# AAIF RFC-001 Submission Packet

Status: Gmail draft created, awaiting operator send

## Tracking

- GitHub issue: `#130`
- Gmail draft ID: `r-2078090681071797042`
- Recipient: `aaif-governance@linuxfoundation.org`
- Subject: `RFC contribution - SINT Protocol Policy Bundle Specification`

## Submitted Artifact

- RFC: `docs/rfcs/RFC-001-policy-bundle.md`
- Public URL: `https://github.com/sint-ai/sint-protocol/blob/main/docs/rfcs/RFC-001-policy-bundle.md`
- Related vocabulary PR: `https://github.com/aeoess/agent-governance-vocabulary/pull/11`

## Draft Body

```text
The SINT Protocol team is contributing RFC-001 for consideration by the AAIF working group as a proposed governance standard. The specification defines a machine-readable contract for agent authorization covering action allowlists, path constraints, rate limiting, human approval gates, hash-chained receipts, APS identity integration, A2A task extension format, and cascade revocation. Section 11 includes explicit AAIF compliance mapping.

RFC: https://github.com/sint-ai/sint-protocol/blob/main/docs/rfcs/RFC-001-policy-bundle.md

Three-vendor governance_attestation convergence already in progress (APS, MolTrust, SINT) via A2A#1717. We are seeking co-authorship of the AAIF governance spec and the reference implementation designation.

- Illia Pashkov, SINT Labs
```

## Send Checklist

- [x] RFC-001 published in repo
- [x] Vocabulary PR open
- [x] Gmail draft created
- [ ] Email sent to AAIF
- [ ] AAIF response recorded
- [ ] RFC referenced in AAIF docs or follow-up thread

## Follow-Up Template

```text
Thanks for reviewing RFC-001. We are happy to adapt the Policy Bundle format to the AAIF governance vocabulary and contribute conformance fixtures or reference implementation hooks where helpful.

The repo now tracks evidence separately from claims, so we can scope this as a draft contribution, a reference implementation candidate, or a working-group input depending on what is most useful for AAIF.
```

# Adopters And Deployment Evidence

This page tracks external usage evidence for AAIF resubmission readiness.

The operating rule is simple: classify evidence by what is actually running, not
what is planned.

## Status Levels

### Evaluation

Use this status when an organization is assessing SINT but has not enabled it in
an operational workflow.

Typical signals:

- architecture review
- local lab validation
- short proof-of-concept runs

### Pilot

Use this status when SINT is running in a bounded operational scope with named
users, time window, and success criteria.

Typical signals:

- limited fleet or site rollout
- operator workflow tied to SINT approvals or denials
- periodic evidence export and review

### Production

Use this status only when SINT is part of day-to-day operations in a live
environment.

Minimum signals:

- named deployment owner
- persistent runtime (not one-off demo)
- clear operational dependency on SINT controls or evidence

## Independence Rules

Do not count a deployment as independent for AAIF Gate 1 when it is from the
current co-design or interop collaboration cluster.

Track each record with this field:

- `Independent from co-design network: yes | no | unsure`

## Evidence Template

Use the same structure for every entry:

```text
Organization:
Status: evaluation | pilot | production
Independent from co-design network: yes | no | unsure
SINT component(s):
Date range:
Public evidence URL(s):
Deployment owner/contact:
Notes:
```

## Where To File New Records

Open a GitHub issue with the **Production Adopter / Pilot Record** template:

- `.github/ISSUE_TEMPLATE/production_adopter.yml`

Each accepted issue should be reflected in the table below.

## Current Records

| Organization | Status | Independent | Date range | Evidence URL | Notes |
| --- | --- | --- | --- | --- | --- |
| _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | Add records from validated public issues |

# Persona AI Shipyard Safety Brief

Status: outreach-ready technical brief

Persona AI is building industrial humanoid robots for heavy industry, including
shipyards, energy, construction, and manufacturing. Public materials emphasize
work such as welding, fabrication, inspection, supervisor coordination,
bystander awareness, and robot-to-robot collaboration.

SINT can help by acting as the runtime governance and evidence layer between
Persona-style humanoid intent and physical execution.

## Core Fit

Persona's problem is not only making a humanoid move or weld. In production,
shipyards need to answer:

1. Was this robot authorized to perform this action?
2. Were the right permits active?
3. Was the workspace safe for humans and other robots?
4. Was the welding or manipulation path reviewed before execution?
5. Can a supervisor, customer, or surveyor reconstruct what happened later?

SINT is built for that boundary.

## SINT Value for Persona-Style Deployments

### 1. Shipyard Safety Policy Gateway

Every high-consequence robot action can route through
`PolicyGateway.intercept()` before execution:

- start welding arc
- start grinder
- enter confined space
- lift material
- move through shared work zone
- release robot-to-robot handoff
- execute emergency stop rollback

### 2. Hot-Work and Welding Evidence

SINT can bind a welding request to:

- hot-work permit
- fire-watch readiness
- fume extraction status
- gas-monitor status
- weld procedure reference
- simulation receipt digest
- offline program hash
- supervisor approval

### 3. ABS-Style Remote Survey Support

SINT can export hash-chained evidence for:

- policy decision and assigned tier
- safety-controller context
- robot and work-order identifiers
- sensor calibration references
- simulation receipt and program digest
- event hash and previous hash

This supports review and incident reconstruction. It does not replace
classification society assessment or product approval.

### 4. RaaS Fleet Governance

For robot-as-a-service deployments, SINT can enforce customer/site policy:

- per-site action limits
- operator approval rules
- tenant-specific permit requirements
- update and model-change gates
- evidence retention and export

## Pack Built in This Repo

Executable fixture:

- `packages/conformance-tests/fixtures/industrial/industrial-humanoid-shipyard-safety-pack.v1.json`

Guide:

- `docs/guides/industrial-humanoid-shipyard-safety-pack.md`

Sprint plan:

- `docs/roadmaps/industrial-humanoid-shipyard-safety-sprint.md`

## Proposed Message

SINT does not compete with Persona's robot stack. It complements it as the
policy, approval, and evidence layer for industrial humanoid deployments. For
shipyard welding, SINT can prove that hot-work permits, safety-controller state,
simulation receipts, supervisor approvals, and operator evidence were present
before the robot acted.

## Suggested Next Conversation

Ask for one narrow integration surface:

- one ROS 2 or controller action for weld start
- one safety PLC or permit signal
- one simulator receipt or offline program hash
- one supervisor approval event

Then map that path into a SINT `request -> decision -> receipt -> execution`
trace.

## Public References

- Persona AI: `https://persona.ai/`
- Persona AI RaaS brochure: `https://persona.ai/wp-content/uploads/PAI-RaaS-Brocure-04-2026-v1.pdf`
- HD Hyundai / Persona AI shipbuilding automation announcement: `https://www.prnewswire.com/news-releases/hd-hyundai-and-persona-ai-sign-agreement-to-deploy-humanoid-welding-robots-for-shipbuilding-automation-302449258.html`
- ABS / Persona AI shipyard robotics announcement: `https://www.businesswire.com/news/home/20250923457571/en/ABS-and-Persona-AI-Partner-to-Bring-Humanoid-Robotics-to-Shipyards-Advancing-Safety-and-Productivity`

# Sunnybotics Collaboration Brief

This note turns Sunnybotics' public footprint into a concrete SINT integration
hypothesis.

It is not a partnership claim. It is a working brief based on public sources
that helps us ask better technical questions.

## What We Found

Sunnybotics presents itself as an AI and robotics company for solar field
operations. The current public website emphasizes three operating surfaces:

- panel inspection
- autonomous panel cleaning
- solar installation support

The site also names several robot concepts or platforms, including THOR,
SOLARIS, TATABOT, COLOSSUS, TORQUE, DOGO, and MANTIS.

Public sources:

- https://www.sunnybotics.com/
- https://sunnybotics.com/

The older site describes a service flow that includes:

1. project advisory and technical analysis
2. cleaning and data collection
3. detailed reporting on results and soiling conditions
4. forecasting future cleaning

That matters because it gives SINT a clear split between low-risk analysis work
and higher-risk physical execution.

## Public Technical Footprint

The strongest public engineering artifact we found is:

- https://github.com/Sunnybotics/T800-SunnyBOT

GitHub metadata at the time of review:

- created: 2021-04-14
- last pushed: 2021-04-20
- license: GPL-3.0
- description: ROS 2 Foxy and micro-ROS implementation for a T800 robotic chassis

The public repo is sparse, but it still exposes a useful control boundary:

- a ROS 2 wheel-command message
- a micro-ROS subscriber that receives wheel commands
- direct motor actuation from that subscriber path
- encoder telemetry publication back out of the embedded side

This is enough to identify a real policy boundary. There is a moment where a
software intent becomes physical wheel motion.

## Papers And Articles

We did not find a clear public paper trail, arXiv footprint, or maintained open
technical writeup tied to Sunnybotics itself.

That is not a negative signal on its own. It just means the best collaboration
entry point is likely practical operations and field safety, not academic
positioning.

What we did find:

- a Forbes Colombia article from 2026 describing Sunnybotics as operating
  12 robots, processing data across more than 2 GW of installed solar capacity,
  and rebranding from Sunnyapp Robotics to Sunnybotics
- a 2022 Forbes Colombia advertorial describing pilot cleaning throughput and
  early robot lines for cleaning, installation, and coatings
- a 2023 public investor deck showing a robot-as-a-service model, operations
  workflow, and performance claims around cleaning efficiency

Useful references:

- https://forbes.co/emprendedores/sunnybotics-apunta-a-4-millones-de-paneles-solares-este-ano
- https://forbes.co/tecnologia/este-robot-colombiano-ya-ha-limpiado-mas-de-100-000-paneles-solares
- https://sunnyapp.com/wp-content/uploads/2023/07/Investor_Deck_Robotics.pdf

## Where SINT Can Help

The most natural SINT fit is not generic "AI governance." It is boring,
high-value runtime control for solar field robots:

- gate wheel and joint actuation before commands cross from ROS 2 into embedded
  control
- bind weather, surface, and aisle-access constraints into the capability token
- escalate motion when a human is detected in the service aisle
- require lockout-tagout evidence before installation tooling is allowed
- emit tamper-evident receipts for every allow, deny, and escalation
- preserve traceability across inspection, cleaning, and installation workflows

In practice, that gives a field operator or auditor a simple answer to:

"Which robot attempted which action on which row, under which permit state, and
why was it allowed?"

## Best First Integration

The smallest credible first integration is not a runtime dependency inside their
stack. It is a project-neutral conformance fixture that matches the operating
surface they describe publicly.

We added that here:

- guide: `/docs/guides/solar-field-operations-policy-receipts.md`
- fixture: `/packages/conformance-tests/fixtures/physical-ai/solar-field-operations-policy-receipts.v1.json`
- test: `/packages/conformance-tests/src/solar-field-operations-policy-receipts-conformance.test.ts`

This fixture covers:

- thermal inspection inference as `T0_observe`
- route planning as `T1_prepare`
- cleaning motion as `T2_act`
- human-in-aisle escalation to `T3_commit`
- weather-permit denials for field motion
- lockout-tagout denials for installation tooling

## Suggested Collaboration Ask

If we reach out, the right question is narrow:

"Does the useful policy boundary in solar robotics live at the ROS 2 action
layer, inside embedded control, or one level higher in the operations system?"

That is a much better opening than a product pitch. It asks them to critique the
boundary and use case, which is where their operational knowledge is strongest.

## Why This Prospect Is Interesting

Sunnybotics is interesting because the company appears to sit at the intersection
of:

- solar O&M economics
- autonomous field robotics
- mixed inspection and actuation workflows
- harsh physical environments where audit and safety evidence matter

That is exactly the kind of place where SINT can be useful without trying to own
the whole autonomy stack.

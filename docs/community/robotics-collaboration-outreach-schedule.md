# Robotics Collaboration Outreach Schedule

This plan is for finding real collaborators and bridge use cases for SINT.

The goal is not attention. The goal is to ask good technical questions in the
right open source rooms, then build the smallest useful adapter or fixture when
someone gives signal.

## Outreach Rules

- Use public project channels first: GitHub Discussions, then Issues when the
  project does not have Discussions.
- Send at most two project messages per week.
- Wait at least 48 hours between new project messages.
- Do not copy and paste the same body across projects.
- Do not tag individual maintainers unless the project docs say that is the
  right path.
- Do not bump a thread for at least seven days.
- Do not bump with "checking in". Only follow up with a concrete artifact:
  fixture, adapter sketch, failing test, diagram, or docs PR.
- Pause outreach if more than two threads are open with no reply.
- If a maintainer says the topic is not a fit, thank them once and close the
  loop.

## Voice

Use this tone:

- specific to the project
- short enough to review in one sitting
- humble about where SINT should live in the stack
- technical enough to invite critique
- clear that we are looking for collaborators and use cases, not endorsement

Avoid:

- hype
- generic startup language
- claims about adoption
- pressure for meetings
- repeated personal outreach
- cross-posting the same message

## Cadence

The first GitHub outreach to `garrytan/gbrain` was sent on 2026-05-19.

Do not send another project message the same day.

| Date | Target | Channel | Topic | Send only if |
| --- | --- | --- | --- | --- |
| 2026-05-21 | Open-RMF | GitHub project discussion or issue | Policy receipts for fleet handoffs | Garry thread has no negative signal and the Open-RMF fixture remains green |
| 2026-05-26 | MoveIt | GitHub Discussion | Policy receipts around manipulation execution | Open-RMF thread is posted, no maintainers object, and the MoveIt fixture remains green |
| 2026-05-28 | Nav2 | GitHub Discussion | Policy receipts for navigation goals and docking | Fewer than two unanswered threads are active and the Nav2 fixture remains green |
| 2026-06-02 | PX4 | GitHub Issue | Capability gated MAVLink and offboard actions | Fewer than two unanswered threads are active and the PX4 fixture remains green |
| 2026-06-04 | LeRobot | GitHub Issue | Runtime gate between learned policies and hardware | We can point to a minimal learned-policy actuation fixture |
| 2026-06-09 | Gazebo | GitHub Issue | Simulation-first SINT safety fixtures | We can show a Gazebo validation path |
| 2026-06-11 | ros2_control | GitHub Issue | Policy boundary before hardware command writes | We have a crisp controller-boundary question |
| 2026-06-16 | Autoware | GitHub Discussion | Evidence receipts for ODD and autonomous mode changes | We have an Autoware-specific framing ready |
| 2026-06-18 | Drake | GitHub Discussion | Runtime policy contracts from a verification lens | Earlier robotics feedback suggests this is useful |

## First Wave Drafts

### Open-RMF

Title:

```text
Design discussion: policy receipts for robot fleet handoffs
```

Body:

````markdown
Hi Open-RMF maintainers,

I am building SINT Protocol, an open source runtime gate for agent and robot actions.

The reason I am opening this here is that Open-RMF sits where the problem becomes real: multiple robot fleets, shared spaces, doors, elevators, traffic negotiation, and physical infrastructure.

The SINT loop is:

```text
robot or agent intent
capability token
policy gateway
allow, deny, or escalate
proof receipt
```

I put the question into a tiny fixture so it is easier to critique:

https://github.com/sint-ai/sint-protocol/blob/main/packages/conformance-tests/fixtures/physical-ai/open-rmf-handoff-policy-receipts.v1.json

Guide:

https://github.com/sint-ai/sint-protocol/blob/main/docs/guides/open-rmf-handoff-policy-receipts.md

The small thing I would like to sanity check:

1. Treat selected RMF task, fleet, door, lift, or handoff actions as policy-gated requests.
2. Attach a signed proof receipt to each allow, deny, escalation, or rollback.
3. Start as a conformance fixture rather than a runtime dependency.
4. Use the fixture to test whether a handoff can be audited across fleet boundaries.

The critique I would value:

Does a policy receipt belong at the RMF handoff layer, or would this be better modeled inside a fleet adapter or external facility policy system?

Repo for context:

https://github.com/sint-ai/sint-protocol
````

### MoveIt

Title:

```text
Design discussion: policy receipts around manipulation execution
```

Body:

````markdown
Hi MoveIt maintainers,

I am working on SINT Protocol, an open source runtime gate for agent and robot actions.

The boundary I am trying to sanity check with MoveIt is the moment a plan becomes physical execution.

The SINT loop is:

```text
robot or agent intent
capability token
policy gateway
allow, deny, or escalate
proof receipt
```

I put the question into a tiny fixture so it is easier to critique:

https://github.com/sint-ai/sint-protocol/blob/main/packages/conformance-tests/fixtures/physical-ai/moveit-manipulation-policy-receipts.v1.json

Guide:

https://github.com/sint-ai/sint-protocol/blob/main/docs/guides/moveit-manipulation-policy-receipts.md

A small MoveIt-shaped integration could be:

1. Gate selected manipulation execution requests before they reach hardware action.
2. Represent constraints like workspace, force, velocity, end effector, and human proximity in a capability token.
3. Emit a signed proof receipt for allow, deny, escalation, or rollback.
4. Start with a conformance fixture rather than a runtime dependency.

The technical question:

Is this boundary useful around MoveIt execution, or would it be cleaner to keep policy enforcement outside MoveIt and closer to the hardware controller?

Repo for context:

https://github.com/sint-ai/sint-protocol
````

### Nav2

Title:

```text
Design discussion: policy receipts for navigation goals and docking
```

Body:

````markdown
Hi Nav2 maintainers,

I am building SINT Protocol, an open source runtime gate for agent and robot actions.

The part that seems relevant to Nav2 is where a high-level navigation intent becomes a route, docking action, speed change, or physical movement.

The SINT loop is:

```text
robot or agent intent
capability token
policy gateway
allow, deny, or escalate
proof receipt
```

I put the question into a tiny fixture so it is easier to critique:

https://github.com/sint-ai/sint-protocol/blob/main/packages/conformance-tests/fixtures/physical-ai/nav2-navigation-policy-receipts.v1.json

Guide:

https://github.com/sint-ai/sint-protocol/blob/main/docs/guides/nav2-navigation-policy-receipts.md

A small first integration could be:

1. Model selected Nav2 actions as policy-gated requests.
2. Attach constraints such as geofence, max velocity, zone access, docking target, or human-workspace mode.
3. Emit signed proof receipts for allow, deny, escalation, or rollback.
4. Start as a conformance fixture and example adapter, not a core dependency.

The critique I would value:

Is a policy gate useful at the navigation action boundary, or should this live above Nav2 in an application-level task executive?

Repo for context:

https://github.com/sint-ai/sint-protocol
````

### PX4

Title:

```text
Design discussion: policy receipts for arming and offboard control
```

Body:

````markdown
Hi PX4 maintainers,

I am working on SINT Protocol, an open source runtime gate for agent and robot actions.

The boundary I am trying to sanity check with PX4 is where companion-computer intent becomes arming, offboard mode, geofence changes, or continuous setpoints over MAVLink.

The SINT loop is:

```text
robot or agent intent
capability token
policy gateway
allow, deny, or escalate
proof receipt
```

I put the question into a tiny fixture so it is easier to critique:

https://github.com/sint-ai/sint-protocol/blob/main/packages/conformance-tests/fixtures/physical-ai/px4-offboard-policy-receipts.v1.json

Guide:

https://github.com/sint-ai/sint-protocol/blob/main/docs/guides/px4-offboard-policy-receipts.md

A small PX4-shaped integration could be:

1. Treat selected MAVLink actions at the router or companion boundary as policy-gated requests.
2. Keep arming, OFFBOARD mode, and fence changes receipt-backed and explicit.
3. Let continuous setpoints carry constraints like corridor access and speed limits.
4. Start as a conformance fixture rather than a PX4 dependency.

The technical question:

Does this boundary belong at the MAVLink router or companion-computer layer, or is that the wrong abstraction for PX4 operators and integrators?

Repo for context:

https://github.com/sint-ai/sint-protocol
````

## Follow-Up Pattern

Use one follow-up only after seven days or after a maintainer asks for more.

Good follow-up:

```markdown
I turned the question into a tiny fixture so this is easier to evaluate:

<link>

It models one allow, one deny, and one escalation path. If this still feels like the wrong layer, I can close the issue and keep the work outside this project.
```

Bad follow-up:

```text
Any thoughts?
```

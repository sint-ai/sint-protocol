# Sunnybotics Outreach Drafts

These drafts are designed for collaboration, not sales.

Use them only after the current public artifact is live:

- `docs/community/sunnybotics-collaboration-brief.md`
- `docs/guides/sunnybotics-t800-ros2-integration.md`
- `packages/bridge-ros2` differential-drive support

## Best Contact Paths

- GitHub: `https://github.com/Sunnybotics/T800-SunnyBOT`
- Email: `info@sunnybotics.com`
- LinkedIn company page: `https://www.linkedin.com/company/sunnybotics`
- LinkedIn founder profile surfaced publicly: Camilo Rojas

## Why This Angle Fits

Their recent public messaging emphasizes:

- performance gaps in solar plants
- context around alarms and performance drops
- keeping people out of harm's way during field operations

That means the best SINT angle is not abstract AI governance. It is:

- runtime control at the wheel and tooling boundary
- safety-aware autonomy in shared field environments
- auditable receipts for inspection, cleaning, and installation actions

## GitHub Draft

Use this only if the T800 repo still appears to be monitored. Keep it short and
technical.

Title:

```text
Question about a small ROS2/micro-ROS safety adapter for /robot/cmd_wheels
```

Body:

````markdown
Hi Sunnybotics team,

I spent some time reading the public `T800-SunnyBOT` repo. The part that caught
my attention was the `/robot/cmd_wheels` to micro-ROS to motor-actuation path.

I work on SINT Protocol, an open source runtime policy layer for agent and robot
actions. Instead of trying to wrap a whole stack, I focused on the narrow
boundary your repo exposes publicly: the moment a wheel command becomes physical
motion.

We added first-class support for this shape on our side:

- normalization for namespaced wheel topics like `/robot/cmd_wheels`
- physical-context extraction from the two-wheel command message
- a solar field robot policy template

Relevant pieces:

- https://github.com/sint-ai/sint-protocol/blob/main/docs/guides/sunnybotics-t800-ros2-integration.md
- https://github.com/sint-ai/sint-protocol/blob/main/docs/community/sunnybotics-collaboration-brief.md

The question is simple:

does the useful safety and audit boundary in your architecture belong at the ROS 2 action layer, inside the micro-ROS control box, or one level above in the field-ops system?

If this repo is still the right place for technical discussion, I would be glad
to open a tiny adapter or fixture PR around one command path. If not, no
problem, I can move the conversation elsewhere.
````

## Email Draft

Subject:

```text
Small open source idea for Sunnybotics' ROS2 wheel-command boundary
```

Body:

```text
Hi Sunnybotics team,

I’ve been following your recent public updates around solar performance, alarm context, and safer field operations, and I spent some time reading the public T800-SunnyBOT repository as well.

The interesting technical boundary in that repo is very specific: `/robot/cmd_wheels` flows through ROS 2 and micro-ROS into direct motor actuation. That is exactly the kind of boundary where runtime safety policy and audit receipts can be useful without slowing the rest of the stack down.

I work on SINT Protocol, an open source runtime policy layer for agent and robot actions. To avoid hand-wavy pitching, I turned your public robot shape into a concrete integration artifact on our side:

- support for namespaced differential-drive wheel topics
- physical-context extraction from the two-wheel command message
- a small solar-field robot policy template

Two links for context:

https://github.com/sint-ai/sint-protocol/blob/main/docs/guides/sunnybotics-t800-ros2-integration.md
https://github.com/sint-ai/sint-protocol/blob/main/docs/community/sunnybotics-collaboration-brief.md

The question I’d value your take on is:

where does the useful safety boundary belong in your system today: at the ROS 2 action layer, inside embedded control, or in the higher-level operations workflow?

No pressure to jump on a call. If this is relevant, I’d be happy to turn it into one tiny adapter or fixture around a real command path.

Best,
Pavel
```

## LinkedIn Draft

This one should feel lighter and more human.

```text
Hi Camilo, I came across Sunnybotics’ recent posts about performance gaps, alarm context, and keeping people out of harm’s way in field operations. I also read through the public T800-SunnyBOT repo.

What stood out to me was the `/robot/cmd_wheels` boundary. It is a very real place where software intent becomes physical motion, which is exactly where I think runtime safety policy can be useful.

I work on SINT Protocol, an open source governance layer for agent and robot actions. I turned your public ROS2 + micro-ROS control shape into a small integration artifact on our side instead of just sending a pitch.

If it is relevant, I’d love your technical take on one question: should that policy boundary live at the ROS 2 layer, inside embedded control, or one level above in ops?
```

## Follow-Up Rule

Do not follow up with "just checking in."

Only follow up if we have something new:

- a tiny adapter PR
- a fixture based on a real wheel-command trace
- a policy template adapted to one of their robots

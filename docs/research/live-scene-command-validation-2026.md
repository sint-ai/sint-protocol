# Live scene command validation for physical AI

**Research date:** 27 October 2026. This note compares public, primary-source
systems with SINT's proposed loop: scan the environment, construct a live
synthetic scene, test the exact next physical effect, assign consequence and
hazard levels, then authorize and dispatch only while the scene is still valid.
The comparisons describe published capabilities; they do not establish that
these products place a signed simulator receipt in front of every actuator.

## What already resembles this idea

| System | Publicly documented mechanism | Idea for SINT |
|---|---|---|
| [MoveIt Planning Scene Monitor](https://moveit.picknik.ai/main/doc/examples/planning_scene_monitor/planning_scene_monitor_tutorial.html) | Maintains current robot state and collision objects from joint states, transforms, and world geometry; the planning scene supports collision checks. | Make the scene a continuously updated, timestamped input to each command check, with an exact scene digest in the receipt. |
| [Autoware trajectory validator](https://autowarefoundation.github.io/autoware_universe/latest/planning/autoware_trajectory_validator/) and [planning evaluator](https://autowarefoundation.github.io/autoware_universe/latest/evaluator/autoware_planning_evaluator/) | Tests candidate trajectories against odometry, predicted objects, maps, kinematic constraints, and obstacle metrics such as time to collision and required deceleration. | Add effect-specific metrics and a hard-feasibility filter before any probability estimate influences escalation. |
| [Nav2 Collision Monitor](https://docs.nav2.org/rolling/configuration_and_development/configuration_guide/core_servers/collision_monitor/configuring_collision_monitor_node/) | Uses fresh laser, point-cloud, and range data to stop or slow a robot in defined zones independently of the planner; its documentation explicitly says this CPU-level node is not safety certified. | Keep a fast local stop/slow layer below SINT's slower simulation and approval path. Never treat a remote simulator as an E-stop. |
| [Realtime Robotics RapidPlan](https://rtr.ai/rapidplan/) | Describes millisecond-scale collision-free motion planning, real-time 3D data, dynamic replanning, and multi-robot interlocks. | Benchmark a bounded motion checker and invalidate permits when another robot enters the swept volume. Vendor latency claims need measurement on SINT workloads. |
| [NVIDIA Isaac Sim and NuRec](https://developer.nvidia.com/isaac/sim/) | Builds physics-based robot scenes, can reconstruct interactive environments from real captures, and supports ROS integration and software-in-the-loop testing. | Use an adapter for richer physics/contact checks and model calibration; keep the authorization format independent of the simulator vendor. |
| [Waymo World Model](https://waymo.com/blog/2026/02/the-waymo-world-model-a-new-frontier-for-autonomous-driving-simulation/) | Generates controlled counterfactual driving scenes by changing actions, layout, and other road users. Its public description focuses on simulation and testing, not a receipt before each live control output. | Use learned models to generate hard cases around observed scenes; use geometry, dynamics, and local controller limits for the actual gate. |
| [Siemens LiveTwin](https://www.siemens.com/en-us/products/industrial-edge/livetwin/) | Runs near-real-time machine models at the industrial edge using PLC data for virtual sensors, model-predictive control, and diagnostics. | Give IoT and PLC effects their own state models: valve position, pressure, temperature, relay state, interlocks, and delayed effects rather than robot-only collision checks. |

**Inference:** The closest practical pattern is a hybrid of MoveIt's live scene,
Autoware's candidate validation, Nav2's immediate local monitor, and a richer
physics simulator for effects that need contact or dynamics. None of the linked
public sources establishes SINT's proposed combination of a cryptographically
bound per-command simulation receipt, capability-token constraints, human
approval, and a one-use dispatch nonce.

## Proposed SINT loop

```text
camera/lidar/depth/joints/PLC/IoT telemetry
  -> synchronized scene with provenance, uncertainty, epoch and expiry
agent or operator proposes one bounded effect
  -> exact effect plan and capability token
  -> rollout of current scene plus plausible and adversarial variations
  -> hard checks: collision, clearance, stopping distance, force,
     geofence, interlocks, process limits
  -> hazard findings and signed pass/fail/indeterminate receipt
  -> PolicyGateway.intercept() assigns T0-T3 consequence tier and applies
     token constraints, simulation policy and human approval
  -> execution broker re-reads scene, consumes nonce, dispatches once
  -> local controller shield watches each control update; E-stop is immediate
  -> observed outcome compared with predicted outcome for model calibration
```

The **T0-T3 tier** measures the consequence and authority required for an
effect. The **predicted hazard** is a separate finding from the simulated scene:
collision probability or worst-case collision, time to contact, stopping
margin, force, proximity to humans, model uncertainty, and unsupported
phenomena. A low predicted hazard cannot lower an effect's token or approval
tier. A high hazard can deny, constrain, or escalate. Unknown or stale state is
`indeterminate`, not a safe pass. A simulator never issues authorization.

An independent effect is a short trajectory segment, gripper close, door
unlock, valve opening, drone maneuver, or other command the controller can
dispatch as one unit. The controller's servo ticks remain under a local shield;
requiring a remote simulation round trip for each tick would add latency at the
wrong boundary. Any replan, changed scene, target, tool, payload, or effect
parameters requires new evidence.

## What SINT has and what is missing

SINT already has a ROS 2 world-snapshot adapter, V2 signed simulation receipts,
an `EffectSimulator` boundary, a tier-aware evidence policy, production
enforcement for T2/T3 requests, and an execution broker that checks world
digest/epoch and consumes a nonce before dispatch. These are useful protocol
pieces, but the current `BoundedMotionEffectModel.evaluate()` receives a world
snapshot and does not inspect it. It checks declared effect parameters against
configured envelopes; it does not roll a motion path through live obstacles.
The ROS 2 snapshot currently contains obstacle positions and radii but no
object velocity or covariance. The receipt records scenario count and coverage,
but the reference deterministic simulator does not yet generate perturbed live
scenes. Thus SINT does **not** yet implement the user's full live environment
test for every physical command.

## Human and simulated robotics data: test before the outcome exists

There are two distinct uses for human data. **Human demonstration data** shows
how people teleoperated or taught a robot to perform a task. [DROID](https://droid-dataset.github.io/)
contains synchronized camera, robot-state, and teleoperation trajectories
across many manipulation scenes; [Open X-Embodiment](https://github.com/google-deepmind/open_x_embodiment/blob/main/README.md)
standardizes robot episodes from different platforms. These records can supply
task starts, candidate effects, realistic object placements, and observed
outcomes for offline replay. They are not evidence that a *new* command is safe
in a *new* scene. [robomimic](https://github.com/ARISE-Initiative/robomimic/blob/master/docs/datasets/robomimic_v0.1.md)
also documents mixed-quality human and machine trajectories, a reminder to
retain failures and interventions rather than treating every demonstration as
an approved behavior.

**Human-near-robot data** describes the person as part of the changing scene.
The [INTERACT dataset](https://github.com/MohammadYasar/Interact) includes 3D
skeleton, RGB-D, gaze, and robot data for collaborative tasks. Research on
[confidence-aware human prediction](https://roboticsproceedings.org/rss14/p69.html)
and [uncertain human dynamics](https://roboticsproceedings.org/rss17/p050.html)
shows why a single predicted human path is insufficient: the model may become
less reliable when a person behaves differently from the training data. SINT
should represent a short-horizon *reachable region* around each detected
person, widened by sensor and prediction uncertainty, with a conservative
fallback for occlusion or out-of-distribution behavior. Human presence, entry
into a protected zone, or loss of tracking can stop the command even when the
most likely predicted path looked clear.

[Isaac Lab](https://isaac-sim.github.io/IsaacLab/v2.3.0/) supports physics
simulation and domain randomization. SINT can use that pattern to generate
counterfactual versions of a recorded scene: a person steps toward the robot,
an object slips, a gripper has lower friction, a sensor frame arrives late, or
a controller responds slowly. Every generated case needs a recorded seed,
parameter bounds, model identity, and hard-check result. Synthetic cases expand
test coverage; held-out real episodes and live near misses measure whether the
simulation is predictive enough for the specific robot, site, and effect.

The operational loop has two timescales:

1. **Offline, before deployment:** replay human demonstrations, failures, and
   near misses; generate counterfactual scenes; compare simulated and recorded
   outcomes; calibrate uncertainty and set effect-specific thresholds. Treat
   the outcome of an unexecuted alternative as a simulated estimate, never an
   observed fact.
2. **Online, before each bounded effect:** capture the current scene and human
   reachable regions, run short rollouts for the exact proposed command,
   apply hard limits, and issue a signed receipt only for a passing and
   sufficiently covered scenario set. Scene drift or a person entering the
   region invalidates the receipt before dispatch.

For a first human-aware pilot, record only the features needed for testing
(tracked occupancy, pose uncertainty, timestamps, intervention and outcome)
in the live safety path. Keep raw video under a separate, access-controlled
retention policy. This minimizes unnecessary personal data in the authorization
ledger while preserving reproducible safety evidence.

## Build order and acceptance evidence

1. **Scene contract.** Version the canonical scene with sensor provenance and
   freshness per source, robot/tool/payload geometry, map frame, static and
   moving objects, velocity/covariance, people and protected zones, PLC
   interlocks, and a state epoch. Reject missing transforms, conflicting clocks,
   excessive uncertainty, and stale sources. Keep the exact scene payload in
   content-addressed storage; bind its digest into the receipt.
2. **Command inventory.** Mark every bridge action as observe, prepare, or
   physical effect. Normalize ROS 2, MAVLink, OPC-UA, MQTT/IoT, MCP robot tools,
   and VLA action chunks into a bounded `EffectPlan`. A physical action
   classified T0/T1 must deny as a tiering error. Audit direct hardware paths.
3. **Fast scene-aware validator.** For a ROS 2 navigation slice, project the
   candidate trajectory and robot footprint into the observed scene, calculate
   swept-volume clearance, stopping distance, time to contact, geofence and
   velocity limits. Check every sampled time step and fail on any hard limit.
   This can precede a full Isaac/Gazebo adapter.
4. **Uncertainty and counterfactuals.** Reproducibly perturb object pose and
   velocity, sensor error, actuation delay, friction, payload mass, and human
   entry. Use recorded human-robot episodes to seed plausible behavior, then
   widen the human reachable region when tracking or prediction confidence
   falls. Include mandatory adversarial cases for the effect class. Record
   seeds, bounds, model version, number of runs, failures, and coverage in the
   signed artifact. A model can propose scenarios but cannot mark them safe.
5. **Threat policy.** Keep consequence tier and predicted hazard separate.
   Define per-effect minimum scene freshness, scenario coverage, hard margins,
   allowed simulator grade, and maximum uncertainty. Failed or unsupported
   checks deny; borderline margins escalate or constrain the effect. Show the
   exact reason and scene timestamp to the operator.
6. **Dispatch and feedback.** Immediately before dispatch, compare current
   scene epoch/digest and controller interlocks with the tested scene, consume
   the receipt nonce, and permit one bounded effect. Keep local stop/slow and
   E-stop independent. Record measured clearance, contact, force, outcome, and
   latency to detect simulator drift.

**First pilot:** one low-energy ROS 2 mobile robot executing a short waypoint
segment. A moving person/obstacle, stale lidar frame, swapped payload, changed
target, failed simulator, or direct `/cmd_vel` bypass must prevent motion. Log
separate p50/p95/p99 times for scene assembly, simulation, policy, approval,
and broker dispatch. A passed simulation is evidence of tested assumptions,
not a guarantee of physical safety.

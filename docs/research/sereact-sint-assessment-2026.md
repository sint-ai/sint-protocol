# Sereact research and implications for SINT

**Reviewed:** 27 October 2026. This is a comparison of public Sereact material
with the SINT checkout on `fix/audit-trust-boundaries`. Sereact's performance
numbers are company-reported; they are useful hypotheses for a SINT pilot, not
independent safety evidence or authorization claims.

## What Sereact publicly describes

| Area | Public detail | Evidence and limit |
|---|---|---|
| Deployed product | Pick-and-place, putwall, returns, humanoid work, Lens perception, and a warehouse analytics platform. The current home page reports 300+ live systems and 2B+ production picks. | [Products](https://sereact.ai/en), [home page](https://sereact.ai/). Counts are company-reported and change over time. |
| Cortex 1 | A vision-language-action stack uses RGB, depth/3D geometry, proprioception, task context, discrete plans, and short continuous action chunks for robot-specific controllers. | [Cortex architecture](https://sereact.ai/posts/cortex-bridging-vision-language-and-action-with-discrete-plans-and-tokens). The public description is architectural, not an implementation specification. |
| Cortex 1.5 and 1.6 | Human correction episodes patch failure modes; PRO learns dense progress, completion-likelihood, and risk signals from intermediate execution telemetry. | [Policy patching](https://sereact.ai/posts/cortex-1-5), [PRO](https://sereact.ai/posts/cortex-1-6). Published experiments are Sereact's own. |
| Cortex 2.0 | A visual-latent world model generates candidate futures; progress, risk, and efficiency heads score them before a VLA produces motion. Planning budget K trades latency for success; the described task evaluations use K=2. | [Cortex 2.0](https://sereact.ai/posts/cortex-2). The site calls these early results and says it is still validating the loop on narrow workflows. |
| Task-phase awareness | Video-history subtask prediction conditions the world model before planning. Sereact reports 94.6% frame-level phase accuracy and end-to-end task success rising from 91.8% to 97.4% in an uneven internal task mix. | [Subtask prediction](https://sereact.ai/posts/subtask-prediction). The source says errors cluster at phase boundaries; its metrics are not an independent safety validation. |
| Cortex 2.5 | Retrieves intact video demonstration segments to condition both plan and world model; nearest-demo distance is a familiarity signal. Sereact limits the demonstrated claim to short, adjacent tasks within one domain and reports 92.6% success with 2–3 videos versus a 97.6% trained baseline. | [Cortex 2.5](https://sereact.ai/posts/cortex-2-5). It explicitly has not validated long-horizon or cross-domain transfer. |
| Cortex 2.6 / FLEX | Mixes demonstrations, old and fresh robot experience, and a critic to learn from practice. Sereact reports 50 real-hardware attempts per task improved three returns tasks from 60–70% to 85–100%. Local inference avoids a remote control dependency. | [FLEX](https://sereact.ai/posts/cortex-2-learns-from-practice). This is a small, company-reported task set. |
| Data loop | Synchronized video, robot state, force, actions, outcome, retries, and recovery feed curation, regression tests, and fleet model updates. | [Real-world learning loop](https://sereact.ai/posts/real-world-learning-loop). Data collection and update governance are described at a high level. |
| Integration | Product pages advertise REST APIs, webhooks, and low-latency control; Lens says it connects to WMS/WES/WCS. | [Pick-and-place integration](https://sereact.ai/product/pick-and-place), [Lens](https://sereact.ai/product/lens). The [public API landing page](https://api.sereact.ai/) exposes no schema, authentication profile, or Cortex action stream contract. |

Sereact's [public GitHub organization](https://github.com/sereact) includes
research forks and small projects, but does not establish an open Cortex runtime
or SINT-ready SDK. A direct integration needs a vendor-supplied contract and
access to an actual system. No inference should be made from product safety
marketing to SINT's cryptographic authorization or non-bypass guarantees.

## SINT comparison

SINT already defines `VlaActionChunkEnvelope`, `VlaTaskIntentEnvelope`,
`VlaMemoryEvidenceRef`, and `VlaAdaptationPermit` in
`packages/core/src/types/vla.ts`. It has a signed simulation receipt, world
snapshot checks, and an execution broker that rejects stale or drifted world
state before dispatch. These are governance and evidence contracts. SINT does
not currently implement a Cortex-like VLA, visual world model, phase predictor,
PRO learner, or production fleet data loop. Sereact does not publicly describe
an equivalent to SINT's signed capability lineage, M-of-N approval, or
hash-chained decision evidence. This comparison is an inference from public
material, not a claim that Sereact lacks private controls.

## Upgrades SINT should build

1. **Task-phase contract.** Add an observed phase and allowed next-phase set to
   a task plan. Bind phase, confidence, observation time, camera provenance,
   model digest, and world epoch to the proposed action. A phase predictor may
   suggest a transition; the policy gateway and edge execution boundary reject
   a motion whose signed plan does not permit that transition. Test stale,
   conflicting, and boundary-ambiguous phase predictions.
2. **Candidate-future evidence.** Extend predictive preflight to accept a
   bounded set of candidate future summaries with model digest, horizon, K,
   latency, calibration version, uncertainty, and scored risk. Preserve the
   simulator's signed receipt. The learned score is advisory and must never
   replace deterministic physical constraints, the gateway decision, or the
   independent safety controller. Test score manipulation, model substitution,
   timeout, and a low-risk score for a physically forbidden motion.
3. **Familiarity and drift triggers.** Treat demonstration distance, world-model
   uncertainty, and prediction-versus-observation error as untrusted telemetry
   until calibrated on held-out site data. If any exceeds an approved bound,
   require replanning, a narrower capability, human review, or safe hold.
   Record the trigger and measured outcome in the ledger.
4. **Recovery authority.** Separate `retry`, `regrasp`, `teleoperate`, and
   `change strategy` into distinct token actions with attempt and force limits.
   Phase transitions, recovery actions, and operator correction need fresh
   authorization; a model's learned completion likelihood cannot grant it.
5. **Governed learning loop.** Link synchronized sensory evidence, executed
   actions, outcomes, near misses, human corrections, and policy/model versions
   through immutable digests. Use `VlaAdaptationPermit` to bound training trials
   and checkpoint scope. Require signed promotion, regression tests, staged
   rollout, and rollback before a learned policy reaches a robot. Keep training
   data and executable model updates outside the authorization decision path.
6. **Vendor-neutral adapter.** Define one `EmbodiedPolicyProposal` input contract
   for any VLA provider, including Sereact if access is granted. The adapter
   must map action chunks to exact SINT resources, actions, robot/tool identity,
   scene epoch, and payload digests. Only `PolicyGateway.intercept()` decides;
   the execution broker verifies the resulting proof before motion.
7. **Perception provenance.** Treat Lens-like counting, damage, and object
   identity output as sensor evidence. Bind camera identity, capture time,
   calibration, image or point-cloud digest, and confidence to the world
   snapshot. Cross-check inventory claims against WMS state without letting
   either source authorize motion. Test replayed frames and conflicting counts.

Before attempting a Sereact-specific adapter, obtain a concrete vendor contract:
action proposal and feedback schemas; timestamp and identity guarantees; model
version pinning; robot/controller ownership; local safe-hold behavior; latency
budgets; signed evidence support; and data access and retention terms. The
public REST/API descriptions do not answer those questions.

## Pilot and evidence gate

Use a controlled pick-and-place cell first. Compare baseline SINT against phase
binding and candidate-future evidence on task success, unsafe proposals denied,
false denials, retries, interventions, latency at p95/p99, calibration, and
prediction-versus-observation drift. Include reflective, deformable, misplaced,
and novel objects, stale camera frames, swapped robot/tool identity, model
version changes, and network loss. Publish raw denominators and separate
simulation, shadow, and live-cell results. A vendor demo or company-reported
success rate is not a SINT safety or authorization acceptance test.

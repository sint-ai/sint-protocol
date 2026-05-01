# @pshkv/agent-sim

Agent decision replay and adversarial event injection. Build sim-to-real loops for SINT Protocol agents — capture production decisions, replay against a candidate policy, measure divergence before deployment.

```ts
import { ReplayHarness, AdversarialInjector } from '@pshkv/agent-sim';

// Replay production trace against a new agent
const result = await ReplayHarness.replay(trace, newAgent);
console.log(result.divergences); // where new agent disagrees with old

// Stress-test with adversarial events
const adversarial = AdversarialInjector.inject(trace, AdversarialInjector.defaultBattery(trace.length));
```

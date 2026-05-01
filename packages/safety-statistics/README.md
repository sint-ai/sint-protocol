# @pshkv/safety-statistics

Statistical safety metrics for SINT Protocol agents — MTBF, nines of reliability, error budgets, incident aggregation.

Inspired by Applied Intuition's principle that *"everything is statistics — how many orders of magnitude"* of reliability you achieve, rather than binary pass/fail safety claims.

## Usage

```ts
import { ReliabilityCalculator, ErrorBudgetCalculator, IncidentAggregator } from '@pshkv/safety-statistics';

const metrics = ReliabilityCalculator.compute(failures, operatingWindowMs);
// { mtbfHours, mttrMinutes, availability, nines, tier }

const budget = ErrorBudgetCalculator.compute(metrics.tier, consumedMinutes, elapsedMs);
// { budgetMinutes, remainingMinutes, burnRate, isOverBudget }

const incidents = IncidentAggregator.aggregate(failures);
// { totalIncidents, programKillers, noise, byCategory, bySeverity }
```

## Reliability Tiers

| Tier | Availability | Monthly Downtime |
|---|---|---|
| experimental | < 99% | 5+ days |
| beta | 99% – 99.9% | 7.2h |
| production | 99.9% – 99.99% | 43.2 min |
| critical | 99.99% – 99.999% | 4.32 min |
| safety | ≥ 99.999% | 26 sec |

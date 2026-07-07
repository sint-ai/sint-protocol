# OSS Maintainer Eligibility Metrics

Tracking log for the criteria in [docs/roadmaps/oss-maintainer-eligibility-plan.md](../roadmaps/oss-maintainer-eligibility-plan.md).

Update with:

```bash
pnpm run community:eligibility-metrics
```

The script auto-fills npm downloads and published-package count. Fill the manual columns from these sources:

- **External contributors (12mo)** — GitHub search: `repo:sint-ai/sint-protocol is:pr is:merged -author:pshkv created:>YYYY-MM-DD`, count unique authors.
- **Criticality score** — [`criticality_score`](https://github.com/ossf/criticality_score) CLI: `criticality_score --repo github.com/sint-ai/sint-protocol` (needs `GITHUB_AUTH_TOKEN`).
- **Upstream merged PRs (12mo)** — GitHub search: `author:pshkv is:pr is:merged -org:sint-ai created:>YYYY-MM-DD`.

## Targets

| Metric | Threshold | Target date |
|---|---|---|
| Combined monthly downloads (all registries) | 200,000 | long-term |
| Unique external contributors, rolling 12mo | 20 | 2027-Q1 |
| OpenSSF criticality score | 0.4 | 2027-Q2 |
| Upstream merged PRs, rolling 12mo | 100 | rolling |

## Log

| Date | npm downloads/mo | Published pkgs | External contributors (12mo) | Criticality score | Upstream PRs (12mo) | Notes |
|---|---|---|---|---|---|---|
| 2026-07-07 | n/a (offline) | n/a | 6 | TBD | TBD | Baseline from eligibility audit: clawdiy, ExpertVagabond, peterxing, ppcvote, faisal-hendra, AuthorPrime |
<!-- eligibility-metrics:insert-above -->

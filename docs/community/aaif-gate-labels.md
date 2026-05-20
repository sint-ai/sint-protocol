# AAIF Gate Labels

Use these labels on issues and pull requests tied to AAIF resubmission work.

## Label Set

- `aaif-gate/adoption`:
  independent adopter evidence, deployment records, and status classification
  (evaluation/pilot/production)
- `aaif-gate/maintainership`:
  independent maintainer activity, nomination, scorecard updates, and ownership
  expansion
- `aaif-gate/reference-implementation`:
  production gateway path, persistence hardening, signed request path, and
  release candidate operational validation
- `aaif-gate/conformance`:
  externally runnable conformance tooling, fixtures, and report semantics
- `aaif-gate/openssf`:
  OpenSSF Best Practices assessment, security-process hygiene, and gap tracking

## Usage Rules

- apply at least one AAIF gate label to every roadmap issue in
  `docs/roadmaps/aaif-resubmission-2026.md`
- apply multiple labels when a task spans more than one gate
- do not use `aaif-gate/adoption` for co-design discussion without deployment
  evidence
- keep adoption evidence issues separate from maintainer evidence issues

## Suggested Workflow

1. Open an issue from the appropriate template.
2. Assign the matching `aaif-gate/*` label(s).
3. Link evidence in the issue body and in any merged PR.
4. Update roadmap checklists only after evidence is reviewable.

# AAIF Evidence Dossier

This dossier is the canonical index of evidence items for AAIF resubmission.

Every evidence claim should map to a concrete item file in
`docs/community/aaif-evidence/`.

## Add A New Evidence Item

```bash
pnpm run aaif:evidence:new <type> <slug> [YYYY-MM-DD]
```

Allowed `type` values:

- `production-adopter`
- `maintainer`
- `release`
- `conformance`
- `security`

Example:

```bash
pnpm run aaif:evidence:new release v0-3-0-rc1 2026-06-15
```

## Evidence Index

| Date | Type | Organization | Owner | Link |
| --- | --- | --- | --- | --- |
| 2026-05-21 | conformance | SINT Protocol maintainers | @pshkv | [2026-05-21-conformance-production-slice-external-validation.md](./aaif-evidence/2026-05-21-conformance-production-slice-external-validation.md) |
| 2026-05-21 | release | SINT Protocol maintainers | @pshkv | [2026-05-21-release-v0-3-0-rc1-release-gate.md](./aaif-evidence/2026-05-21-release-v0-3-0-rc1-release-gate.md) |
| _Add next entry_ | _type_ | _organization_ | _owner_ | _link_ |

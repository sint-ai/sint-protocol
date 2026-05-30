# @sint/sintctl

Operator CLI for SINT gateway workflows:

- capability token issue/revoke
- approval queue list/resolve
- ledger querying
- intercept policy test requests
- standalone conformance certification runs
- shipyard humanoid evidence exports

## Usage

```bash
pnpm --filter @sint/sintctl build
node apps/sintctl/dist/cli.js --help
```

## Quickstart

```bash
# 1) Generate a root keypair
sintctl keypair create

# 2) Issue a token
sintctl token issue \
  --issuer <issuer-public-key> \
  --subject <agent-public-key> \
  --resource ros2:///cmd_vel \
  --actions publish \
  --private-key <issuer-private-key> \
  --constraints-json '{"maxVelocityMps":0.5}'

# 3) List pending approvals
sintctl approvals list

# 4) Resolve an approval
sintctl approvals resolve --request-id <id> --status approved --by operator@warehouse

# 5) Query ledger
sintctl ledger query --agent-id <agent-public-key> --limit 20

# 6) Run standalone certification fixture suite
sintctl certify run --output docs/reports/standalone-conformance-certification.json

# 7) Export shipyard humanoid safety evidence JSONL
sintctl shipyard evidence export \
  --output docs/reports/shipyard-humanoid-evidence-export.jsonl
```

## Global Options

- `--gateway`: defaults to `http://localhost:3100`
- `--api-key`: optional x-api-key header

## Standalone Certification Tool

`sintctl certify run` executes the canonical conformance fixture suite:

```bash
pnpm --filter @sint/sintctl build
node apps/sintctl/dist/cli.js certify run
```

By default it writes a machine-readable summary artifact to:

- `docs/reports/standalone-conformance-certification.json`

Override output path with `--output <path>`.

## Shipyard Humanoid Evidence Export

`sintctl shipyard evidence export` turns the industrial humanoid shipyard
safety fixture into hash-chained JSONL evidence records for remote survey,
incident reconstruction, and supervisor review.

```bash
pnpm --filter @sint/sintctl build
node apps/sintctl/dist/cli.js shipyard evidence export \
  --generated-at 2026-05-30T12:00:00.000Z \
  --output docs/reports/shipyard-humanoid-evidence-export.jsonl
```

Use `--format json` for a single JSON array, or `--input <path>` to point at a
site-specific fixture with the same scenario shape.

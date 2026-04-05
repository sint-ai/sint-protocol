# @sint/sintctl

Operator CLI for SINT gateway workflows:

- capability token issue/revoke
- approval queue list/resolve
- ledger querying
- intercept policy test requests

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
```

## Global Options

- `--gateway`: defaults to `http://localhost:3100`
- `--api-key`: optional x-api-key header

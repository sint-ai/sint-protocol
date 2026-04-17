# Getting Started with SINT Protocol

This guide gets you from clone to a complete `token -> intercept -> approval -> ledger` flow in about 10 minutes.

If you want the fastest builder-facing walkthrough for the new interceptor flagship instead of the full local stack, start with [SINT PDP Interceptor Quickstart](./guides/sint-pdp-interceptor-quickstart.md). It shows `request -> decision -> receipt` plus the fail-closed path in one terminal run.

## Prerequisites

- Node.js 22+
- pnpm 9+
- Docker Desktop (for one-command local stack)

## 1) Install and Build

```bash
git clone https://github.com/sint-ai/sint-protocol
cd sint-protocol
pnpm install
pnpm run build
```

## 2) Start a Production-Like Local Stack

```bash
pnpm run stack:dev
```

Services:
- Gateway: `http://localhost:3100`
- Dashboard: `http://localhost:3201`

Health checks:

```bash
curl http://localhost:3100/v1/health
curl http://localhost:3100/v1/ready
```

## 3) Create Keys

Use `sintctl` (operator CLI) to generate two keypairs: issuer + subject.

```bash
# Issuer keypair
node apps/sintctl/dist/cli.js keypair create > /tmp/issuer.json

# Subject keypair
node apps/sintctl/dist/cli.js keypair create > /tmp/subject.json
```

Extract keys:

```bash
ISSUER_PUB=$(jq -r '.publicKey' /tmp/issuer.json)
ISSUER_PRIV=$(jq -r '.privateKey' /tmp/issuer.json)
SUBJECT_PUB=$(jq -r '.publicKey' /tmp/subject.json)
```

## 4) Issue a Capability Token

```bash
node apps/sintctl/dist/cli.js token issue \
  --issuer "$ISSUER_PUB" \
  --subject "$SUBJECT_PUB" \
  --resource ros2:///cmd_vel \
  --actions publish \
  --private-key "$ISSUER_PRIV" \
  --constraints-json '{"maxVelocityMps":0.5}' \
  > /tmp/token.json

TOKEN_ID=$(jq -r '.tokenId' /tmp/token.json)
```

## 5) Send an Intercept Request

```bash
node apps/sintctl/dist/cli.js intercept run \
  --agent-id "$SUBJECT_PUB" \
  --token-id "$TOKEN_ID" \
  --resource ros2:///cmd_vel \
  --action publish \
  --params-json '{"twist":{"linear":0.2,"angular":0.0}}'
```

Depending on policy/tier, this is either:
- allowed immediately (`T0/T1`), or
- queued for approval (`T2/T3`).

## 6) Resolve Pending Approvals (if any)

List queue:

```bash
node apps/sintctl/dist/cli.js approvals list
```

Resolve one request:

```bash
node apps/sintctl/dist/cli.js approvals resolve \
  --request-id <REQUEST_ID> \
  --status approved \
  --by operator@site
```

You can also resolve from the dashboard at `http://localhost:3201`.

## 7) Query the Evidence Ledger

```bash
node apps/sintctl/dist/cli.js ledger query --agent-id "$SUBJECT_PUB" --limit 20
```

Or via HTTP directly:

```bash
curl "http://localhost:3100/v1/ledger/query?agentId=$SUBJECT_PUB&limit=20"
```

## 8) Next Steps

- MCP proxy hardening: `docs/guides/claude-desktop-integration.md`
- Cursor MCP setup: `docs/guides/cursor-integration.md`
- Deployment profiles: `docs/guides/docker-deployment.md`
- Protocol reference: `docs/SINT_v0.2_SPEC.md`

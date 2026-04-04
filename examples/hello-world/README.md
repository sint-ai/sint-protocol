# Hello World (under 30 minutes)

## Goal

Run gateway, mint a token, intercept one request, and inspect ledger output.

## Steps

1. Install and build:

```bash
pnpm install
pnpm --filter @sint/core build
pnpm --filter @sint/gateway-server dev
```

2. In another terminal, create a keypair:

```bash
curl -s -X POST http://localhost:3100/v1/keypair
```

3. Issue a token:

```bash
curl -s -X POST http://localhost:3100/v1/tokens \
  -H 'content-type: application/json' \
  -d '{
    "issuer":"<issuer_pub>",
    "subject":"<agent_pub>",
    "resource":"ros2:///cmd_vel",
    "actions":["publish"],
    "constraints":{"maxVelocityMps":0.6},
    "delegationChain":{"parentTokenId":null,"depth":0,"attenuated":false},
    "expiresAt":"2030-01-01T00:00:00.000000Z",
    "revocable":true
  }'
```

4. Intercept a request:

```bash
curl -s -X POST http://localhost:3100/v1/intercept \
  -H 'content-type: application/json' \
  -d '{
    "requestId":"01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
    "timestamp":"2030-01-01T00:00:00.000000Z",
    "agentId":"<agent_pub>",
    "tokenId":"<token_id>",
    "resource":"ros2:///cmd_vel",
    "action":"publish",
    "params":{"linear":{"x":0.2}}
  }'
```

5. Inspect ledger:

```bash
curl -s http://localhost:3100/v1/ledger
```

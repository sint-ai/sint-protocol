# `@pshkv/sint-pdp-interceptor`

Reference SINT PDP adapter for SEP-1763 style MCP interceptor hosts.

This package gives MCP hosts a thin `policy-pdp` interface on top of
`PolicyGateway.intercept()`. The goal is to make SINT easy to plug into an
interceptor framework without re-implementing SINT request construction.

## What it does

- adapts `caller_identity` into `SintRequest.agentId`
- maps MCP call metadata into SINT `resource`, `action`, and `params`
- forwards evaluation to `PolicyGateway.intercept()`
- fails closed by default when the gateway is unavailable

## Install

```bash
pnpm add @pshkv/sint-pdp-interceptor
```

## Usage

```ts
import { PolicyGateway } from "@pshkv/gate-policy-gateway";
import { SINTPDPInterceptor } from "@pshkv/sint-pdp-interceptor";

const gateway = new PolicyGateway({
  resolveToken: async (tokenId) => tokenStore.get(tokenId),
});

const interceptor = new SINTPDPInterceptor({
  gateway,
  defaultTokenId: "0192f17e-7f7f-7000-8000-000000000001",
});

const result = await interceptor.evaluate({
  caller_identity: "did:key:z6MkexampleAgent",
  mcp_call: {
    serverName: "filesystem",
    toolName: "readFile",
    params: { path: "/tmp/demo.txt" },
  },
});

if (result.verdict === "allow") {
  console.log("safe to proceed", result.decision);
}
```

## Request shape

`evaluate()` accepts a SEP-1763-style request envelope:

```ts
{
  caller_identity: string,
  mcp_call: {
    serverName?: string,
    toolName?: string,
    method?: string,
    resource?: string,
    action?: string,
    params?: Record<string, unknown>
  },
  context?: {
    tokenId?: string,
    physicalContext?: SintRequest["physicalContext"],
    executionContext?: SintRequest["executionContext"],
    recentActions?: readonly string[]
  }
}
```

If `resource` is not supplied, the adapter defaults to:

```txt
mcp://{serverName}/{toolName}
```

If `action` is not supplied, the adapter defaults to `call`.

## Current milestone

This scaffold focuses on the adapter package and the core request/decision flow.
Bilateral receipts and the richer demo path are intentionally tracked as follow-on
flagship issues so the first package stays simple and installable.

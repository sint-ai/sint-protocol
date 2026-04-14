# @sint/bridge-mcp

MCP (Model Context Protocol) tool call interception and risk classification. Wraps any MCP server with SINT policy enforcement.

## Install

```bash
npm install @sint/bridge-mcp
```

## Usage

```typescript
import { MCPInterceptor } from "@pshkv/bridge-mcp";
import { PolicyGateway } from "@pshkv/gate-policy-gateway";

const interceptor = new MCPInterceptor({
  gateway: myPolicyGateway,
  sessionId: "agent-session-001",
});

// Intercept an MCP tool call
const decision = await interceptor.intercept({
  tool: { name: "write_file", arguments: { path: "/output.txt", content: "data" } },
  tokenId: "tok-abc",
});

console.log(decision.action); // "allow" | "deny" | "escalate"
```

### Middleware Mode

Drop into any MCP server as middleware:

```typescript
import { createSintMiddleware } from "@pshkv/bridge-mcp";

const middleware = createSintMiddleware({
  gateway: myPolicyGateway,
  onEscalate: async (ctx) => {
    // Route to approval dashboard or human operator
    return awaitApproval(ctx);
  },
});
```

## Features

- **MCP tool call interception** — transparent proxy between agent and MCP server
- **Automatic tier assignment** — classifies tools by risk (read vs. write vs. execute vs. shell)
- **Shell detection** — identifies and escalates shell execution tools
- **Tool Auth Manifest (TAM)** — MCP SEP-2385 reference implementation
- **Tool definition signing** — verify tool provenance with Ed25519
- **Session tracking** — forbidden combo detection across tool call sequences
- **Circuit breaker** — automatic lockout on abuse patterns

## Part of SINT Protocol

📖 [Full documentation](https://github.com/sint-ai/sint-protocol) · 🚀 [Getting Started](https://github.com/sint-ai/sint-protocol/blob/master/docs/getting-started.md)

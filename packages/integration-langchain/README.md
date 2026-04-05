# @sint/integration-langchain

SINT Protocol governance middleware for LangChain — capability tokens, policy enforcement, and evidence logging on every tool call.

## What it does

Wraps LangChain tool invocations with SINT Policy Gateway enforcement. Every tool call is intercepted, validated against the agent's capability token, and logged to the evidence ledger. Denied actions throw `SintDeniedError`.

## Install

```bash
npm install @sint/integration-langchain
```

## Usage

### Callback Handler (recommended)

```typescript
import { SintGovernanceHandler } from "@sint/integration-langchain";

const handler = new SintGovernanceHandler({
  gatewayUrl: "http://localhost:4100",
  agentId: "my-agent-pubkey",
  token: "capability-token-from-gateway", // optional
});

// Attach to any LangChain chain or agent
const result = await chain.invoke(input, { callbacks: [handler] });
```

### Tool Wrapper

```typescript
import { wrapToolsWithGovernance } from "@sint/integration-langchain";

const governedTools = wrapToolsWithGovernance(tools, {
  gatewayUrl: "http://localhost:4100",
  agentId: "my-agent-pubkey",
});

const agent = createReactAgent({ llm, tools: governedTools });
```

### Custom Resource Mapping

```typescript
const handler = new SintGovernanceHandler({
  gatewayUrl: "http://localhost:4100",
  agentId: "my-agent",
  resourceMapper: (toolName) => `myapp:${toolName}`,
  actionMapper: (toolName) =>
    toolName.startsWith("write") ? "write" : "read",
});
```

### Non-throwing Mode

```typescript
const handler = new SintGovernanceHandler({
  gatewayUrl: "http://localhost:4100",
  agentId: "my-agent",
  throwOnDeny: false, // returns denial string instead of throwing
});
```

## How it works

1. Agent invokes a LangChain tool
2. Handler sends `POST /v1/intercept` to SINT Gateway
3. Gateway validates capability token, checks constraints, evaluates policy
4. If approved → tool executes normally
5. If denied → `SintDeniedError` is thrown (or denial string returned)
6. Decision is logged to SHA-256 evidence ledger

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `gatewayUrl` | `string` | required | SINT Gateway URL |
| `agentId` | `string` | required | Agent identifier |
| `token` | `string` | optional | Capability token |
| `apiKey` | `string` | optional | Admin API key |
| `throwOnDeny` | `boolean` | `true` | Throw on denied actions |
| `logEvidence` | `boolean` | `true` | Log to evidence ledger |
| `resourceMapper` | `function` | `tool:{name}` | Map tool name → SINT resource |
| `actionMapper` | `function` | `execute` | Map tool name → SINT action |
| `timeoutMs` | `number` | `5000` | Gateway request timeout |

## Requirements

- SINT Protocol gateway running (see [Getting Started](https://docs.sint.gg/getting-started))
- Node.js 20+

## License

MIT — [SINT AI Lab](https://sint.gg)

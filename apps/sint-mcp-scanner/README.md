# @sint/mcp-scanner

**Scan any MCP server's tool definitions for security risk** — instantly see which tools need human approval, which are shell-exec risks (OWASP ASI05), and what tier each tool maps to in the SINT authorization model.

```bash
npx sint-scan --server myserver --tools '[{"name":"bash","description":"runs shell commands"}]'
```

## What it does

Maps every MCP tool to a SINT approval tier:

| Tier | Risk | Requires Human Approval | Example Tools |
|------|------|------------------------|---------------|
| T0 | LOW | No | `readFile`, `getInfo`, `listDirectory` |
| T1 | MEDIUM | No | `writeFile`, `createDirectory`, `search` |
| T2 | HIGH | Yes | `deleteFile`, `moveFile`, `modifyConfig` |
| T3 | CRITICAL | Yes (M-of-N quorum) | `bash`, `exec`, `eval`, `run_command` |

Shell/exec tool names are **always T3 CRITICAL** regardless of server, addressing [OWASP ASI05](https://github.com/sint-ai/sint-protocol).

## Usage

### Pipe from JSON

```bash
echo '[
  {"name":"readFile","description":"reads a file"},
  {"name":"bash","description":"runs shell commands"},
  {"name":"deleteFile","description":"deletes a file"}
]' | npx sint-scan --server my-mcp-server
```

### Pass tools inline

```bash
npx sint-scan \
  --server filesystem \
  --tools '[{"name":"writeFile","description":"writes content to a file"}]'
```

### With MCP annotations

```bash
npx sint-scan --server myserver --tools '[
  {"name":"processData","description":"processes data","annotations":{"destructiveHint":true}},
  {"name":"queryDB","description":"queries database","annotations":{"readOnlyHint":true}}
]'
```

## Output

```
══════════════════════════════════════════════
 SINT MCP Security Scanner Report
══════════════════════════════════════════════
  Server:      my-mcp-server
  Scanned at:  2026-04-04T15:00:00.000Z
  Total tools: 3
  Overall risk: CRITICAL

Risk Summary:
  CRITICAL: 1
  HIGH:     1
  MEDIUM:   0
  LOW:      1

High-Risk Tools:
  [CRITICAL] bash
       • Tool name or server ID matches shell/exec keyword (ASI05)
  [HIGH    ] deleteFile
       • Tool classified as destructive/state-changing operation

All Tools:
  [LOW     ] readFile
  [HIGH    ] deleteFile  [HUMAN APPROVAL]
  [CRITICAL] bash        [HUMAN APPROVAL]

Recommendations:
  → Require human approval for CRITICAL tools before any agent invocation.
  → 1 shell/exec tool(s) detected — restrict to verified sandboxes only (ASI05).
  → Enable SINT capability tokens with strict resource scoping for high-risk tools.
══════════════════════════════════════════════
```

Exit code `2` if any CRITICAL tools are found — use in CI/CD pipelines.

## Adding SINT protection

Once you know which tools need protection, add the SINT gateway proxy:

```typescript
import { PolicyGateway } from "@sint/gate-policy-gateway";
import { MCPInterceptor } from "@sint/bridge-mcp";

const interceptor = new MCPInterceptor({ gateway });
const result = interceptor.interceptToolCall(sessionId, toolCall);
// result.action === "forward" | "deny" | "escalate"
```

Full guide: [docs/guides/secure-mcp-deployments.md](https://github.com/sint-ai/sint-protocol/blob/master/docs/guides/secure-mcp-deployments.md)

## Install

```bash
npm install -g @sint/mcp-scanner
# then: sint-scan --help
```

## Links

- **GitHub:** https://github.com/sint-ai/sint-protocol
- **OWASP ASI conformance suite:** https://github.com/sint-ai/sint-protocol/blob/master/packages/conformance-tests/src/mcp-attack-surface.test.ts
- **MCP servers PR:** https://github.com/modelcontextprotocol/servers/pull/3828

# sint-scan

**Scan any MCP server for risky tools in 10 seconds.**

```bash
npx sint-scan --tools '[{"name":"bash","description":"runs shell commands"},{"name":"readFile","description":"reads files"}]'
```

```
══════════════════════════════════════════
  SINT MCP Security Scanner  sint.gg
══════════════════════════════════════════
  Server:  my-server
  Tools:   2
  Risk:    CRITICAL
  OWASP:   ASI05

  [T3] bash ⚠ human approval
       Shell/command execution — OWASP ASI05
       OWASP ASI05: Shell/exec execution
  [T0] readFile
       No risk signals detected

  LOW=1  MEDIUM=0  HIGH=0  CRITICAL=1

  Recommendations:
  • Add SINT policy bundle with human_review_triggers on T3 tools
  • Sandbox shell-exec tools — see sint.gg/docs/policy-bundles
  • Full governance layer: https://sint.gg
```

## What it does

Maps every MCP tool to a SINT approval tier based on name and description:

| Tier | Risk | Human Approval | Examples |
|------|------|----------------|---------|
| T0 OBSERVE | LOW | No | `readFile`, `getInfo`, `listDirectory` |
| T1 PREPARE | MEDIUM | No | `writeFile`, `createDir`, `search` |
| T2 ACT | HIGH | Yes | `deleteFile`, `modifyConfig`, `gitPush` |
| T3 COMMIT | CRITICAL | Yes | `bash`, `exec`, `eval`, `run_command` |

Shell/exec tools are **always T3 CRITICAL** — addresses [OWASP ASI05](https://owasp.org/www-project-top-10-for-large-language-model-applications/).

## Usage

```bash
# Inline tools
npx sint-scan --server myserver --tools '[{"name":"bash"},{"name":"readFile"}]'

# Pipe JSON
echo '[{"name":"writeFile"}]' | npx sint-scan --server filesystem

# JSON output for CI/CD (exits 1 if CRITICAL found)
npx sint-scan --json --tools '[...]'

# MCP annotations supported
npx sint-scan --tools '[{"name":"delete","annotations":{"destructiveHint":true}}]'
```

## CI integration

```yaml
- name: Scan MCP tools for security risks
  run: npx sint-scan --json --tools "$TOOLS"
  # Exits 1 if CRITICAL tools found without policy bundle
```

## What's next

`sint-scan` is the entry point to [SINT Protocol](https://github.com/sint-ai/sint-protocol):

- **Policy bundles** — machine-readable contracts governing agent tool calls
- **T0–T3 tiers** — graduated human oversight for consequential actions  
- **Hash-chained audit receipts** — tamper-evident proof of every agent action
- **Physical AI safety** — velocity, force, geofence constraints in capability tokens
- **RFC-001** — open standard submitted to AAIF working group

## Links

- **Protocol:** https://github.com/sint-ai/sint-protocol
- **RFC-001:** https://github.com/sint-ai/sint-protocol/blob/main/docs/rfcs/RFC-001-policy-bundle.md
- **AAIF Proposal:** https://github.com/aaif/project-proposals/issues/12
- **X:** https://x.com/sintlabs

Apache-2.0 © SINT Labs

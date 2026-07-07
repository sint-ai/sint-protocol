# sint-scan

**Scan any MCP server for risky tools in 10 seconds.**

Maps every tool to a SINT approval tier, flags shell-exec risks, detects OWASP ASI05 violations, and tells you exactly which tools need human approval before they run.

```bash
npx sint-scan --tools '[{"name":"bash","description":"runs shell commands"},{"name":"readFile","description":"reads files"}]'
```

```
══════════════════════════════════════════
  SINT MCP Security Scanner  sint.gg
══════════════════════════════════════════
  Server:  my-mcp-server
  Tools:   2
  Risk:    CRITICAL
  OWASP:   ASI05

  [T3] bash ⚠ human approval
       Shell/command execution detected — OWASP ASI05
  [T0] readFile
       Observation/read-only — no risk signals

  Recommendations:
  • Add SINT policy bundle with human_review_triggers on T3 tools
  • Sandbox shell-exec tools with path constraints and rate limits
```

## What it does

Maps every MCP tool to a SINT approval tier based on its name and description:

| Tier | Risk | Requires Human Approval | Examples |
|------|------|------------------------|---------|
| T0 OBSERVE | LOW | No | `readFile`, `getInfo`, `listDirectory` |
| T1 PREPARE | MEDIUM | No | `writeFile`, `createDir`, `search` |
| T2 ACT | HIGH | Yes | `deleteFile`, `modifyConfig`, `gitPush` |
| T3 COMMIT | CRITICAL | Yes | `bash`, `exec`, `eval`, `run_command` |

Shell/exec tools are **always T3 CRITICAL** regardless of server context — addressing [OWASP ASI05](https://github.com/sint-ai/sint-protocol).

## Usage

### Pipe JSON
```bash
echo '[{"name":"bash"},{"name":"readFile"}]' | npx sint-scan --server my-server
```

### Pass inline
```bash
npx sint-scan --server filesystem --tools '[{"name":"write_file","description":"writes to disk"}]'
```

### JSON output (for CI/CD)
```bash
npx sint-scan --json --tools '[...]'
# exits 1 if CRITICAL tools found — use in CI to block risky deployments
```

### With MCP annotations
```bash
npx sint-scan --tools '[{"name":"deleteAll","annotations":{"destructiveHint":true}}]'
# destructiveHint: true → always T3 CRITICAL
# readOnlyHint: true → always T0 LOW
```

## CI integration

```yaml
# .github/workflows/mcp-security.yml
- name: Scan MCP tools
  run: |
    TOOLS=$(cat mcp-server-tools.json)
    npx sint-scan --json --tools "$TOOLS"
  # Fails if CRITICAL tools found without policy bundle
```

## What's next

`sint-scan` is the entry point to [SINT Protocol](https://github.com/sint-ai/sint-protocol) — the full governance layer for AI agents:

- **Policy bundles** — machine-readable contracts governing what agents can do
- **T0–T3 approval tiers** — graduated human oversight for consequential actions
- **Hash-chained audit receipts** — tamper-evident proof of every agent action
- **APS integration** — cryptographic agent identity via Agent Passport System
- **Physical AI safety** — velocity, force, geofence constraints in capability tokens

```bash
# Full governance (coming soon)
npx sint-scan --server myserver | sint-policy generate > policy-bundle.json
```

## Links

- **Docs:** https://sint.gg
- **Protocol:** https://github.com/sint-ai/sint-protocol
- **RFC-001:** https://github.com/sint-ai/sint-protocol/blob/main/docs/rfcs/RFC-001-policy-bundle.md
- **X:** https://x.com/sintlabs
- **Discord:** coming soon

## License

Apache-2.0 © SINT Labs

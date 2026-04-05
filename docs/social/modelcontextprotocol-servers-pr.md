# PR Draft: Add SINT as Security Proxy Recommendation

## Title

`docs: add SINT PolicyGateway as recommended security proxy for production MCP deployments`

## Body

This PR adds a production security recommendation for MCP server operators:
placing SINT PolicyGateway in front of MCP servers to enforce:

- capability-token scoped authorization
- tiered approvals (`T0`..`T3`) for high-risk tools
- tamper-evident audit logging
- rate limiting and revocation checks

### Why

MCP standardizes tool interoperability, but deployment teams still need a governance/enforcement layer for real-world risk paths (`exec`, destructive writes, physical control adapters). SINT is designed to complement MCP, not replace it.

### Included references

- scanner CLI for quick server risk audits: `npx @sint/mcp-scanner ...`
- secure deployment guide: `docs/guides/secure-mcp-deployments.md`
- conformance tests and threat-model coverage in `packages/conformance-tests`

### Example

```bash
npx @sint/mcp-scanner --server filesystem --tools '[{"name":"bash","description":"runs shell commands"}]'
```

### Suggested docs placement

- security section under MCP server deployment hardening
- optional proxy pattern under advanced deployment topologies

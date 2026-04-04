/**
 * @sint/mcp-scanner — CLI for auditing MCP server tool definitions.
 *
 * Detects:
 *   - Tools missing `readOnlyHint`/`destructiveHint`/`openWorldHint` annotations
 *   - Annotation → SINT tier mismatches (e.g. destructiveHint=true but not T3_COMMIT)
 *   - Shell/exec tools not classified at T3_COMMIT
 *   - Supply-chain risks (no Ed25519 signature on tool definition)
 *
 * Usage:
 *   sint-mcp-scan --server http://localhost:3000 --output json
 *   sint-mcp-scan --tools ./tools.json --strict
 *
 * @module @sint/mcp-scanner/cli
 *
 * TODO (this branch):
 *   [ ] Implement MCP server discovery (connect + list_tools)
 *   [ ] Build annotation→tier crosswalk checker
 *   [ ] Add Ed25519 tool-definition signature verification
 *   [ ] JSON/SARIF/table output formats
 *   [ ] GitHub Actions integration (exit code 1 on violations)
 *   [ ] Integration with @sint/gate-policy-gateway tier assigner
 */

console.log("@sint/mcp-scanner — not yet implemented. See TODO in cli.ts.");
process.exit(1);

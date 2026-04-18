# Publish `sint-mcp` To The Official MCP Registry

This repo ships an official MCP Registry manifest at `.mcp/server.json`.

## What Gets Published

- Registry listing name: `io.github.pshkv/sint-mcp`
- npm package: `sint-mcp`
- Transport: `stdio`

The `apps/sint-mcp/README.md` includes the required marker:

```text
<!-- mcp-name: io.github.pshkv/sint-mcp -->
```

## Publish Steps

1. Download the `mcp-publisher` binary for your OS/arch from the latest release of `modelcontextprotocol/registry`.
2. Authenticate (GitHub-based namespace):

```bash
./mcp-publisher login github
```

3. Publish the manifest:

```bash
./mcp-publisher publish .mcp/server.json
```

4. Verify in the registry UI by searching for `sint-mcp`.


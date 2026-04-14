# SINT Domain Architecture

## Active (use now)

| Domain | Purpose | Status |
|---|---|---|
| `sint.gg` | Primary product homepage | ✅ Live (Lovable) |
| `docs.sint.gg` | Documentation | ✅ Live (VitePress) |
| `badge.sint.gg` | Badge endpoint for READMEs | 🔧 Build next |
| `sint.work` | SINT Commons — Work Cell marketplace | → Point to sint.gg/commons for now |
| `sint.foundation` | Protocol Commons / standards org | → Point to sint.gg/protocol for now |

## Domain → destination mapping (set these DNS records today)

```
sint.work       CNAME → sint.gg          (redirect: /commons)
sint.foundation CNAME → sint.gg          (redirect: /protocol)
sintos.io       CNAME → sint.gg          (redirect: /)
sint.click      CNAME → badge.sint.gg    (badge click tracker — clever)
sint.email      CNAME → sint.gg          (redirect: /, park for later)
sintfi.com      CNAME → sint.gg          (redirect: /, park for later)
sintifi.com     CNAME → sintfi.com        (redirect only)
sint.ink        → Let expire (no use case)
sint.game       → Let expire (no use case)
```

## Long-term domain strategy (Phase 2+)

### `sint.work` → SINT Commons marketplace
When the Work Cell marketplace launches:
- `sint.work` = the marketplace (agents executing work, getting paid)
- Cleaner than `sint.gg/commons`
- Short, memorable, on-brand
- "Where agents work."

### `sint.foundation` → Protocol Commons / open standards
When Protocol Commons has enough community:
- Home for RFC-001, vocabulary crosswalk, conformance tests
- Distinct from the commercial product
- Standards bodies trust `.foundation` TLDs
- "The open governance standard for AI agents."

### `sintos.io` → SINT OS (future)
If SINT evolves into a full agentic OS (model companies start owning layers):
- `sintos.io` as the broader platform brand
- "The operating system for agent fleets."

### `sint.click` → Badge click tracking (clever, use now)
- Every badge on GitHub links to `sint.click/{org}/{repo}`
- Captures click analytics before redirecting to sint.gg
- Lets you track badge engagement separately from site traffic
- Set up: `sint.click/{org}/{repo}` → `sint.gg/{org}/{repo}` with UTM

### `sintfi.com` → Economy layer (Phase 3)
- When the credits economy matures into a real financial product
- Agent payments, credits marketplace, escrow dashboard
- Distinct from the governance product

## Immediate DNS actions (do today)

1. Namecheap/Cloudflare: Add CNAME for `sint.work` → `sint.gg`
2. Add CNAME for `sint.foundation` → `sint.gg`  
3. Add CNAME for `sintos.io` → `sint.gg`
4. Once badge endpoint is live: Add CNAME `sint.click` → `badge.sint.gg`
5. Let `sint.game` and `sint.ink` expire at next renewal

## README badge line (use on all SINT repos)

```markdown
[![SINT Protocol](https://badge.sint.gg/badge/sint-ai/sint-protocol.svg)](https://sint.gg)
```

## Glama.ai claim (do manually today)

1. Go to: https://glama.ai/mcp/servers/sint-ai/sint-protocol/admin
2. Click "Claim this server" 
3. Verify via GitHub (they check repo ownership)
4. Once claimed:
   - Upload logo (orange N icon from sint.gg)
   - Add one-liner: "The open-source governance layer for AI agents — scan MCP servers, enforce policy bundles, prove compliance."
   - Add homepage: https://sint.gg
   - Use the repo-root `Dockerfile` for the Glama build spec so the server can be inspected and released
   - Fix the installable status: needs `@sint/mcp` published to npm

## npm publish (do from Mac Mini)

```bash
# sint-scan is in outputs — download and publish
cd ~/Downloads/sint-scan
npm login  # use sint-ai npm org account
npm publish --access public

# Verify
npx sint-scan --help
```

## modelcontextprotocol/servers submission (after npm publish)

Submit PR to add sint-scan:
- Repo: https://github.com/modelcontextprotocol/servers
- Add entry to README under "Security" category
- Title: "SINT MCP Scanner — scan any MCP server for risky tools"
- URL: https://github.com/sint-ai/sint-protocol
- npm: `npx sint-scan`

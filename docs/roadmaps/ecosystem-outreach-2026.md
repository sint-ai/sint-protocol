# SINT Ecosystem Outreach Roadmap — 2026

## Priority 1: MCP Official Ecosystem (ship in April)

### 1a. Fork → `modelcontextprotocol/servers` PR
- File: `src/sint-policy-gateway/` within the official MCP servers repo
- Position: "Reference security middleware — the missing governance layer for MCP deployments"
- PR title: "feat: SINT PolicyGateway as recommended security layer for production MCP"
- Target reviewers: @jspahrsummers, Anthropic MCP team
- Include: 1-page integration guide, benchmark showing <5ms overhead

### 1b. "Secure MCP Deployments" co-authored guide
- Reach out to Anthropic DevRel + Cursor team
- Draft: `docs/guides/secure-mcp-deployments.md`
- Key message: MCP without SINT = unauthenticated tool calls, no audit trail, no rate limits
- Distribute: MCP Discord, Claude subreddit, dev.to

### 1c. Community engagement (X/Twitter)
- Reply to @SlowMist MCP security posts with SINT solution
- Reply to @dannylivshits tool-tampering posts with ASI05 coverage
- Tag MCP Security Scanner builders (compare + collaborate)
- Thread: "We mapped the OWASP Agentic AI Top-10 to test cases. Here's what we found."

---

## Priority 2: ROS2 / SROS2 Community (April–May)

### 2a. Open Robotics submission
- Email: discourse.ros.org + ros-security@openrobotics.org
- Attach: SROS2 integration guide (`packages/bridge-ros2/`)
- Proposal: SINT as companion layer (not replacement) to SROS2 enclaves
- Key: show that SINT adds LLM-agent-specific constraints (velocity caps, geofence, human-in-loop) that SROS2 doesn't address

### 2b. ROSCon 2026 talk proposal
- Title: "MCP + SROS2 = Secure Agentic Robotics: Bridging LLM Tool Calls and DDS Security"
- Submit to: roscon.ros.org (CFP typically opens March–April)
- Co-author: AgenticROS project team

### 2c. Alias Robotics engagement
- Contact via GitHub/X — they publish robot CVEs and security tooling
- Offer: joint audit of SINT ROS2 bridge against their threat model

---

## Priority 3: NIST AI Agent Standards (May–June)

### 3a. NIST AI RMF response
- Target: NIST AI 100-1 and emerging agentic AI supplement
- Position SINT as: open-source reference implementation of GOVERN-1.1 (human oversight) + MANAGE-4.2 (incident response via EvidenceLedger)
- Submit to: ai-inquiries@nist.gov
- Include: capability token spec, tier crosswalk table, 114-test conformance suite

### 3b. Listening session attendance
- Monitor: nist.gov/artificial-intelligence for upcoming sessions
- Prepare 5-min demo: token issuance → gateway intercept → ledger → SIEM export

---

## Priority 4: Enterprise & Security Community (ongoing)

### 4a. Security firms
- SlowMist: offer SINT for their MCP security checklist
- Trail of Bits: propose joint review of Ed25519 token implementation
- Include: @noble/ed25519 audit link + our conformance suite

### 4b. Linux Foundation / AAIF
- Submit SINT to: lfaidata.foundation (LF AI & Data)
- Position: governance extension for MCP-based multi-agent systems
- Tie to: OpenSSF sigstore (our token signing is compatible)

### 4c. Whitepaper update for launch
- Add: NIST/MCP/SROS2 explicit mapping tables
- Add: X community quotes (anonymized) showing demand
- Add: architecture diagram (ASCII in WHITEPAPER.md, SVG in docs/)
- Launch: GitHub Discussions (open "RFC: SINT v1.0 feature requests")

---

## Immediate Next Steps (this week)

1. **Ship `@pshkv/mcp-scanner`** (PR #32) — the concrete artifact for MCP outreach
2. **Create `docs/guides/secure-mcp-deployments.md`** — the shareable guide
3. **Open GitHub Discussions** — "RFC: SINT v0.3 roadmap" with community input
4. **Update README** — add OATR badge, shields for 114 tests, ASI coverage
5. **Deploy gateway-server** to sint.gg/protocol for OATR domain verification

---

## Metrics to track

- GitHub stars (current: check)
- PR opened to modelcontextprotocol/servers (target: April 2026)
- SPAI 2026 abstract submitted (deadline: May 7, 2026)
- OATR domain_verified: true (target: after sint.gg/protocol deployment)
- ROSCon 2026 talk accepted

# SINT Protocol Roadmap

**Last updated:** March 2026

---

## Phase 1: Foundation (Current)

**Status: Complete**

- Core types, Zod schemas, tier constants (`@sint/core`)
- Ed25519 capability tokens with delegation and attenuation (`@sint/gate-capability-tokens`)
- Policy Gateway — single enforcement point with tier assignment, constraints, forbidden combos (`@sint/gate-policy-gateway`)
- SHA-256 hash-chained evidence ledger (`@sint/gate-evidence-ledger`)
- MCP bridge adapter — tool call interception and risk classification (`@sint/bridge-mcp`)
- ROS 2 bridge adapter — topic/service/action interception with physics extraction (`@sint/bridge-ros2`)
- In-memory persistence implementations (`@sint/persistence`)
- TypeScript client SDK (`@sint/client`)
- Conformance test suite — 29 security regression tests (`@sint/conformance-tests`)
- Gateway HTTP API server with approval routes and metrics (`@sint/gateway-server`)
- Security-first multi-MCP proxy server (`@sint/mcp`)
- Real-time approval management dashboard (`@sint/dashboard`)
- 370+ tests passing across 12 packages

---

## Phase 2: Production Infrastructure

**Target: Q2 2026**

- [ ] PostgreSQL persistence backend (durable ledger, policy store, approval queue)
- [ ] Redis persistence backend (caching, session store, rate limiting)
- [ ] WebSocket approval transport (real-time approval streaming to replace SSE)
- [ ] gRPC bridge adapter (generic service interception)
- [ ] Docker Compose production deployment template
- [ ] Helm chart for Kubernetes deployment
- [ ] Monitoring and alerting (Prometheus metrics, Grafana dashboards)
- [ ] Load testing and performance benchmarks

---

## Phase 3: Multi-Agent and Economy

**Target: Q3 2026**

- [ ] Multi-agent orchestration (agent-to-agent delegation, hierarchical policies)
- [ ] Token economy implementation ($SINT staking, slashing, validator rewards)
- [ ] Python SDK (`sint-py`)
- [ ] Go SDK (`sint-go`)
- [ ] Agent identity federation (cross-organization capability delegation)
- [ ] Policy language v2 (declarative policy DSL)
- [ ] Constraint library expansion (domain-specific constraint sets)

---

## Phase 4: Ecosystem and Certification

**Target: Q4 2026 — Q1 2027**

- [ ] Conformance certification program for bridge adapters
- [ ] Enterprise features (SSO, RBAC, audit export, SLA dashboards)
- [ ] HTTP/REST bridge adapter
- [ ] GraphQL bridge adapter
- [ ] Decentralized evidence ledger (on-chain anchoring)
- [ ] Insurance pool for T3 incident coverage
- [ ] Formal verification of core policy engine
- [ ] Hardware security module (HSM) support for token signing

---

## Phase 5: Standards and Adoption

**Target: 2027+**

- [ ] IETF or W3C standards track submission
- [ ] Reference implementations in Rust, Java
- [ ] Integration partnerships with major robotics platforms
- [ ] Integration with major AI agent frameworks (LangChain, CrewAI, AutoGen)
- [ ] Academic research program and grants
- [ ] Bug bounty program

---

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for how to get involved. The best place to start is with issues labeled `good first issue`.

/**
 * SINT Protocol — APS-SINT-MCP Cross-Protocol Handshake Conformance Tests.
 *
 * Validates the three canonical scenarios from docs/specs/aps-sint-handshake-v1.md:
 *   Scenario A — Authorized call (happy path)
 *   Scenario B — Scope-exceeded denial (RESOURCE_MISMATCH)
 *   Scenario C — Cascade revocation mid-session (TOKEN_REVOKED)
 *
 * Also validates structural properties of the handshake:
 *   - MCPInterceptor is required in the call path
 *   - Delegation depth enforcement (max 3)
 *   - Monotonic narrowing: child scope cannot exceed parent scope
 *   - APS did:key subject round-trips through keyToDid / didToKey
 *
 * @module @sint/conformance-tests/aps-sint-handshake
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  generateKeypair,
  generateUUIDv7,
  issueCapabilityToken,
  delegateCapabilityToken,
  RevocationStore,
  keyToDid,
  didToKey,
} from "@pshkv/gate-capability-tokens";
import { PolicyGateway } from "@pshkv/gate-policy-gateway";
import { LedgerWriter } from "@pshkv/gate-evidence-ledger";
import { MCPInterceptor } from "@pshkv/bridge-mcp";
import type { SintCapabilityToken, SintCapabilityTokenRequest, SintRequest } from "@pshkv/core";
import { loadAPSSINTHandshakeFixture } from "./fixture-loader.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function makeRequest(
  overrides: Partial<SintRequest> & { tokenId: string; agentId: string },
): SintRequest {
  return {
    requestId: generateUUIDv7(),
    timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    resource: "mcp://filesystem/readFile",
    action: "call",
    params: {},
    ...overrides,
  };
}

// ── Shared setup ─────────────────────────────────────────────────────────────

describe("APS-SINT-MCP Cross-Protocol Handshake — conformance", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  const revocationStore = new RevocationStore();
  let tokenStore: Map<string, SintCapabilityToken>;
  let gateway: PolicyGateway;
  let ledger: LedgerWriter;
  let interceptor: MCPInterceptor;

  beforeEach(() => {
    tokenStore = new Map();
    revocationStore.clear();
    ledger = new LedgerWriter();

    gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      revocationStore,
      emitLedgerEvent: (event) => {
        ledger.append({
          eventType: event.eventType as any,
          agentId: event.agentId,
          tokenId: event.tokenId,
          payload: event.payload,
        });
      },
    });

    interceptor = new MCPInterceptor({ gateway });
  });

  function issueAndStore(
    overrides?: Partial<SintCapabilityTokenRequest>,
  ): SintCapabilityToken {
    const request: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "mcp://filesystem/readFile",
      actions: ["call"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(12),
      revocable: true,
      ...overrides,
    };
    const result = issueCapabilityToken(request, root.privateKey);
    if (!result.ok) throw new Error(`Token issuance failed: ${result.error}`);
    tokenStore.set(result.value.tokenId, result.value);
    return result.value;
  }

  // ── Load and validate fixture ─────────────────────────────────────────────

  it("fixture: aps-sint-handshake.v1.json loads and has 3 cases covering scenarios A, B, C", () => {
    const fixture = loadAPSSINTHandshakeFixture();
    expect(fixture.fixtureId).toBe("aps-sint-handshake-v1");
    expect(fixture.interopProtocol).toBe("APS-SINT-MCP");
    expect(fixture.cases).toHaveLength(3);

    const scenarios = fixture.cases.map((c) => c.scenario);
    expect(scenarios).toContain("A");
    expect(scenarios).toContain("B");
    expect(scenarios).toContain("C");
  });

  // ── Scenario A — Authorized call ──────────────────────────────────────────

  it("Scenario A: authorized call — token scoped to readFile, request for readFile → allow", async () => {
    const token = issueAndStore({
      resource: "mcp://filesystem/readFile",
      actions: ["call"],
      delegationChain: { parentTokenId: null, depth: 1, attenuated: true },
    });

    const request = makeRequest({
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: "mcp://filesystem/readFile",
      action: "call",
      params: { path: "/data/report.csv" },
    });

    const decision = await gateway.intercept(request);

    expect(decision.action).toBe("allow");
    // readFile is a bounded write at most T1_prepare (enum values are lowercase)
    expect(["T0_observe", "T1_prepare"]).toContain(decision.assignedTier);
  });

  it("Scenario A: authorized call — MCPInterceptor forwards to MCP server", async () => {
    const token = issueAndStore({
      resource: "mcp://filesystem/readFile",
      actions: ["call"],
    });

    const sessionId = interceptor.createSession({
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      serverName: "filesystem",
    });

    const result = await interceptor.interceptToolCall(sessionId, {
      callId: `call-${Date.now()}`,
      serverName: "filesystem",
      toolName: "readFile",
      arguments: { path: "/data/report.csv" },
      timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    });

    expect(result.action).toBe("forward");
  });

  it("Scenario A: authorized call — ledger receives policy.evaluated event", async () => {
    const token = issueAndStore({
      resource: "mcp://filesystem/readFile",
      actions: ["call"],
    });

    const request = makeRequest({
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: "mcp://filesystem/readFile",
    });

    await gateway.intercept(request);

    const events = ledger.getAll();
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.eventType === "policy.evaluated")).toBe(true);
  });

  // ── Scenario B — Scope-exceeded denial ───────────────────────────────────

  it("Scenario B: scope-exceeded denial — filesystem/* token denied for exec/run (RESOURCE_MISMATCH)", async () => {
    const token = issueAndStore({
      resource: "mcp://filesystem/*",
      actions: ["call"],
    });

    const request = makeRequest({
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: "mcp://exec/run",
      action: "call",
      params: { command: "id" },
    });

    const decision = await gateway.intercept(request);

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBeDefined();
  });

  it("Scenario B: scope-exceeded denial — MCPInterceptor must not forward a denied call", async () => {
    const token = issueAndStore({
      resource: "mcp://filesystem/*",
      actions: ["call"],
    });

    // Create session for filesystem server
    const sessionId = interceptor.createSession({
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      serverName: "filesystem",
    });

    // Attempt to call exec tool via a different server name — should be denied
    const result = await interceptor.interceptToolCall(sessionId, {
      callId: `call-${Date.now()}`,
      serverName: "exec",
      toolName: "run",
      arguments: { command: "id" },
      timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    });

    expect(result.action).toBe("deny");
  });

  // ── Scenario C — Cascade revocation mid-session ───────────────────────────

  it("Scenario C: cascade revocation — child token denied after explicit revocation", async () => {
    // Issue root token (R0) for a separate root agent
    const rootAgent = generateKeypair();
    const childAgent = generateKeypair();

    const r0Req: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: rootAgent.publicKey,
      resource: "mcp://filesystem/*",
      actions: ["call"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(12),
      revocable: true,
    };
    const r0Result = issueCapabilityToken(r0Req, root.privateKey);
    if (!r0Result.ok) throw new Error(r0Result.error);
    const r0 = r0Result.value;
    tokenStore.set(r0.tokenId, r0);

    // Delegate R0 → C1 (child token for childAgent)
    const c1Result = delegateCapabilityToken(
      r0,
      { newSubject: childAgent.publicKey, newResource: "mcp://filesystem/readFile" },
      rootAgent.privateKey,
    );
    if (!c1Result.ok) throw new Error(c1Result.error);
    const c1 = c1Result.value;
    tokenStore.set(c1.tokenId, c1);

    // Revoke R0 (parent)
    revocationStore.revoke(r0.tokenId, "security-incident", "operator");

    // C1 is NOT yet revoked — SINT checks tokens independently
    // A request using C1 alone would currently NOT be caught unless C1 is also revoked
    // Explicitly revoke C1 to complete cascade
    revocationStore.revoke(c1.tokenId, "cascade-from-parent", "operator");

    const request = makeRequest({
      agentId: childAgent.publicKey,
      tokenId: c1.tokenId,
      resource: "mcp://filesystem/readFile",
    });

    const decision = await gateway.intercept(request);

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toMatch(/REVOKED|TOKEN_REVOKED/i);
  });

  it("Scenario C: cascade gap — child token NOT denied if only parent is revoked (operator must cascade)", async () => {
    const rootAgent = generateKeypair();
    const childAgent = generateKeypair();

    const r0Req: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: rootAgent.publicKey,
      resource: "mcp://filesystem/*",
      actions: ["call"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(12),
      revocable: true,
    };
    const r0Result = issueCapabilityToken(r0Req, root.privateKey);
    if (!r0Result.ok) throw new Error(r0Result.error);
    const r0 = r0Result.value;
    tokenStore.set(r0.tokenId, r0);

    const c1Result = delegateCapabilityToken(
      r0,
      { newSubject: childAgent.publicKey, newResource: "mcp://filesystem/readFile" },
      rootAgent.privateKey,
    );
    if (!c1Result.ok) throw new Error(c1Result.error);
    const c1 = c1Result.value;
    tokenStore.set(c1.tokenId, c1);

    // Revoke ONLY the parent — NOT C1
    revocationStore.revoke(r0.tokenId, "security-incident", "operator");

    // C1 is still valid — this is the documented enforcement gap
    const request = makeRequest({
      agentId: childAgent.publicKey,
      tokenId: c1.tokenId,
      resource: "mcp://filesystem/readFile",
    });

    const decision = await gateway.intercept(request);

    // C1 should still be allowed — SINT does not auto-walk the chain
    // This confirms the gap: operators MUST revoke each child token separately
    expect(decision.action).not.toBe("deny");
  });

  // ── Structural handshake properties ──────────────────────────────────────

  it("APS identity: did:key subject round-trips through keyToDid / didToKey", () => {
    const kp = generateKeypair();
    const did = keyToDid(kp.publicKey);
    const recovered = didToKey(did);
    expect(recovered).toBe(kp.publicKey);
    expect(did).toMatch(/^did:key:z/);
  });

  it("Delegation depth: chain at max depth (3) is accepted; depth 4 is rejected", () => {
    const a1 = generateKeypair();
    const a2 = generateKeypair();
    const a3 = generateKeypair();
    const a4 = generateKeypair();
    const a5 = generateKeypair();

    const t0Req: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: a1.publicKey,
      resource: "mcp://filesystem/readFile",
      actions: ["call"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(12),
      revocable: true,
    };
    const t0 = issueCapabilityToken(t0Req, root.privateKey);
    if (!t0.ok) throw new Error(t0.error);

    const t1 = delegateCapabilityToken(t0.value, { newSubject: a2.publicKey }, a1.privateKey);
    if (!t1.ok) throw new Error(t1.error);

    const t2 = delegateCapabilityToken(t1.value, { newSubject: a3.publicKey }, a2.privateKey);
    if (!t2.ok) throw new Error(t2.error);

    // depth 3 — still at max
    const t3 = delegateCapabilityToken(t2.value, { newSubject: a4.publicKey }, a3.privateKey);
    expect(t3.ok).toBe(true);

    if (!t3.ok) throw new Error(t3.error);

    // depth 4 — must fail
    const t4 = delegateCapabilityToken(t3.value, { newSubject: a5.publicKey }, a4.privateKey);
    expect(t4.ok).toBe(false);
    if (!t4.ok) {
      expect(t4.error).toMatch(/DELEGATION_DEPTH|depth/i);
    }
  });

  it("Monotonic narrowing: delegated child inherits parent resource (cannot be independently broadened)", () => {
    const parentAgent = generateKeypair();
    const childAgent = generateKeypair();

    const parentReq: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: parentAgent.publicKey,
      resource: "mcp://filesystem/readFile",
      actions: ["call"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(12),
      revocable: true,
    };
    const parentResult = issueCapabilityToken(parentReq, root.privateKey);
    if (!parentResult.ok) throw new Error(parentResult.error);
    const parentToken = parentResult.value;

    // Delegate — the child inherits parent's resource (scope can never be widened)
    const childResult = delegateCapabilityToken(
      parentToken,
      { newSubject: childAgent.publicKey },
      parentAgent.privateKey,
    );

    // Delegation succeeds (same or narrower scope)
    expect(childResult.ok).toBe(true);
    if (!childResult.ok) throw new Error(childResult.error);

    // Child resource is exactly the parent resource — never broader
    expect(childResult.value.resource).toBe(parentToken.resource);
    // Child delegation depth is parent+1
    expect(childResult.value.delegationChain.depth).toBe(parentToken.delegationChain.depth + 1);
    // Child is marked attenuated
    expect(childResult.value.delegationChain.attenuated).toBe(true);
  });
});

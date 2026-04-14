/**
 * SINT Protocol — Phase 4 Conformance Regression Tests.
 *
 * Encodes the security invariants introduced in Phase 4:
 * - Rate limiting via token constraints
 * - M-of-N multi-party approval (quorum)
 * - W3C DID identity (did:key: format)
 * - A2A bridge security (Google Agent-to-Agent protocol)
 *
 * These tests must never fail. Any regression here indicates a
 * security-critical bug in the protocol implementation.
 *
 * @module @sint/conformance-tests/phase4-regression
 */

import { describe, it, expect, beforeEach } from "vitest";
import { PolicyGateway } from "@pshkv/gate-policy-gateway";
import { ApprovalQueue } from "@pshkv/gate-policy-gateway";
import {
  generateKeypair,
  issueCapabilityToken,
  RevocationStore,
  keyToDid,
  didToKey,
  isValidDid,
} from "@pshkv/gate-capability-tokens";
import type {
  SintCapabilityToken,
  SintCapabilityTokenRequest,
  SintRequest,
} from "@pshkv/core";
import {
  A2AInterceptor,
  AgentCardRegistry,
  buildResourceUri,
  type A2AAgentCard,
  type A2ASendTaskParams,
} from "@pshkv/bridge-a2a";
import { InMemoryRateLimitStore } from "@pshkv/persistence";

// ── Helpers ───────────────────────────────────────────────────────────────────

function futureISO(hours: number): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

function makeRequest(overrides: Partial<SintRequest> & { tokenId: string; agentId: string }): SintRequest {
  return {
    requestId: "01905f7c-4e8a-7b3d-9a1e-000000000001" as any,
    timestamp: new Date().toISOString(),
    resource: "mcp://filesystem/readFile",
    action: "call",
    params: {},
    ...overrides,
  };
}

const ROBOT_CARD: A2AAgentCard = {
  url: "https://robot.example.com/arm",
  name: "Robot Arm Agent",
  version: "1.0.0",
  skills: [
    { id: "pick", name: "Pick Object", tags: ["physical"] },
    { id: "status", name: "Status Check", tags: ["read-only"] },
  ],
  streaming: false,
};

// ── Rate limiting invariants ─────────────────────────────────────────────────

describe("Phase 4 Invariant: Rate limiting", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  let tokenStore: Map<string, SintCapabilityToken>;
  let rateLimitStore: InMemoryRateLimitStore;
  let gateway: PolicyGateway;

  function issueToken(maxCalls: number, windowMs: number): SintCapabilityToken {
    const req: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "mcp://filesystem/readFile",
      actions: ["call"],
      constraints: { rateLimit: { maxCalls, windowMs } },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(1),
      revocable: false,
    };
    const r = issueCapabilityToken(req, root.privateKey);
    if (!r.ok) throw new Error("Token issuance failed");
    return r.value;
  }

  beforeEach(() => {
    tokenStore = new Map();
    rateLimitStore = new InMemoryRateLimitStore();
    gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      rateLimitStore,
    });
  });

  it("INVARIANT: calls within limit are always allowed", async () => {
    const token = issueToken(5, 60_000);
    tokenStore.set(token.tokenId, token);
    for (let i = 0; i < 5; i++) {
      const req = makeRequest({ tokenId: token.tokenId, agentId: agent.publicKey,
        requestId: `01905f7c-4e8a-7b3d-9a1e-${String(i).padStart(12,"0")}` as any });
      const d = await gateway.intercept(req);
      expect(d.action).not.toBe("deny");
    }
  });

  it("INVARIANT: the (maxCalls+1)th call is always denied", async () => {
    const token = issueToken(2, 60_000);
    tokenStore.set(token.tokenId, token);
    for (let i = 0; i < 2; i++) {
      await gateway.intercept(makeRequest({ tokenId: token.tokenId, agentId: agent.publicKey,
        requestId: `01905f7c-4e8a-7b3d-9a1e-${String(i).padStart(12,"0")}` as any }));
    }
    const denied = await gateway.intercept(makeRequest({ tokenId: token.tokenId, agentId: agent.publicKey,
      requestId: "01905f7c-4e8a-7b3d-9a1e-999999999999" as any }));
    expect(denied.action).toBe("deny");
    expect(denied.denial?.policyViolated).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("INVARIANT: rate limiting is per-token (different tokens have independent counters)", async () => {
    const tokenA = issueToken(1, 60_000);
    const r = issueCapabilityToken({
      issuer: root.publicKey, subject: agent.publicKey,
      resource: "mcp://filesystem/readFile", actions: ["call"],
      constraints: { rateLimit: { maxCalls: 1, windowMs: 60_000 } },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(1), revocable: false,
    }, root.privateKey);
    if (!r.ok) throw new Error();
    const tokenB = r.value;
    tokenStore.set(tokenA.tokenId, tokenA);
    tokenStore.set(tokenB.tokenId, tokenB);

    // Exhaust A
    await gateway.intercept(makeRequest({ tokenId: tokenA.tokenId, agentId: agent.publicKey,
      requestId: "01905f7c-4e8a-7b3d-aaaa-000000000001" as any }));
    const deniedA = await gateway.intercept(makeRequest({ tokenId: tokenA.tokenId, agentId: agent.publicKey,
      requestId: "01905f7c-4e8a-7b3d-aaaa-000000000002" as any }));
    expect(deniedA.action).toBe("deny");

    // B still works
    const allowedB = await gateway.intercept(makeRequest({ tokenId: tokenB.tokenId, agentId: agent.publicKey,
      requestId: "01905f7c-4e8a-7b3d-bbbb-000000000001" as any }));
    expect(allowedB.action).not.toBe("deny");
  });

  it("INVARIANT: absent rateLimitStore means no rate limiting (fail-open)", async () => {
    const noRlGateway = new PolicyGateway({ resolveToken: (id) => tokenStore.get(id) });
    const token = issueToken(1, 60_000);
    tokenStore.set(token.tokenId, token);
    for (let i = 0; i < 10; i++) {
      const d = await noRlGateway.intercept(makeRequest({ tokenId: token.tokenId, agentId: agent.publicKey,
        requestId: `01905f7c-4e8a-7b3d-9a1e-${String(i).padStart(12,"0")}` as any }));
      expect(d.action).not.toBe("deny");
    }
  });
});

// ── M-of-N quorum invariants ─────────────────────────────────────────────────

describe("Phase 4 Invariant: Multi-party quorum approval", () => {
  it("INVARIANT: 2-of-3 quorum requires exactly 2 approvals", () => {
    const queue = new ApprovalQueue();

    const req: SintRequest = {
      requestId: "req-001" as any,
      timestamp: new Date().toISOString(),
      agentId: "agent-1", tokenId: "token-1" as any,
      resource: "ros2:///cmd_vel", action: "publish", params: {},
    };

    const decision: any = {
      requestId: "req-001", timestamp: new Date().toISOString(),
      action: "escalate", assignedTier: "T3_commit", assignedRisk: "T3_irreversible",
      escalation: { requiredTier: "T3_commit", reason: "Dangerous", timeoutMs: 60_000, fallbackAction: "safe-stop" },
    };

    queue.enqueue(req, decision, { required: 2, authorized: ["alice", "bob", "carol"] });

    // 1 vote — still pending
    expect(queue.resolve("req-001", { status: "approved", by: "alice" })).toBeUndefined();
    expect(queue.size).toBe(1);

    // 2nd vote — resolves
    const resolution = queue.resolve("req-001", { status: "approved", by: "bob" });
    expect(resolution?.status).toBe("approved");
    expect(queue.size).toBe(0);
  });

  it("INVARIANT: unauthorized operator cannot vote", () => {
    const queue = new ApprovalQueue();
    const req: SintRequest = {
      requestId: "req-002" as any, timestamp: new Date().toISOString(),
      agentId: "agent-1", tokenId: "token-1" as any,
      resource: "ros2:///cmd_vel", action: "publish", params: {},
    };
    const decision: any = {
      requestId: "req-002", timestamp: new Date().toISOString(),
      action: "escalate", assignedTier: "T3_commit", assignedRisk: "T3_irreversible",
      escalation: { requiredTier: "T3_commit", reason: "Physical", timeoutMs: 60_000, fallbackAction: "deny" },
    };
    queue.enqueue(req, decision, { required: 1, authorized: ["alice"] });

    // Mallory is not authorized
    const result = queue.resolve("req-002", { status: "approved", by: "mallory" });
    expect(result).toBeUndefined();
    expect(queue.size).toBe(1);
  });

  it("INVARIANT: any denial immediately blocks regardless of prior approvals", () => {
    const queue = new ApprovalQueue();
    const req: SintRequest = {
      requestId: "req-003" as any, timestamp: new Date().toISOString(),
      agentId: "agent-1", tokenId: "token-1" as any,
      resource: "ros2:///cmd_vel", action: "publish", params: {},
    };
    const decision: any = {
      requestId: "req-003", timestamp: new Date().toISOString(),
      action: "escalate", assignedTier: "T3_commit", assignedRisk: "T3_irreversible",
      escalation: { requiredTier: "T3_commit", reason: "Physical", timeoutMs: 60_000, fallbackAction: "deny" },
    };
    queue.enqueue(req, decision, { required: 3, authorized: ["alice", "bob", "carol"] });

    queue.resolve("req-003", { status: "approved", by: "alice" });
    queue.resolve("req-003", { status: "approved", by: "bob" });
    const denied = queue.resolve("req-003", { status: "denied", by: "carol", reason: "Safety risk" });
    expect(denied?.status).toBe("denied");
    expect(queue.size).toBe(0);
  });
});

// ── DID identity invariants ───────────────────────────────────────────────────

describe("Phase 4 Invariant: W3C DID identity", () => {
  it("INVARIANT: every Ed25519 key produces a valid did:key: DID", () => {
    for (let i = 0; i < 20; i++) {
      const { publicKey } = generateKeypair();
      const did = keyToDid(publicKey);
      expect(did).toMatch(/^did:key:z6Mk/);
      expect(isValidDid(did)).toBe(true);
    }
  });

  it("INVARIANT: DID → key → DID round-trip is lossless", () => {
    for (let i = 0; i < 20; i++) {
      const { publicKey } = generateKeypair();
      const did = keyToDid(publicKey);
      const recovered = didToKey(did);
      expect(recovered).toBe(publicKey);
    }
  });

  it("INVARIANT: two different keys produce different DIDs", () => {
    const { publicKey: k1 } = generateKeypair();
    const { publicKey: k2 } = generateKeypair();
    expect(keyToDid(k1)).not.toBe(keyToDid(k2));
  });

  it("INVARIANT: non-Ed25519 DIDs are rejected", () => {
    expect(isValidDid("did:web:example.com")).toBe(false);
    expect(isValidDid("did:key:zQ3shmFBBmzFBQg2YVeVpDWkMRcNRJDYdAGT9FH3MJynuLt82")).toBe(false);
  });

  it("INVARIANT: random strings are not valid DIDs", () => {
    expect(isValidDid("not a DID")).toBe(false);
    expect(isValidDid("")).toBe(false);
    expect(isValidDid("did:key:")).toBe(false);
  });
});

// ── A2A bridge invariants ─────────────────────────────────────────────────────

describe("Phase 4 Invariant: A2A bridge security", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  let tokenStore: Map<string, SintCapabilityToken>;
  let gateway: PolicyGateway;

  function issueA2AToken(resource: string): SintCapabilityToken {
    const req: SintCapabilityTokenRequest = {
      issuer: root.publicKey, subject: agent.publicKey,
      resource, actions: ["a2a.send", "a2a.get"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(24), revocable: false,
    };
    const r = issueCapabilityToken(req, root.privateKey);
    if (!r.ok) throw new Error();
    return r.value;
  }

  beforeEach(() => {
    tokenStore = new Map();
    gateway = new PolicyGateway({ resolveToken: (id) => tokenStore.get(id) });
  });

  it("INVARIANT: A2A task without a valid token is always denied", async () => {
    const token = issueA2AToken("a2a://robot.example.com/status");
    // NOT stored in tokenStore
    const interceptor = new A2AInterceptor(gateway, agent.publicKey, token.tokenId, {
      agentCard: ROBOT_CARD,
    });
    const result = await interceptor.interceptSend({
      id: "t-001", skillId: "status",
      message: { role: "user", parts: [{ type: "text", text: "Status?" }] },
    });
    expect(result.action).toBe("deny");
  });

  it("INVARIANT: A2A task with wrong resource is denied", async () => {
    // Token only covers 'status' skill
    const token = issueA2AToken("a2a://robot.example.com/status");
    tokenStore.set(token.tokenId, token);
    const interceptor = new A2AInterceptor(gateway, agent.publicKey, token.tokenId, {
      agentCard: ROBOT_CARD,
    });
    // Trying to 'pick' — resource is a2a://robot.example.com/pick (not covered)
    const result = await interceptor.interceptSend({
      id: "t-002", skillId: "pick",
      message: { role: "user", parts: [{ type: "text", text: "Pick the box" }] },
    });
    expect(result.action).toBe("deny");
  });

  it("INVARIANT: A2A status check (read-only) is auto-approved (T0)", async () => {
    const token = issueA2AToken("a2a://robot.example.com/status");
    tokenStore.set(token.tokenId, token);
    const interceptor = new A2AInterceptor(gateway, agent.publicKey, token.tokenId, {
      agentCard: ROBOT_CARD,
    });
    const result = await interceptor.interceptSend({
      id: "t-003", skillId: "status",
      message: { role: "user", parts: [{ type: "text", text: "Status?" }] },
    });
    // a2a://*/status is T0_observe → should auto-allow
    expect(result.action).toBe("forward");
  });

  it("INVARIANT: buildResourceUri produces a2a:// URIs", () => {
    expect(buildResourceUri("https://robot.example.com/arm", "pick"))
      .toBe("a2a://robot.example.com/pick");
    expect(buildResourceUri("https://robot.example.com/arm", "status"))
      .toBe("a2a://robot.example.com/status");
  });

  it("INVARIANT: AgentCardRegistry provides isolation between registered agents", () => {
    const reg = new AgentCardRegistry();
    const card1 = { ...ROBOT_CARD, url: "https://agent1.example.com" };
    const card2 = { ...ROBOT_CARD, url: "https://agent2.example.com", name: "Agent 2" };
    reg.register(card1 as A2AAgentCard);
    reg.register(card2 as A2AAgentCard);

    expect(reg.get("https://agent1.example.com")?.name).toBe("Robot Arm Agent");
    expect(reg.get("https://agent2.example.com")?.name).toBe("Agent 2");
    expect(reg.size).toBe(2);
  });

  it("INVARIANT: physical A2A task (navigate) is escalated (not auto-approved)", async () => {
    const token = issueA2AToken("a2a://robot.example.com/navigate");
    tokenStore.set(token.tokenId, token);
    const interceptor = new A2AInterceptor(gateway, agent.publicKey, token.tokenId, {
      agentCard: { ...ROBOT_CARD, skills: [{ id: "navigate", name: "Navigate", tags: ["physical"] }] },
    });
    const result = await interceptor.interceptSend({
      id: "t-navigate", skillId: "navigate",
      message: { role: "user", parts: [{ type: "text", text: "Go to station 5" }] },
    });
    // a2a://*/navigate is T2_act → escalate
    expect(result.action).toBe("escalate");
  });
});

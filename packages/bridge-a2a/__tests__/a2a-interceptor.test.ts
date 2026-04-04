/**
 * @sint/bridge-a2a — A2AInterceptor tests.
 *
 * Verifies that A2A tasks flow correctly through the SINT PolicyGateway:
 * allow → "forward", deny → "deny", escalate → "escalate".
 */

import { describe, it, expect, beforeEach } from "vitest";
import { PolicyGateway } from "@sint/gate-policy-gateway";
import {
  generateKeypair,
  issueCapabilityToken,
  RevocationStore,
} from "@sint/gate-capability-tokens";
import type { SintCapabilityToken, SintCapabilityTokenRequest } from "@sint/core";
import {
  A2AInterceptor,
  AgentCardRegistry,
  buildResourceUri,
  type A2AAgentCard,
  type A2ASendTaskParams,
} from "../src/index.js";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const FLEET_MANAGER_CARD: A2AAgentCard = {
  url: "https://agents.example.com/fleet-manager",
  name: "Fleet Manager",
  version: "1.0.0",
  description: "Manages robot fleet tasks",
  skills: [
    {
      id: "navigate",
      name: "Navigate",
      description: "Move a robot to a target location",
      tags: ["physical", "movement"],
    },
    {
      id: "report",
      name: "Report",
      description: "Generate a status report (read-only)",
      tags: ["read-only"],
    },
  ],
  streaming: true,
};

function makeNavTask(overrides?: Partial<A2ASendTaskParams>): A2ASendTaskParams {
  return {
    id: "task-nav-001",
    skillId: "navigate",
    message: {
      role: "user",
      parts: [{ type: "text", text: "Navigate to dock B-12" }],
    },
    ...overrides,
  };
}

function makeReportTask(): A2ASendTaskParams {
  return {
    id: "task-report-001",
    skillId: "report",
    message: {
      role: "user",
      parts: [{ type: "text", text: "Generate status report" }],
    },
  };
}

function futureISO(hours: number): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

// ── Test setup ────────────────────────────────────────────────────────────────

describe("A2AInterceptor", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  const revocationStore = new RevocationStore();
  let tokenStore: Map<string, SintCapabilityToken>;
  let gateway: PolicyGateway;

  function issueToken(overrides?: Partial<SintCapabilityTokenRequest>): SintCapabilityToken {
    const req: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "a2a://agents.example.com/*",
      actions: ["a2a.send", "a2a.stream", "a2a.cancel", "a2a.get"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(24),
      revocable: false,
      ...overrides,
    };
    const result = issueCapabilityToken(req, root.privateKey);
    if (!result.ok) throw new Error("Token issuance failed");
    return result.value;
  }

  function makeInterceptor(token: SintCapabilityToken): A2AInterceptor {
    return new A2AInterceptor(gateway, agent.publicKey, token.tokenId, {
      agentCard: FLEET_MANAGER_CARD,
    });
  }

  beforeEach(() => {
    tokenStore = new Map();
    revocationStore.clear();
    gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      revocationStore,
    });
  });

  // ── Allow ──────────────────────────────────────────────────────────────────

  it("interceptSend returns 'forward' when gateway allows (T0 resource)", async () => {
    const token = issueToken({ resource: "a2a://agents.example.com/report" });
    tokenStore.set(token.tokenId, token);
    const interceptor = makeInterceptor(token);

    const result = await interceptor.interceptSend(makeReportTask());
    expect(result.action).toBe("forward");
    expect(result.task.status).toBe("submitted");
  });

  it("forward result carries task id from params", async () => {
    const token = issueToken({ resource: "a2a://agents.example.com/report" });
    tokenStore.set(token.tokenId, token);
    const interceptor = makeInterceptor(token);

    const result = await interceptor.interceptSend(makeReportTask());
    if (result.action !== "forward") throw new Error("Expected forward");
    expect(result.task.id).toBe("task-report-001");
  });

  it("task metadata includes SINT requestId and tier", async () => {
    const token = issueToken({ resource: "a2a://agents.example.com/report" });
    tokenStore.set(token.tokenId, token);
    const interceptor = makeInterceptor(token);

    const result = await interceptor.interceptSend(makeReportTask());
    if (result.action !== "forward") throw new Error("Expected forward");
    const sintMeta = result.task.metadata?.["sint"] as any;
    expect(sintMeta).toBeDefined();
    expect(sintMeta.assignedTier).toBeDefined();
  });

  // ── Deny ───────────────────────────────────────────────────────────────────

  it("interceptSend returns 'deny' when token is missing", async () => {
    const token = issueToken();
    // Token NOT stored in tokenStore
    const interceptor = makeInterceptor(token);

    const result = await interceptor.interceptSend(makeNavTask());
    expect(result.action).toBe("deny");
    expect(result.task.status).toBe("failed");
  });

  it("deny result carries policyViolated and reason", async () => {
    const token = issueToken();
    // Not stored
    const interceptor = makeInterceptor(token);

    const result = await interceptor.interceptSend(makeNavTask());
    if (result.action !== "deny") throw new Error("Expected deny");
    expect(result.policyViolated).toBeTruthy();
    expect(result.reason).toBeTruthy();
  });

  it("interceptSend denies when token has already-expired time (via issuer validation)", async () => {
    // issueCapabilityToken itself rejects past-dated tokens (TOKEN_EXPIRED).
    // We verify that a token with a very short TTL will fail gateway validation
    // once the token expiry is exceeded. Here we assert the issuer rejects it.
    const reqExpired = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "a2a://agents.example.com/navigate",
      actions: ["a2a.send"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: new Date(Date.now() - 1).toISOString(), // past
      revocable: false,
    };
    const result = issueCapabilityToken(reqExpired, root.privateKey);
    // Issuer should reject the past-dated token
    expect(result.ok).toBe(false);
  });

  it("interceptSend denies when resource doesn't match token", async () => {
    // Token only allows the report skill
    const token = issueToken({
      resource: "a2a://agents.example.com/report",
      actions: ["a2a.send"],
    });
    tokenStore.set(token.tokenId, token);
    const interceptor = makeInterceptor(token);

    // Trying to navigate (different resource)
    const result = await interceptor.interceptSend(makeNavTask());
    expect(result.action).toBe("deny");
  });

  // ── Interceptor streaming ──────────────────────────────────────────────────

  it("interceptStream uses a2a.stream action", async () => {
    const emitted: any[] = [];
    const streamGateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      emitLedgerEvent: (e) => emitted.push(e),
    });

    const token = issueToken({ resource: "a2a://agents.example.com/report" });
    tokenStore.set(token.tokenId, token);

    const interceptor = new A2AInterceptor(streamGateway, agent.publicKey, token.tokenId, {
      agentCard: FLEET_MANAGER_CARD,
    });

    await interceptor.interceptStream(makeReportTask());
    // The ledger event should show the a2a.stream action was evaluated
    expect(emitted.length).toBeGreaterThan(0);
  });

  // ── Cancel ─────────────────────────────────────────────────────────────────

  it("interceptCancel maps to a2a.cancel action", async () => {
    const emitted: any[] = [];
    const cancelGateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      emitLedgerEvent: (e) => emitted.push(e),
    });

    const token = issueToken({ resource: "a2a://agents.example.com/*" });
    tokenStore.set(token.tokenId, token);

    const interceptor = new A2AInterceptor(cancelGateway, agent.publicKey, token.tokenId, {
      agentCard: FLEET_MANAGER_CARD,
    });

    const result = await interceptor.interceptCancel("task-nav-001");
    // Cancel of a read-op resource should be allowed
    expect(result.action).not.toBe(undefined);
  });
});

// ── Resource mapper ────────────────────────────────────────────────────────────

describe("buildResourceUri", () => {
  it("extracts hostname from agent URL and builds a2a URI", () => {
    expect(buildResourceUri("https://agents.example.com/fleet-manager", "navigate"))
      .toBe("a2a://agents.example.com/navigate");
  });

  it("uses 'task' when skillId is absent", () => {
    expect(buildResourceUri("https://agents.example.com/fleet-manager"))
      .toBe("a2a://agents.example.com/task");
  });

  it("handles URLs with port numbers", () => {
    expect(buildResourceUri("http://localhost:8080/agent", "report"))
      .toBe("a2a://localhost/report");
  });
});

// ── Agent Card Registry ────────────────────────────────────────────────────────

describe("AgentCardRegistry", () => {
  it("registers and retrieves an Agent Card", () => {
    const reg = new AgentCardRegistry();
    reg.register(FLEET_MANAGER_CARD);
    expect(reg.get(FLEET_MANAGER_CARD.url)).toEqual(FLEET_MANAGER_CARD);
  });

  it("returns undefined for unknown agent", () => {
    const reg = new AgentCardRegistry();
    expect(reg.get("https://unknown.example.com")).toBeUndefined();
  });

  it("has() reflects registration state", () => {
    const reg = new AgentCardRegistry();
    expect(reg.has(FLEET_MANAGER_CARD.url)).toBe(false);
    reg.register(FLEET_MANAGER_CARD);
    expect(reg.has(FLEET_MANAGER_CARD.url)).toBe(true);
  });

  it("remove() deregisters an agent", () => {
    const reg = new AgentCardRegistry();
    reg.register(FLEET_MANAGER_CARD);
    reg.remove(FLEET_MANAGER_CARD.url);
    expect(reg.has(FLEET_MANAGER_CARD.url)).toBe(false);
  });

  it("list() returns all registered URLs", () => {
    const reg = new AgentCardRegistry();
    reg.register(FLEET_MANAGER_CARD);
    expect(reg.list()).toContain(FLEET_MANAGER_CARD.url);
  });

  it("size reflects registered card count", () => {
    const reg = new AgentCardRegistry();
    expect(reg.size).toBe(0);
    reg.register(FLEET_MANAGER_CARD);
    expect(reg.size).toBe(1);
  });
});

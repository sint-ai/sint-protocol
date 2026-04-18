/**
 * SINT Protocol — End-to-End Demo Test
 *
 * Exercises every major subsystem in one cohesive scenario:
 * 1. Capability token lifecycle (issue → validate → delegate → revoke)
 * 2. Policy gateway enforcement (allow → escalate → deny)
 * 3. Evidence ledger hash-chain integrity
 * 4. MCP bridge tool call mapping
 * 5. Forbidden combo detection
 * 6. Approval queue workflow
 *
 * This is both a test suite and a demo of the full SINT Protocol stack.
 */

import { describe, it, expect } from "vitest";
import {
  generateKeypair,
  issueCapabilityToken,
  validateTokenSignature,
  delegateCapabilityToken,
  RevocationStore,
  generateUUIDv7,
  nowISO8601,
} from "@pshkv/gate-capability-tokens";
import { PolicyGateway, ApprovalQueue } from "@pshkv/gate-policy-gateway";
import { LedgerWriter } from "@pshkv/gate-evidence-ledger";
import { toResourceUri, toSintAction, getRiskHint, type MCPToolCall } from "@pshkv/bridge-mcp";
import { ApprovalTier, type SintRequest } from "@pshkv/core";

describe("SINT Protocol End-to-End", () => {
  // Shared state — built up through the test sequence
  const operator = generateKeypair();
  const agent = generateKeypair();
  const revocationStore = new RevocationStore();
  const ledger = new LedgerWriter();
  const tokenMap = new Map<string, any>();

  const gateway = new PolicyGateway({
    resolveToken: async (id) => tokenMap.get(id),
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

  const expiresAt = new Date(Date.now() + 3600_000)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");

  let rootTokenId: string;

  // ── 1. Token Lifecycle ──

  it("issues a root capability token with Ed25519 signature", () => {
    const result = issueCapabilityToken({
      issuer: operator.publicKey,
      subject: agent.publicKey,
      resource: "mcp://*",
      actions: ["call", "exec.run", "subscribe"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt,
      revocable: true,
    }, operator.privateKey);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    tokenMap.set(result.value.tokenId, result.value);
    rootTokenId = result.value.tokenId;

    expect(result.value.issuer).toBe(operator.publicKey);
    expect(result.value.subject).toBe(agent.publicKey);
    expect(result.value.actions).toContain("call");
  });

  it("validates the token signature cryptographically", () => {
    const token = tokenMap.get(rootTokenId);
    const result = validateTokenSignature(token);
    expect(result.ok).toBe(true);
  });

  it("delegates with attenuation (restricts actions)", () => {
    const child = generateKeypair();
    const token = tokenMap.get(rootTokenId);
    const result = delegateCapabilityToken(
      token,
      { newSubject: child.publicKey, restrictActions: ["call"], expiresAt },
      operator.privateKey,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect(result.value.actions).toEqual(["call"]);
    expect(result.value.delegationChain.depth).toBe(1);
    expect(result.value.delegationChain.attenuated).toBe(true);
  });

  // ── 2. Policy Gateway ──

  it("allows read operations (T0_OBSERVE, auto-approved)", async () => {
    const req: SintRequest = {
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: rootTokenId,
      resource: "mcp://filesystem/readFile",
      action: "call",
      params: { path: "/tmp/data.json" },
      recentActions: [],
    };

    const decision = await gateway.intercept(req);
    expect(decision.action).toBe("allow");
    expect(decision.assignedTier).toBe(ApprovalTier.T0_OBSERVE);
  });

  it("escalates dangerous operations (T3_COMMIT, needs human)", async () => {
    // Resource mcp://exec/* matches the T3_COMMIT tier rule for execution tools
    const req: SintRequest = {
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: rootTokenId,
      resource: "mcp://exec/run",
      action: "exec.run",
      params: { command: "rm -rf /" },
      recentActions: [],
    };

    const decision = await gateway.intercept(req);
    expect(decision.action).toBe("escalate");
    expect(decision.assignedTier).toBe(ApprovalTier.T3_COMMIT);
    expect(decision.escalation?.reason).toBeTruthy();
  });

  // ── 3. Forbidden Combos ──

  it("detects forbidden combination: write → exec (code injection)", async () => {
    // The forbidden combo sequence is ["filesystem.write", "exec.run"]
    // recentActions uses the same action identifiers as the combo patterns
    const req: SintRequest = {
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: rootTokenId,
      resource: "mcp://exec/run",
      action: "exec.run",
      params: {},
      recentActions: ["filesystem.write"],
    };

    const decision = await gateway.intercept(req);
    // Should be escalated due to forbidden combo detection
    expect(decision.action).toBe("escalate");
  });

  // ── 4. MCP Bridge ──

  it("maps MCP tool calls to SINT requests correctly", () => {
    const toolCall: MCPToolCall = {
      callId: generateUUIDv7(),
      serverName: "filesystem",
      toolName: "writeFile",
      arguments: { path: "/etc/passwd", content: "hacked" },
      timestamp: nowISO8601(),
    };

    const resourceUri = toResourceUri(toolCall);
    const action = toSintAction(toolCall);
    const risk = getRiskHint(toolCall);

    expect(resourceUri).toContain("filesystem");
    expect(resourceUri).toContain("writeFile");
    expect(action).toBe("call");
    expect(risk.suggestedTier).toBeDefined();
    expect(risk.action).toBe("call");
  });

  // ── 5. Approval Queue ──

  it("enqueues, resolves, and drains approval requests", () => {
    const queue = new ApprovalQueue({ defaultTimeoutMs: 30_000 });

    const req: SintRequest = {
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: rootTokenId,
      resource: "mcp://exec/run",
      action: "exec.run",
      params: { command: "shutdown -h now" },
      recentActions: [],
    };

    const pending = queue.enqueue(req, {
      requestId: req.requestId,
      timestamp: req.timestamp,
      action: "escalate",
      assignedTier: ApprovalTier.T3_COMMIT,
      assignedRisk: "T3_irreversible" as any,
      escalation: {
        requiredTier: ApprovalTier.T3_COMMIT,
        reason: "T3 action requires human approval",
        timeoutMs: 30_000,
        fallbackAction: "deny",
      },
    });

    expect(queue.size).toBe(1);
    expect(pending.requestId).toBeTruthy();

    // Operator approves
    const resolution = queue.resolve(pending.requestId, {
      status: "approved",
      by: "operator-alice",
    });

    expect(resolution).toBeTruthy();
    expect(queue.size).toBe(0);

    queue.dispose();
  });

  // ── 6. Token Revocation ──

  it("revokes a token and gateway denies subsequent requests", async () => {
    revocationStore.revoke(rootTokenId, "End of session", operator.publicKey.slice(0, 16));
    // checkRevocation returns err("TOKEN_REVOKED") when the token IS revoked
    const revocationCheck = revocationStore.checkRevocation(rootTokenId);
    expect(revocationCheck.ok).toBe(false);

    const req: SintRequest = {
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: rootTokenId,
      resource: "mcp://filesystem/readFile",
      action: "call",
      params: {},
      recentActions: [],
    };

    const decision = await gateway.intercept(req);
    expect(decision.action).toBe("deny");
    expect(decision.denial?.reason).toContain("revoked");
  });

  // ── 7. Evidence Ledger ──

  it("maintains hash-chain integrity across all events", () => {
    expect(ledger.length).toBeGreaterThan(0);

    // LedgerWriter.verifyChain() returns Result<true, number>
    // ok(true) = valid chain, err(index) = broken at index
    const chainResult = ledger.verifyChain();
    expect(chainResult.ok).toBe(true);

    // Verify sequential numbering
    const allEvents = ledger.getAll();
    for (let i = 1; i < allEvents.length; i++) {
      expect(Number(allEvents[i]!.sequenceNumber))
        .toBe(Number(allEvents[i - 1]!.sequenceNumber) + 1);
    }
  });
});

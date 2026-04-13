/**
 * SINT MCP — Delegation tools tests.
 *
 * Covers sint__delegate_to_agent, sint__list_delegations,
 * and sint__revoke_delegation_tree.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getDelegationToolDefinitions,
  handleDelegationTool,
  isDelegationTool,
  type DelegationToolContext,
} from "../delegation-tools.js";
import { DelegationTree } from "@pshkv/interface-bridge";
import { LedgerWriter } from "@pshkv/gate-evidence-ledger";
import { generateKeypair, issueCapabilityToken } from "@pshkv/gate-capability-tokens";
import type { SintCapabilityToken } from "@pshkv/core";

function createContext(overrides?: Partial<DelegationToolContext>): DelegationToolContext {
  const keypair = generateKeypair();

  // Issue a root token so the tokenStore has depth=0 parent
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");

  const tokenResult = issueCapabilityToken(
    {
      issuer: keypair.publicKey,
      subject: keypair.publicKey,
      resource: "mcp://sint/*",
      actions: ["call"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt,
      revocable: true,
    },
    keypair.privateKey,
  );

  if (!tokenResult.ok) throw new Error("Failed to issue root token in test setup");

  const tokenStore = new Map<string, SintCapabilityToken>();
  tokenStore.set(tokenResult.value.tokenId, tokenResult.value);

  const revocationStore = {
    revoke: vi.fn(),
    isRevoked: () => false,
  };

  const ledger = new LedgerWriter();

  return {
    agentPublicKey: keypair.publicKey,
    agentPrivateKey: keypair.privateKey,
    tokenId: tokenResult.value.tokenId,
    tokenStore,
    revocationStore: revocationStore as any,
    ledger,
    delegationTree: new DelegationTree(),
    ...overrides,
  };
}

describe("isDelegationTool", () => {
  it("returns true for known delegation tool names", () => {
    expect(isDelegationTool("sint__delegate_to_agent")).toBe(true);
    expect(isDelegationTool("sint__list_delegations")).toBe(true);
    expect(isDelegationTool("sint__revoke_delegation_tree")).toBe(true);
  });

  it("returns false for other tool names", () => {
    expect(isDelegationTool("sint__status")).toBe(false);
    expect(isDelegationTool("sint__issue_token")).toBe(false);
    expect(isDelegationTool("filesystem__readFile")).toBe(false);
    expect(isDelegationTool("")).toBe(false);
  });
});

describe("getDelegationToolDefinitions", () => {
  it("returns exactly 3 tools", () => {
    const tools = getDelegationToolDefinitions();
    expect(tools).toHaveLength(3);
  });

  it("all tools have name, description, and inputSchema", () => {
    const tools = getDelegationToolDefinitions();
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
    }
  });

  it("contains the three expected tool names", () => {
    const names = getDelegationToolDefinitions().map(t => t.name);
    expect(names).toContain("sint__delegate_to_agent");
    expect(names).toContain("sint__list_delegations");
    expect(names).toContain("sint__revoke_delegation_tree");
  });
});

describe("sint__delegate_to_agent", () => {
  it("issues a token and returns tokenId on success", async () => {
    const ctx = createContext();
    const subKeypair = generateKeypair();

    const result = await handleDelegationTool(
      "sint__delegate_to_agent",
      {
        subagentId: subKeypair.publicKey,
        toolScope: ["mcp://filesystem/*"],
        expiresInHours: 2,
      },
      ctx,
    );

    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.tokenId).toBeTruthy();
    expect(parsed.subagentId).toBe(subKeypair.publicKey);
    expect(parsed.toolScope).toEqual(["mcp://filesystem/*"]);
    expect(parsed.depth).toBe(1);
    expect(parsed.expiresAt).toBeTruthy();
  });

  it("adds node to delegation tree on success", async () => {
    const ctx = createContext();
    const subKeypair = generateKeypair();

    await handleDelegationTool(
      "sint__delegate_to_agent",
      {
        subagentId: subKeypair.publicKey,
        toolScope: ["mcp://filesystem/*"],
      },
      ctx,
    );

    const nodes = ctx.delegationTree.toArray();
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.subagentId).toBe(subKeypair.publicKey);
    expect(nodes[0]!.depth).toBe(1);
    expect(nodes[0]!.revoked).toBe(false);
  });

  it("stores the issued token in tokenStore", async () => {
    const ctx = createContext();
    const subKeypair = generateKeypair();

    const result = await handleDelegationTool(
      "sint__delegate_to_agent",
      {
        subagentId: subKeypair.publicKey,
        toolScope: ["mcp://filesystem/*"],
      },
      ctx,
    );

    const parsed = JSON.parse(result.content[0]!.text);
    expect(ctx.tokenStore.has(parsed.tokenId)).toBe(true);
  });

  it("writes a ledger event on success", async () => {
    const ctx = createContext();
    const subKeypair = generateKeypair();
    const initialLength = ctx.ledger.length;

    await handleDelegationTool(
      "sint__delegate_to_agent",
      {
        subagentId: subKeypair.publicKey,
        toolScope: ["mcp://sint/*"],
      },
      ctx,
    );

    expect(ctx.ledger.length).toBe(initialLength + 1);
  });

  it("enforces max depth of 3", async () => {
    // Create a token at depth 3 and try to delegate from it
    const ctx = createContext();
    const keypair = generateKeypair();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .replace(/\.(\d{3})Z$/, ".$1000Z");

    // Issue a depth-3 token
    const deepToken = issueCapabilityToken(
      {
        issuer: keypair.publicKey,
        subject: keypair.publicKey,
        resource: "mcp://sint/*",
        actions: ["call"],
        constraints: {},
        delegationChain: { parentTokenId: null, depth: 3, attenuated: true },
        expiresAt,
        revocable: true,
      },
      keypair.privateKey,
    );
    if (!deepToken.ok) throw new Error("Token issue failed");

    ctx.tokenStore.set(deepToken.value.tokenId, deepToken.value);

    const deepCtx: DelegationToolContext = {
      ...ctx,
      tokenId: deepToken.value.tokenId,
    };

    const result = await handleDelegationTool(
      "sint__delegate_to_agent",
      {
        subagentId: generateKeypair().publicKey,
        toolScope: ["mcp://sint/*"],
      },
      deepCtx,
    );

    expect(result.content[0]!.text).toContain("Error");
    expect(result.content[0]!.text).toContain("exceeds maximum");
  });

  it("returns error when subagentId is missing", async () => {
    const ctx = createContext();
    const result = await handleDelegationTool(
      "sint__delegate_to_agent",
      { toolScope: ["mcp://filesystem/*"] },
      ctx,
    );
    expect(result.content[0]!.text).toContain("Error");
    expect(result.content[0]!.text).toContain("required");
  });

  it("returns error when toolScope is missing", async () => {
    const ctx = createContext();
    const result = await handleDelegationTool(
      "sint__delegate_to_agent",
      { subagentId: generateKeypair().publicKey },
      ctx,
    );
    expect(result.content[0]!.text).toContain("Error");
    expect(result.content[0]!.text).toContain("required");
  });

  it("returns error when toolScope is empty array", async () => {
    const ctx = createContext();
    const result = await handleDelegationTool(
      "sint__delegate_to_agent",
      { subagentId: generateKeypair().publicKey, toolScope: [] },
      ctx,
    );
    expect(result.content[0]!.text).toContain("Error");
    expect(result.content[0]!.text).toContain("required");
  });

  it("includes maxCallsPerMinute in token constraints when provided", async () => {
    const ctx = createContext();
    const subKeypair = generateKeypair();

    const result = await handleDelegationTool(
      "sint__delegate_to_agent",
      {
        subagentId: subKeypair.publicKey,
        toolScope: ["mcp://filesystem/*"],
        maxCallsPerMinute: 10,
      },
      ctx,
    );

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.tokenId).toBeTruthy();
  });
});

describe("sint__list_delegations", () => {
  it("returns empty message when no delegations", async () => {
    const ctx = createContext();
    const result = await handleDelegationTool("sint__list_delegations", {}, ctx);

    expect(result.content[0]!.text).toBe("No active delegations.");
  });

  it("returns JSON array with populated tree", async () => {
    const ctx = createContext();
    const subKeypair = generateKeypair();

    // Issue two delegations
    await handleDelegationTool(
      "sint__delegate_to_agent",
      { subagentId: subKeypair.publicKey, toolScope: ["mcp://fs/*"] },
      ctx,
    );
    await handleDelegationTool(
      "sint__delegate_to_agent",
      { subagentId: generateKeypair().publicKey, toolScope: ["mcp://db/*"] },
      ctx,
    );

    const result = await handleDelegationTool("sint__list_delegations", {}, ctx);
    const nodes = JSON.parse(result.content[0]!.text);
    expect(Array.isArray(nodes)).toBe(true);
    expect(nodes).toHaveLength(2);
  });

  it("returned nodes include expected fields", async () => {
    const ctx = createContext();
    const subKeypair = generateKeypair();

    await handleDelegationTool(
      "sint__delegate_to_agent",
      { subagentId: subKeypair.publicKey, toolScope: ["mcp://sint/*"] },
      ctx,
    );

    const result = await handleDelegationTool("sint__list_delegations", {}, ctx);
    const nodes = JSON.parse(result.content[0]!.text);
    const node = nodes[0];

    expect(node.tokenId).toBeTruthy();
    expect(node.subagentId).toBe(subKeypair.publicKey);
    expect(node.toolScope).toEqual(["mcp://sint/*"]);
    expect(node.depth).toBe(1);
    expect(node.issuedAt).toBeTruthy();
    expect(node.expiresAt).toBeTruthy();
    expect(node.revoked).toBe(false);
  });
});

describe("sint__revoke_delegation_tree", () => {
  it("returns error when rootTokenId is missing", async () => {
    const ctx = createContext();
    const result = await handleDelegationTool("sint__revoke_delegation_tree", {}, ctx);
    expect(result.content[0]!.text).toContain("Error");
    expect(result.content[0]!.text).toContain("required");
  });

  it("returns error for unknown tokenId", async () => {
    const ctx = createContext();
    const result = await handleDelegationTool(
      "sint__revoke_delegation_tree",
      { rootTokenId: "nonexistent-id" },
      ctx,
    );
    expect(result.content[0]!.text).toContain("Error");
    expect(result.content[0]!.text).toContain("nonexistent-id");
  });

  it("revokes a single node", async () => {
    const ctx = createContext();
    const subKeypair = generateKeypair();

    const delegateResult = await handleDelegationTool(
      "sint__delegate_to_agent",
      { subagentId: subKeypair.publicKey, toolScope: ["mcp://fs/*"] },
      ctx,
    );
    const { tokenId } = JSON.parse(delegateResult.content[0]!.text);

    const revokeResult = await handleDelegationTool(
      "sint__revoke_delegation_tree",
      { rootTokenId: tokenId, reason: "Test revocation" },
      ctx,
    );

    const parsed = JSON.parse(revokeResult.content[0]!.text);
    expect(parsed.revoked).toBe(true);
    expect(parsed.rootTokenId).toBe(tokenId);
    expect(parsed.cascadeCount).toBe(1);
    expect(parsed.revokedTokenIds).toContain(tokenId);
    expect(parsed.reason).toBe("Test revocation");
  });

  it("removes revoked token from tokenStore", async () => {
    const ctx = createContext();
    const subKeypair = generateKeypair();

    const delegateResult = await handleDelegationTool(
      "sint__delegate_to_agent",
      { subagentId: subKeypair.publicKey, toolScope: ["mcp://fs/*"] },
      ctx,
    );
    const { tokenId } = JSON.parse(delegateResult.content[0]!.text);

    expect(ctx.tokenStore.has(tokenId)).toBe(true);

    await handleDelegationTool(
      "sint__revoke_delegation_tree",
      { rootTokenId: tokenId },
      ctx,
    );

    expect(ctx.tokenStore.has(tokenId)).toBe(false);
  });

  it("calls revocationStore.revoke for each revoked token", async () => {
    const ctx = createContext();
    const revokeSpy = ctx.revocationStore.revoke as ReturnType<typeof vi.fn>;

    const delegateResult = await handleDelegationTool(
      "sint__delegate_to_agent",
      { subagentId: generateKeypair().publicKey, toolScope: ["mcp://fs/*"] },
      ctx,
    );
    const { tokenId } = JSON.parse(delegateResult.content[0]!.text);

    await handleDelegationTool(
      "sint__revoke_delegation_tree",
      { rootTokenId: tokenId },
      ctx,
    );

    expect(revokeSpy).toHaveBeenCalledWith(
      tokenId,
      expect.any(String),
      expect.any(String),
    );
  });

  it("cascade-revokes a 3-level subtree", async () => {
    const ctx = createContext();

    // Level 1
    const sub1 = generateKeypair();
    const r1 = await handleDelegationTool(
      "sint__delegate_to_agent",
      { subagentId: sub1.publicKey, toolScope: ["mcp://fs/*"] },
      ctx,
    );
    const token1Id = JSON.parse(r1.content[0]!.text).tokenId;

    // Level 2 — child of token1
    const sub2 = generateKeypair();
    const ctx2: DelegationToolContext = { ...ctx, tokenId: token1Id };
    const r2 = await handleDelegationTool(
      "sint__delegate_to_agent",
      { subagentId: sub2.publicKey, toolScope: ["mcp://fs/read"] },
      ctx2,
    );
    const token2Id = JSON.parse(r2.content[0]!.text).tokenId;

    // Level 3 — child of token2
    const sub3 = generateKeypair();
    const ctx3: DelegationToolContext = { ...ctx, tokenId: token2Id };
    const r3 = await handleDelegationTool(
      "sint__delegate_to_agent",
      { subagentId: sub3.publicKey, toolScope: ["mcp://fs/read/dir"] },
      ctx3,
    );
    const token3Id = JSON.parse(r3.content[0]!.text).tokenId;

    // Revoke from root of the subtree
    const revokeResult = await handleDelegationTool(
      "sint__revoke_delegation_tree",
      { rootTokenId: token1Id },
      ctx,
    );

    const parsed = JSON.parse(revokeResult.content[0]!.text);
    expect(parsed.revoked).toBe(true);
    expect(parsed.cascadeCount).toBe(3);
    expect(parsed.revokedTokenIds).toContain(token1Id);
    expect(parsed.revokedTokenIds).toContain(token2Id);
    expect(parsed.revokedTokenIds).toContain(token3Id);

    // All tokens removed from store
    expect(ctx.tokenStore.has(token1Id)).toBe(false);
    expect(ctx.tokenStore.has(token2Id)).toBe(false);
    expect(ctx.tokenStore.has(token3Id)).toBe(false);
  });

  it("writes a ledger event on revocation", async () => {
    const ctx = createContext();
    const sub = generateKeypair();

    const delegateResult = await handleDelegationTool(
      "sint__delegate_to_agent",
      { subagentId: sub.publicKey, toolScope: ["mcp://fs/*"] },
      ctx,
    );
    const { tokenId } = JSON.parse(delegateResult.content[0]!.text);
    const lengthBefore = ctx.ledger.length;

    await handleDelegationTool(
      "sint__revoke_delegation_tree",
      { rootTokenId: tokenId },
      ctx,
    );

    expect(ctx.ledger.length).toBe(lengthBefore + 1);
  });

  it("uses default reason when reason not provided", async () => {
    const ctx = createContext();
    const sub = generateKeypair();

    const delegateResult = await handleDelegationTool(
      "sint__delegate_to_agent",
      { subagentId: sub.publicKey, toolScope: ["mcp://fs/*"] },
      ctx,
    );
    const { tokenId } = JSON.parse(delegateResult.content[0]!.text);

    const result = await handleDelegationTool(
      "sint__revoke_delegation_tree",
      { rootTokenId: tokenId },
      ctx,
    );

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.reason).toBe("Revoked via sint__revoke_delegation_tree");
  });
});

describe("handleDelegationTool unknown tool", () => {
  it("returns error for unknown tool name", async () => {
    const ctx = createContext();
    const result = await handleDelegationTool("sint__unknown_tool", {}, ctx);
    expect(result.content[0]!.text).toContain("Unknown delegation tool");
  });
});

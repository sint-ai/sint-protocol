/**
 * SINT MCP — SINT tools tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getSintToolDefinitions,
  handleSintTool,
  isSintTool,
  type SintToolContext,
} from "../src/tools/sint-tools.js";
import { DownstreamManager } from "../src/downstream.js";
import { ApprovalQueue } from "@pshkv/gate-policy-gateway";
import { LedgerWriter } from "@pshkv/gate-evidence-ledger";
import { RevocationStore, generateKeypair, issueCapabilityToken } from "@pshkv/gate-capability-tokens";
import type { SintCapabilityToken } from "@pshkv/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

function createToolContext(): SintToolContext {
  const downstream = new DownstreamManager();
  const mockClient = {} as Client;
  downstream.addConnectedClient("test-server", mockClient, [
    { name: "tool1", description: "Tool 1", inputSchema: { type: "object" } },
    { name: "tool2", description: "Tool 2", inputSchema: { type: "object" } },
  ]);

  const keypair = generateKeypair();

  return {
    downstream,
    approvalQueue: new ApprovalQueue(),
    ledger: new LedgerWriter(),
    agentPublicKey: keypair.publicKey,
    agentPrivateKey: keypair.privateKey,
    tokenId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
    tokenStore: new Map<string, SintCapabilityToken>(),
    revocationStore: new RevocationStore(),
  };
}

describe("SINT Tools", () => {
  describe("isSintTool", () => {
    it("returns true for sint__ prefixed tools", () => {
      expect(isSintTool("sint__status")).toBe(true);
      expect(isSintTool("sint__approve")).toBe(true);
    });

    it("returns false for non-sint tools", () => {
      expect(isSintTool("filesystem__readFile")).toBe(false);
      expect(isSintTool("readFile")).toBe(false);
    });
  });

  describe("getSintToolDefinitions", () => {
    it("returns all 11 built-in tools", () => {
      const tools = getSintToolDefinitions();
      expect(tools).toHaveLength(11);
    });

    it("all tools have name, description, and inputSchema", () => {
      const tools = getSintToolDefinitions();
      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeTruthy();
        expect(tool.name.startsWith("sint__")).toBe(true);
      }
    });
  });

  describe("sint__status", () => {
    it("returns operational status with server info", async () => {
      const ctx = createToolContext();
      const result = await handleSintTool("sint__status", {}, ctx);

      expect(result.content).toHaveLength(1);
      const data = JSON.parse(result.content[0]!.text);
      expect(data.status).toBe("operational");
      expect(data.servers.total).toBe(1);
      expect(data.servers.connected).toBe(1);
      expect(data.tools).toBe(2);
      expect(data.pendingApprovals).toBe(0);
    });
  });

  describe("sint__servers", () => {
    it("lists connected servers", async () => {
      const ctx = createToolContext();
      const result = await handleSintTool("sint__servers", {}, ctx);

      const data = JSON.parse(result.content[0]!.text);
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe("test-server");
      expect(data[0].status).toBe("connected");
      expect(data[0].toolCount).toBe(2);
    });
  });

  describe("sint__whoami", () => {
    it("returns agent identity", async () => {
      const ctx = createToolContext();
      const result = await handleSintTool("sint__whoami", {}, ctx);

      const data = JSON.parse(result.content[0]!.text);
      expect(data.publicKey).toBe(ctx.agentPublicKey);
      expect(data.tokenId).toBe(ctx.tokenId);
      expect(data.role).toBe("agent");
    });
  });

  describe("sint__pending", () => {
    it("returns empty message when no pending", async () => {
      const ctx = createToolContext();
      const result = await handleSintTool("sint__pending", {}, ctx);
      expect(result.content[0]!.text).toBe("No pending approval requests.");
    });
  });

  describe("sint__approve", () => {
    it("returns error when requestId missing", async () => {
      const ctx = createToolContext();
      const result = await handleSintTool("sint__approve", {}, ctx);
      expect(result.content[0]!.text).toContain("requestId is required");
    });

    it("returns error when request not found", async () => {
      const ctx = createToolContext();
      const result = await handleSintTool("sint__approve", { requestId: "nonexistent" }, ctx);
      expect(result.content[0]!.text).toContain("No pending request found");
    });
  });

  describe("sint__deny", () => {
    it("returns error when requestId missing", async () => {
      const ctx = createToolContext();
      const result = await handleSintTool("sint__deny", {}, ctx);
      expect(result.content[0]!.text).toContain("requestId is required");
    });
  });

  describe("sint__audit", () => {
    it("returns empty message with no events", async () => {
      const ctx = createToolContext();
      const result = await handleSintTool("sint__audit", {}, ctx);
      expect(result.content[0]!.text).toBe("No ledger events recorded yet.");
    });

    it("returns events when ledger has entries", async () => {
      const ctx = createToolContext();
      ctx.ledger.append({
        eventType: "policy.evaluated" as any,
        agentId: ctx.agentPublicKey,
        payload: { decision: "allow" },
      });

      const result = await handleSintTool("sint__audit", {}, ctx);
      const data = JSON.parse(result.content[0]!.text);
      expect(data).toHaveLength(1);
      expect(data[0].type).toBe("policy.evaluated");
    });
  });

  describe("sint__remove_server", () => {
    it("removes an existing server", async () => {
      const ctx = createToolContext();
      const result = await handleSintTool("sint__remove_server", { name: "test-server" }, ctx);
      expect(result.content[0]!.text).toContain("removed successfully");
    });

    it("returns error for non-existent server", async () => {
      const ctx = createToolContext();
      const result = await handleSintTool("sint__remove_server", { name: "nope" }, ctx);
      expect(result.content[0]!.text).toContain("not found");
    });
  });

  describe("sint__issue_token", () => {
    it("issues a new scoped capability token", async () => {
      const ctx = createToolContext();
      const result = await handleSintTool("sint__issue_token", {
        subject: ctx.agentPublicKey,
        resource: "mcp://filesystem/*",
        actions: ["call"],
        expiresInHours: 1,
      }, ctx);

      const data = JSON.parse(result.content[0]!.text);
      expect(data.tokenId).toBeTruthy();
      expect(data.resource).toBe("mcp://filesystem/*");
      expect(data.actions).toEqual(["call"]);

      // Verify token was stored
      expect(ctx.tokenStore.has(data.tokenId)).toBe(true);
    });

    it("creates a ledger event for token issuance", async () => {
      const ctx = createToolContext();
      await handleSintTool("sint__issue_token", {
        subject: ctx.agentPublicKey,
        resource: "mcp://*",
        actions: ["call"],
      }, ctx);

      const events = ctx.ledger.getAll();
      expect(events).toHaveLength(1);
      expect(events[0]!.eventType).toBe("token.issued");
    });

    it("returns error with missing fields", async () => {
      const ctx = createToolContext();
      const result = await handleSintTool("sint__issue_token", {}, ctx);
      expect(result.content[0]!.text).toContain("required");
    });
  });

  describe("sint__revoke_token", () => {
    it("revokes an existing token", async () => {
      const ctx = createToolContext();
      // First issue a token
      const issueResult = await handleSintTool("sint__issue_token", {
        subject: ctx.agentPublicKey,
        resource: "mcp://*",
        actions: ["call"],
      }, ctx);
      const { tokenId } = JSON.parse(issueResult.content[0]!.text);

      // Then revoke it
      const result = await handleSintTool("sint__revoke_token", { tokenId, reason: "Testing" }, ctx);
      expect(result.content[0]!.text).toContain("revoked");
      expect(ctx.tokenStore.has(tokenId)).toBe(false);
    });

    it("creates ledger event for revocation", async () => {
      const ctx = createToolContext();
      const issueResult = await handleSintTool("sint__issue_token", {
        subject: ctx.agentPublicKey,
        resource: "mcp://*",
        actions: ["call"],
      }, ctx);
      const { tokenId } = JSON.parse(issueResult.content[0]!.text);

      await handleSintTool("sint__revoke_token", { tokenId }, ctx);

      const events = ctx.ledger.getAll();
      expect(events).toHaveLength(2); // issued + revoked
      expect(events[1]!.eventType).toBe("token.revoked");
    });

    it("returns error for non-existent token", async () => {
      const ctx = createToolContext();
      const result = await handleSintTool("sint__revoke_token", { tokenId: "nonexistent" }, ctx);
      expect(result.content[0]!.text).toContain("not found");
    });
  });
});

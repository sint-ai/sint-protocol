/**
 * SINT MCP — Resources tests.
 */

import { describe, it, expect } from "vitest";
import { getSintResources, readSintResource, type ResourceContext } from "../src/resources/sint-resources.js";
import { DownstreamManager } from "../src/downstream.js";
import { ApprovalQueue } from "@pshkv/gate-policy-gateway";
import { LedgerWriter } from "@pshkv/gate-evidence-ledger";
import type { SintCapabilityToken } from "@pshkv/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

function createResourceContext(): ResourceContext {
  const downstream = new DownstreamManager();
  const mockClient = {} as Client;
  downstream.addConnectedClient("test-server", mockClient, [
    { name: "tool1", inputSchema: { type: "object" } },
  ]);

  return {
    downstream,
    approvalQueue: new ApprovalQueue(),
    ledger: new LedgerWriter(),
    tokenStore: new Map<string, SintCapabilityToken>(),
  };
}

describe("SINT Resources", () => {
  describe("getSintResources", () => {
    it("returns list of resource definitions", () => {
      const resources = getSintResources();
      expect(resources.length).toBeGreaterThan(0);
      for (const r of resources) {
        expect(r.uri).toBeTruthy();
        expect(r.name).toBeTruthy();
        expect(r.mimeType).toBe("application/json");
      }
    });

    it("includes ledger, tokens, approvals, servers, decisions, and granular resources", () => {
      const resources = getSintResources();
      const uris = resources.map((r) => r.uri);
      expect(uris).toContain("sint://ledger/recent");
      expect(uris).toContain("sint://tokens/active");
      expect(uris).toContain("sint://approvals/pending");
      expect(uris).toContain("sint://servers/list");
      expect(uris).toContain("sint://policy/decisions");
      expect(uris).toContain("sint://ledger/event/{eventId}");
      expect(uris).toContain("sint://tokens/{tokenId}");
    });
  });

  describe("readSintResource", () => {
    it("reads ledger/recent resource", () => {
      const ctx = createResourceContext();
      ctx.ledger.append({
        eventType: "policy.evaluated" as any,
        agentId: "agent1",
        payload: { test: true },
      });

      const result = readSintResource("sint://ledger/recent", ctx);
      expect(result).toBeDefined();
      expect(result!.contents).toHaveLength(1);

      const data = JSON.parse(result!.contents[0]!.text);
      expect(data).toHaveLength(1);
      expect(data[0].eventType).toBe("policy.evaluated");
    });

    it("reads empty tokens/active resource", () => {
      const ctx = createResourceContext();
      const result = readSintResource("sint://tokens/active", ctx);
      expect(result).toBeDefined();

      const data = JSON.parse(result!.contents[0]!.text);
      expect(data).toEqual([]);
    });

    it("reads approvals/pending resource", () => {
      const ctx = createResourceContext();
      const result = readSintResource("sint://approvals/pending", ctx);
      expect(result).toBeDefined();

      const data = JSON.parse(result!.contents[0]!.text);
      expect(data).toEqual([]);
    });

    it("reads servers/list resource", () => {
      const ctx = createResourceContext();
      const result = readSintResource("sint://servers/list", ctx);
      expect(result).toBeDefined();

      const data = JSON.parse(result!.contents[0]!.text);
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe("test-server");
    });

    it("returns undefined for unknown resource", () => {
      const ctx = createResourceContext();
      const result = readSintResource("sint://nonexistent", ctx);
      expect(result).toBeUndefined();
    });

    it("reads a single ledger event by eventId", () => {
      const ctx = createResourceContext();
      ctx.ledger.append({
        eventType: "policy.evaluated" as any,
        agentId: "agent1",
        payload: { test: true },
      });

      const events = ctx.ledger.getAll();
      const eventId = events[0]!.eventId;

      const result = readSintResource(`sint://ledger/event/${eventId}`, ctx);
      expect(result).toBeDefined();
      const data = JSON.parse(result!.contents[0]!.text);
      expect(data.eventId).toBe(eventId);
      expect(data.eventType).toBe("policy.evaluated");
    });

    it("returns undefined for non-existent eventId", () => {
      const ctx = createResourceContext();
      const result = readSintResource("sint://ledger/event/nonexistent-id", ctx);
      expect(result).toBeUndefined();
    });

    it("reads a single token by tokenId", () => {
      const ctx = createResourceContext();
      const mockToken = {
        tokenId: "tok-12345",
        issuer: "pub-key-1",
        subject: "pub-key-2",
        resource: "mcp://*",
        actions: ["call"],
        constraints: {},
        delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        revocable: true,
        signature: "sig-abc",
      } as unknown as SintCapabilityToken;

      ctx.tokenStore.set("tok-12345", mockToken);

      const result = readSintResource("sint://tokens/tok-12345", ctx);
      expect(result).toBeDefined();
      const data = JSON.parse(result!.contents[0]!.text);
      expect(data.tokenId).toBe("tok-12345");
      expect(data.resource).toBe("mcp://*");
    });

    it("returns undefined for non-existent tokenId", () => {
      const ctx = createResourceContext();
      const result = readSintResource("sint://tokens/nonexistent", ctx);
      expect(result).toBeUndefined();
    });
  });
});

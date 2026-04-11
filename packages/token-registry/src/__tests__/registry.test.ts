import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryRegistryStore } from "../registry-store.js";
import { buildRegistryEntry } from "../publisher.js";
import type { RegistryEntry, RegistryPublishRequest } from "../types.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function futureDate(offsetMs = 3_600_000): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function pastDate(offsetMs = 3_600_000): string {
  return new Date(Date.now() - offsetMs).toISOString();
}

function makeEntry(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    tokenId: "tok-001",
    issuer: "issuer-pubkey-aabbcc",
    subject: "agent-pubkey-ddeeff",
    resource: "mcp://filesystem/*",
    actions: ["read", "write"],
    validFrom: pastDate(),
    validTo: futureDate(),
    publishedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRequest(overrides: Partial<RegistryPublishRequest> = {}): RegistryPublishRequest {
  return {
    tokenId: "tok-001",
    issuer: "issuer-pubkey-aabbcc",
    subject: "agent-pubkey-ddeeff",
    resource: "mcp://filesystem/*",
    actions: ["read", "write"],
    validFrom: pastDate(),
    validTo: futureDate(),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("InMemoryRegistryStore", () => {
  let store: InMemoryRegistryStore;

  beforeEach(() => {
    store = new InMemoryRegistryStore();
  });

  it("publish + get roundtrip returns the same entry", async () => {
    const entry = makeEntry();
    await store.publish(entry);
    const result = await store.get(entry.tokenId);
    expect(result).toEqual(entry);
  });

  it("list with no filter returns all entries", async () => {
    const e1 = makeEntry({ tokenId: "tok-001" });
    const e2 = makeEntry({ tokenId: "tok-002", issuer: "issuer-xyz" });
    await store.publish(e1);
    await store.publish(e2);
    const all = await store.list();
    expect(all).toHaveLength(2);
  });

  it("list with issuer filter returns only matching entries", async () => {
    const e1 = makeEntry({ tokenId: "tok-001", issuer: "issuer-A" });
    const e2 = makeEntry({ tokenId: "tok-002", issuer: "issuer-B" });
    await store.publish(e1);
    await store.publish(e2);
    const results = await store.list({ issuer: "issuer-A" });
    expect(results).toHaveLength(1);
    expect(results[0]?.issuer).toBe("issuer-A");
  });

  it("list with resource filter uses prefix match stripping wildcard", async () => {
    const e1 = makeEntry({ tokenId: "tok-001", resource: "mcp://filesystem/readFile" });
    const e2 = makeEntry({ tokenId: "tok-002", resource: "mcp://network/fetch" });
    await store.publish(e1);
    await store.publish(e2);
    const results = await store.list({ resource: "mcp://filesystem/*" });
    expect(results).toHaveLength(1);
    expect(results[0]?.tokenId).toBe("tok-001");
  });

  it("verify returns found:true for a known tokenId", async () => {
    const entry = makeEntry();
    await store.publish(entry);
    const result = await store.verify(entry.tokenId);
    expect(result.found).toBe(true);
    expect(result.entry).toEqual(entry);
  });

  it("verify returns found:false for an unknown tokenId", async () => {
    const result = await store.verify("nonexistent-token");
    expect(result.found).toBe(false);
    expect(result.entry).toBeUndefined();
  });

  it("publish twice with same tokenId overwrites the previous entry", async () => {
    const original = makeEntry({ publisherNote: "first" });
    const updated = makeEntry({ publisherNote: "second" });
    await store.publish(original);
    await store.publish(updated);
    const result = await store.get(original.tokenId);
    expect(result?.publisherNote).toBe("second");
  });

  it("list returns empty array when store is empty", async () => {
    const results = await store.list();
    expect(results).toEqual([]);
  });

  it("filter by resource with exact match (no wildcard)", async () => {
    const e1 = makeEntry({ tokenId: "tok-001", resource: "mcp://filesystem/readFile" });
    const e2 = makeEntry({ tokenId: "tok-002", resource: "mcp://network/fetch" });
    await store.publish(e1);
    await store.publish(e2);
    const results = await store.list({ resource: "mcp://filesystem/readFile" });
    expect(results).toHaveLength(1);
    expect(results[0]?.tokenId).toBe("tok-001");
  });

  it("filter by resource with wildcard pattern matches prefix", async () => {
    const e1 = makeEntry({ tokenId: "tok-001", resource: "mcp://filesystem/readFile" });
    const e2 = makeEntry({ tokenId: "tok-002", resource: "mcp://filesystem/writeFile" });
    const e3 = makeEntry({ tokenId: "tok-003", resource: "mcp://network/fetch" });
    await store.publish(e1);
    await store.publish(e2);
    await store.publish(e3);
    const results = await store.list({ resource: "mcp://filesystem/*" });
    expect(results).toHaveLength(2);
  });

  it("verify entry matches published entry fields", async () => {
    const entry = makeEntry({ tokenId: "tok-verify", issuer: "issuer-verify" });
    await store.publish(entry);
    const result = await store.verify("tok-verify");
    expect(result.found).toBe(true);
    expect(result.entry?.issuer).toBe("issuer-verify");
    expect(result.entry?.resource).toBe(entry.resource);
    expect(result.entry?.actions).toEqual(entry.actions);
  });

  it("get returns undefined for missing tokenId", async () => {
    const result = await store.get("does-not-exist");
    expect(result).toBeUndefined();
  });

  it("list with both issuer and resource filter narrows results correctly", async () => {
    const e1 = makeEntry({ tokenId: "tok-001", issuer: "issuer-A", resource: "mcp://filesystem/read" });
    const e2 = makeEntry({ tokenId: "tok-002", issuer: "issuer-A", resource: "mcp://network/fetch" });
    const e3 = makeEntry({ tokenId: "tok-003", issuer: "issuer-B", resource: "mcp://filesystem/read" });
    await store.publish(e1);
    await store.publish(e2);
    await store.publish(e3);
    const results = await store.list({ issuer: "issuer-A", resource: "mcp://filesystem/*" });
    expect(results).toHaveLength(1);
    expect(results[0]?.tokenId).toBe("tok-001");
  });

  it("publisherNote is optional and undefined when not provided", async () => {
    const entry = makeEntry({ publisherNote: undefined });
    await store.publish(entry);
    const result = await store.get(entry.tokenId);
    expect(result?.publisherNote).toBeUndefined();
  });
});

describe("buildRegistryEntry", () => {
  it("throws on expired token (validTo in the past)", () => {
    const req = makeRequest({ validTo: pastDate() });
    expect(() => buildRegistryEntry(req)).toThrow(/expired/);
  });

  it("sets publishedAt to approximately now (within 1 second)", () => {
    const before = Date.now();
    const entry = buildRegistryEntry(makeRequest());
    const after = Date.now();
    const publishedAt = new Date(entry.publishedAt).getTime();
    expect(publishedAt).toBeGreaterThanOrEqual(before);
    expect(publishedAt).toBeLessThanOrEqual(after + 1000);
  });

  it("copies all fields from the request correctly", () => {
    const req = makeRequest({ publisherNote: "test note" });
    const entry = buildRegistryEntry(req);
    expect(entry.tokenId).toBe(req.tokenId);
    expect(entry.issuer).toBe(req.issuer);
    expect(entry.subject).toBe(req.subject);
    expect(entry.resource).toBe(req.resource);
    expect(entry.actions).toEqual(req.actions);
    expect(entry.validFrom).toBe(req.validFrom);
    expect(entry.validTo).toBe(req.validTo);
    expect(entry.publisherNote).toBe("test note");
  });

  it("publisherNote is optional (undefined if not provided)", () => {
    const req = makeRequest();
    const entry = buildRegistryEntry(req);
    // publisherNote not set in req, so should be undefined
    expect(entry.publisherNote).toBeUndefined();
  });
});

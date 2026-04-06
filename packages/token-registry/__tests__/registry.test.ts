import { describe, it, expect } from "vitest";
import { buildRegistryEntry } from "../src/publisher.js";
import { InMemoryRegistryStore } from "../src/registry-store.js";
import type { RegistryEntry } from "../src/types.js";

const FUTURE_DATE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const PAST_DATE = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

function makeToken(overrides?: Record<string, unknown>) {
  return {
    tokenId: "0193a5b2-1234-7abc-8def-000000000001",
    issuer: "issuer-pubkey-abc123",
    subject: "agent-pubkey-xyz789",
    resource: "mcp://filesystem/*",
    issuedAt: "2026-04-01T00:00:00.000000Z",
    expiresAt: FUTURE_DATE,
    signature: "ed25519-sig-deadbeef",
    ...overrides,
  };
}

function makeEntry(overrides?: Partial<RegistryEntry>): RegistryEntry {
  return {
    tokenId: "0193a5b2-1234-7abc-8def-000000000001",
    issuer: "issuer-pubkey-abc123",
    toolScope: "mcp://filesystem/*",
    validFrom: "2026-04-01T00:00:00.000000Z",
    validTo: FUTURE_DATE,
    publicKey: "agent-pubkey-xyz789",
    signature: "ed25519-sig-deadbeef",
    publishedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("buildRegistryEntry", () => {
  it("maps token fields correctly to RegistryEntry", () => {
    const token = makeToken();
    const entry = buildRegistryEntry(token);
    expect(entry.tokenId).toBe(token.tokenId);
    expect(entry.issuer).toBe(token.issuer);
    expect(entry.toolScope).toBe(token.resource); // resource → toolScope
    expect(entry.validFrom).toBe(token.issuedAt); // issuedAt → validFrom
    expect(entry.validTo).toBe(token.expiresAt);  // expiresAt → validTo
    expect(entry.publicKey).toBe(token.subject);  // subject → publicKey
    expect(entry.signature).toBe(token.signature);
    expect(typeof entry.publishedAt).toBe("string");
  });

  it("throws when token is expired", () => {
    const token = makeToken({ expiresAt: PAST_DATE });
    expect(() => buildRegistryEntry(token)).toThrow(/expired/);
  });

  it("throws when tokenId is missing", () => {
    const token = makeToken({ tokenId: undefined });
    expect(() => buildRegistryEntry(token)).toThrow("Token missing tokenId");
  });

  it("throws when signature is missing", () => {
    const token = makeToken({ signature: undefined });
    expect(() => buildRegistryEntry(token)).toThrow("Token missing signature");
  });

  it("includes publisherNote when provided", () => {
    const token = makeToken();
    const entry = buildRegistryEntry(token, "Official registry entry");
    expect(entry.publisherNote).toBe("Official registry entry");
  });

  it("omits publisherNote field when not provided", () => {
    const token = makeToken();
    const entry = buildRegistryEntry(token);
    expect("publisherNote" in entry).toBe(false);
  });

  it("omits publisherNote field when publisherNote is undefined", () => {
    const token = makeToken();
    const entry = buildRegistryEntry(token, undefined);
    expect("publisherNote" in entry).toBe(false);
  });

  it("throws when issuer is missing", () => {
    const token = makeToken({ issuer: undefined });
    expect(() => buildRegistryEntry(token)).toThrow("Token missing issuer");
  });

  it("throws when expiresAt is missing", () => {
    const token = makeToken({ expiresAt: undefined });
    expect(() => buildRegistryEntry(token)).toThrow("Token missing expiresAt");
  });
});

describe("InMemoryRegistryStore", () => {
  it("publish and get: entry is stored and retrievable", async () => {
    const store = new InMemoryRegistryStore();
    const entry = makeEntry();
    await store.publish(entry);
    const retrieved = await store.get(entry.tokenId);
    expect(retrieved).toEqual(entry);
  });

  it("get returns undefined for unknown tokenId", async () => {
    const store = new InMemoryRegistryStore();
    const result = await store.get("nonexistent-token-id");
    expect(result).toBeUndefined();
  });

  it("list with no filter returns all entries", async () => {
    const store = new InMemoryRegistryStore();
    const e1 = makeEntry({ tokenId: "token-1", issuer: "issuer-A", toolScope: "mcp://fs/*" });
    const e2 = makeEntry({ tokenId: "token-2", issuer: "issuer-B", toolScope: "mcp://db/*" });
    await store.publish(e1);
    await store.publish(e2);
    const results = await store.list();
    expect(results).toHaveLength(2);
    expect(results).toContainEqual(e1);
    expect(results).toContainEqual(e2);
  });

  it("list with issuer filter returns only matching entries", async () => {
    const store = new InMemoryRegistryStore();
    const e1 = makeEntry({ tokenId: "token-1", issuer: "issuer-A" });
    const e2 = makeEntry({ tokenId: "token-2", issuer: "issuer-B" });
    await store.publish(e1);
    await store.publish(e2);
    const results = await store.list({ issuer: "issuer-A" });
    expect(results).toHaveLength(1);
    expect(results[0]?.tokenId).toBe("token-1");
  });

  it("list with toolScope filter returns only matching entries", async () => {
    const store = new InMemoryRegistryStore();
    const e1 = makeEntry({ tokenId: "token-1", toolScope: "mcp://filesystem/*" });
    const e2 = makeEntry({ tokenId: "token-2", toolScope: "mcp://database/*" });
    await store.publish(e1);
    await store.publish(e2);
    const results = await store.list({ toolScope: "mcp://filesystem/*" });
    expect(results).toHaveLength(1);
    expect(results[0]?.tokenId).toBe("token-1");
  });

  it("list with both filters applies AND logic", async () => {
    const store = new InMemoryRegistryStore();
    const e1 = makeEntry({ tokenId: "token-1", issuer: "issuer-A", toolScope: "mcp://filesystem/*" });
    const e2 = makeEntry({ tokenId: "token-2", issuer: "issuer-A", toolScope: "mcp://database/*" });
    const e3 = makeEntry({ tokenId: "token-3", issuer: "issuer-B", toolScope: "mcp://filesystem/*" });
    await store.publish(e1);
    await store.publish(e2);
    await store.publish(e3);
    const results = await store.list({ issuer: "issuer-A", toolScope: "mcp://filesystem/*" });
    expect(results).toHaveLength(1);
    expect(results[0]?.tokenId).toBe("token-1");
  });

  it("verify returns { found: true, entry } for known tokenId", async () => {
    const store = new InMemoryRegistryStore();
    const entry = makeEntry();
    await store.publish(entry);
    const result = await store.verify(entry.tokenId);
    expect(result.found).toBe(true);
    expect(result.entry).toEqual(entry);
  });

  it("verify returns { found: false } for unknown tokenId", async () => {
    const store = new InMemoryRegistryStore();
    const result = await store.verify("nonexistent-token");
    expect(result.found).toBe(false);
    expect(result.entry).toBeUndefined();
  });

  it("duplicate publish overwrites entry (idempotent by tokenId)", async () => {
    const store = new InMemoryRegistryStore();
    const e1 = makeEntry({ publisherNote: "first publish" });
    const e2 = makeEntry({ publisherNote: "second publish" });
    await store.publish(e1);
    await store.publish(e2);
    const retrieved = await store.get(e1.tokenId);
    expect(retrieved?.publisherNote).toBe("second publish");
    const all = await store.list();
    expect(all).toHaveLength(1);
  });

  it("empty store returns [] from list()", async () => {
    const store = new InMemoryRegistryStore();
    const results = await store.list();
    expect(results).toEqual([]);
  });

  it("multiple entries are all returned by list()", async () => {
    const store = new InMemoryRegistryStore();
    for (let i = 0; i < 5; i++) {
      await store.publish(makeEntry({ tokenId: `token-${i}` }));
    }
    const results = await store.list();
    expect(results).toHaveLength(5);
  });
});

import { describe, expect, it, vi } from "vitest";
import { createContext } from "../src/server.js";
import { generateKeypair, generateUUIDv7, issueCapabilityToken } from "@pshkv/gate-capability-tokens";
import { LedgerWriter } from "@pshkv/gate-evidence-ledger";
import { createPersistedLedgerEmitter } from "../src/ledger-emitter.js";
import type { LedgerStore } from "@pshkv/persistence";
const event = { eventType: "policy.evaluated", agentId: "a".repeat(64), payload: { decision: "allow" } };

describe("primary ledger acknowledgement", () => {
  it("a real gateway context denies when backing persistence fails, and stays latched", async () => {
    const ctx = createContext();
    const key = generateKeypair();
    const issued = issueCapabilityToken({ issuer: key.publicKey, subject: key.publicKey, resource: "mcp://*", actions: ["call"], constraints: {}, delegationChain: { parentTokenId: null, depth: 0, attenuated: false }, expiresAt: new Date(Date.now() + 3600000).toISOString(), revocable: true }, key.privateKey);
    if (!issued.ok) throw new Error(issued.error);
    await ctx.tokenStore.store(issued.value);
    const append = vi.spyOn(ctx.ledgerStore, "append").mockRejectedValueOnce(new Error("database down"));
    const request = { requestId: generateUUIDv7(), timestamp: new Date().toISOString(), agentId: key.publicKey, tokenId: issued.value.tokenId, resource: "mcp://filesystem/readFile", action: "call", params: {} };
    const first = await ctx.gateway.intercept(request);
    expect(first).toMatchObject({ action: "deny", denial: { policyViolated: "AUDIT_UNAVAILABLE" } });
    expect(first.transformations?.additionalAuditFields?.["auditStatus"]).toBe("unavailable");
    append.mockResolvedValue(undefined);
    const second = await ctx.gateway.intercept({ ...request, requestId: generateUUIDv7() });
    expect(second.action).toBe("deny");
    expect(append).toHaveBeenCalledTimes(1);
    expect(ctx.ledger.verifyChain().ok).toBe(true);
  });
  it("serializes concurrent appends and does not pass a failed sequence", async () => {
    let fail!: (cause: unknown) => void;
    const pending = new Promise<void>((_resolve, reject) => { fail = reject; });
    const append = vi.fn(() => pending);
    const ledger = new LedgerWriter();
    const emit = createPersistedLedgerEmitter(ledger, { append } as unknown as LedgerStore);
    const one = emit(event);
    const two = emit(event);
    await Promise.resolve(); await Promise.resolve();
    expect(append).toHaveBeenCalledTimes(1);
    fail(new Error("uncertain delivery"));
    expect(await one).toEqual({ ok: false, error: "LEDGER_PERSISTENCE_UNAVAILABLE" });
    expect(await two).toEqual({ ok: false, error: "LEDGER_PERSISTENCE_UNAVAILABLE" });
    expect(append).toHaveBeenCalledTimes(1);
    expect(ledger.verifyChain().ok).toBe(true);
  });
  it("acknowledges healthy persistence in chain order", async () => {
    const persisted: bigint[] = [];
    const ledger = new LedgerWriter();
    const emit = createPersistedLedgerEmitter(ledger, { append: async (entry: any) => { persisted.push(entry.sequenceNumber); } } as LedgerStore);
    expect(await Promise.all([emit(event), emit(event)])).toEqual([{ ok: true, value: undefined }, { ok: true, value: undefined }]);
    expect(persisted).toEqual([1n, 2n]);
  });
});

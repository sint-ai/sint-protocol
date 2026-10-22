import { afterAll, describe, expect, it } from "vitest";
import { closePool, getPool } from "@pshkv/persistence";
import { generateKeypair, generateUUIDv7, issueCapabilityToken, validateTokenSignature } from "@pshkv/gate-capability-tokens";
import { createPersistentContext } from "../src/server.js";

// Separate schema: this integration test never touches another test's ledger.
const schema = `ledger_restart_${generateUUIDv7().replaceAll("-", "")}`;
let databaseUrl: string | undefined;
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set("options", `-csearch_path=${schema}`);
  databaseUrl = url.toString();
}
afterAll(async () => {
  if (!databaseUrl) return;
  const pool = getPool({ connectionString: databaseUrl });
  await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await closePool();
});

describe.skipIf(!databaseUrl)("PostgreSQL gateway restart", () => {
  it("continues the persisted sequence and hash chain after a fresh context", async () => {
    const pool = getPool({ connectionString: databaseUrl! });
    await pool.query(`CREATE SCHEMA ${schema}`);
    const config = { env: "test", port: 3100, store: "postgres", cache: "memory", databaseUrl, requireSignatures: false, rateLimitMax: 100, wsAllowQueryApiKey: false } as const;
    const first = await createPersistentContext(config);
    const key = generateKeypair();
    const token = issueCapabilityToken({ issuer: key.publicKey, subject: key.publicKey, resource: "mcp://*", actions: ["call"], constraints: {}, delegationChain: { parentTokenId: null, depth: 0, attenuated: false }, expiresAt: new Date(Date.now() + 3600000).toISOString(), revocable: true }, key.privateKey);
    expect(token.ok).toBe(true);
    if (!token.ok) return;
    await first.tokenStore.store(token.value);
    const roundTrip = await first.tokenStore.get(token.value.tokenId);
    expect(roundTrip).toEqual(token.value);
    expect(validateTokenSignature(roundTrip!)).toEqual({ ok: true, value: true });
    const request = { requestId: generateUUIDv7(), timestamp: new Date().toISOString(), agentId: key.publicKey, tokenId: token.value.tokenId, resource: "mcp://filesystem/readFile", action: "call", params: {} };
    expect((await first.gateway.intercept(request)).action).toBe("allow");
    const head = await first.ledgerStore.getHead();
    await closePool();
    const restarted = await createPersistentContext(config);
    expect(restarted.ledger.headHash).toBe(head!.hash);
    expect((await restarted.readinessProbe()).ok).toBe(true);
    expect((await restarted.gateway.intercept({ ...request, requestId: generateUUIDv7() })).action).toBe("allow");
    const appended = await restarted.ledgerStore.query({ fromSequence: head!.sequenceNumber + 1n });
    expect(appended[0]).toMatchObject({ sequenceNumber: head!.sequenceNumber + 1n, previousHash: head!.hash });
    expect(restarted.ledger.verifyChain()).toEqual({ ok: true, value: true });
    expect(await restarted.ledgerStore.count()).toBe(restarted.ledger.length);
  });
});

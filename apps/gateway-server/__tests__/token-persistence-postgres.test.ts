import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, ensurePgSchema, getPool, PgTokenStore } from "@pshkv/persistence";
import { computeSigningPayload, generateKeypair, generateUUIDv7, issueCapabilityToken, sign, validateTokenSignature } from "@pshkv/gate-capability-tokens";
import { PolicyGateway } from "@pshkv/gate-policy-gateway";
import type { SintCapabilityToken, SintCapabilityTokenRequest } from "@pshkv/core";

const fixture = JSON.parse(readFileSync(new URL("../../../packages/conformance-tests/fixtures/security/signed-token-persistence.v1.json", import.meta.url), "utf8")) as {
  policyFields: Record<string, unknown>; otherOptionalFields: Record<string, unknown>; combinations: string[][];
};
const key = generateKeypair();
const variants = fixture.combinations.map(fields => ({ name: fields.join("+") || "absent", fields: Object.fromEntries(fields.map(field => [field, fixture.policyFields[field]])) }));
variants.push({ name: "all-signed-optional-fields", fields: { ...fixture.policyFields, ...fixture.otherOptionalFields } });
const migration = ["007_token_policy_fields.sql", "008_predictive_policy_fields.sql"]
  .map(file => readFileSync(new URL(`../../../packages/persistence/migrations/${file}`, import.meta.url), "utf8")).join("\n");
// Recreate the pre-007 table shape; bootstrap and the standalone migration must
// both upgrade it without rewriting existing signed rows.
const legacyDDL = readFileSync(new URL("../../../packages/persistence/migrations/002_create_tokens.sql", import.meta.url), "utf8")
  .split("ALTER TABLE")[0]!.replace(/^.*(?:autonomy_policy|human_authority_requirements|regulated_data_policy|deployment_envelope|manufacturing_envelope|hazardous_energy_envelope|adaptation_permit).*\n/gm, "");

function issue(fields: Record<string, unknown> = {}): SintCapabilityToken {
  const token = issueCapabilityToken({ issuer: key.publicKey, subject: key.publicKey, resource: "mcp://*", actions: ["call"], constraints: {}, delegationChain: { parentTokenId: null, depth: 0, attenuated: false }, expiresAt: new Date(Date.now() + 3600000).toISOString(), revocable: true, ...fields } as SintCapabilityTokenRequest, key.privateKey);
  expect(token.ok, JSON.stringify(token)).toBe(true);
  if (!token.ok) throw new Error("test token invalid");
  return token.value;
}
function request(token: SintCapabilityToken) {
  return { requestId: generateUUIDv7(), timestamp: new Date().toISOString(), agentId: token.subject, tokenId: token.tokenId, resource: "mcp://filesystem/readFile", action: "call", params: {} };
}

describe.skipIf(!process.env.DATABASE_URL).each(["bootstrap", "migration"])("signed tokens with PostgreSQL %s upgrade", mode => {
  const schema = `token_policy_${generateUUIDv7().replaceAll("-", "")}`;
  let pool: ReturnType<typeof getPool>;
  let store: PgTokenStore;
  let legacy: SintCapabilityToken;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set("options", `-csearch_path=${schema}`);
    pool = getPool({ connectionString: url.toString() });
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(legacyDDL);
    legacy = issue();
    await pool.query(`INSERT INTO sint_tokens (token_id, issuer, subject, resource, actions, constraints, delegation_chain, issued_at, expires_at, revocable, signature) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [legacy.tokenId, legacy.issuer, legacy.subject, legacy.resource, JSON.stringify(legacy.actions), JSON.stringify(legacy.constraints), JSON.stringify(legacy.delegationChain), legacy.issuedAt, legacy.expiresAt, legacy.revocable, legacy.signature]);
    for (let repeat = 0; repeat < 2; repeat++) {
      if (mode === "bootstrap") await ensurePgSchema(pool);
      else await pool.query(migration);
    }
    store = new PgTokenStore(pool);
  });
  afterAll(async () => {
    if (pool) await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await closePool();
  });
  it("preserves an existing legacy row and its signature", async () => {
    const restored = await store.get(legacy.tokenId);
    expect(restored).toEqual(legacy);
    expect(validateTokenSignature(restored!)).toEqual({ ok: true, value: true });
  });
  it.each(variants)("$name retains the signed payload, signature, and gateway behavior", async ({ fields }) => {
    const token = issue(fields);
    await store.store(token);
    const listed = (await store.getBySubject(token.subject)).find(entry => entry.tokenId === token.tokenId);
    const restored = await store.get(token.tokenId);
    for (const read of [listed, restored]) {
      expect(read).toEqual(token);
      expect(computeSigningPayload(read!)).toBe(computeSigningPayload(token));
      expect(validateTokenSignature(read!)).toEqual({ ok: true, value: true });
    }
    const input = request(token);
    const before = await new PolicyGateway({ resolveToken: () => token }).intercept(input);
    const after = await new PolicyGateway({ resolveToken: id => store.get(id) }).intercept(input);
    expect(after.action).toBe(before.action);
    expect(after.assignedTier).toBe(before.assignedTier);
    expect(after.denial?.policyViolated).toBe(before.denial?.policyViolated);
  });
  it.each([
    { field: "autonomyPolicy", column: "autonomy_policy", path: ["assistanceQuorum", "required"], value: 1 },
    { field: "humanAuthorityRequirements", column: "human_authority_requirements", path: ["requireUniquePrincipal"], value: false },
    { field: "regulatedDataPolicy", column: "regulated_data_policy", path: ["allowFallback"], value: true },
    { field: "deploymentEnvelope", column: "deployment_envelope", path: ["proofFreshness", "maxProofAgeMs"], value: 600000 },
    { field: "manufacturingEnvelope", column: "manufacturing_envelope", path: ["inspectionRequired"], value: false },
    { field: "hazardousEnergyEnvelope", column: "hazardous_energy_envelope", path: ["maxObservationAgeMs"], value: 60000 },
    { field: "adaptationPermit", column: "adaptation_permit", path: ["maxTrials"], value: 1000 },
  ].flatMap(entry => [
    { ...entry, mutation: "widen" },
    { ...entry, mutation: "remove", path: null, value: null },
  ]))("SQL $mutation of signed $field fails signature verification and authorization", async ({ field, column, path, value }) => {
    const token = issue({ [field]: fixture.policyFields[field] });
    await store.store(token);
    expect(validateTokenSignature((await store.get(token.tokenId))!)).toEqual({ ok: true, value: true });
    // Column is from the fixed test table above, never from an external input.
    await pool.query(`UPDATE sint_tokens SET ${column} = CASE WHEN $2::text[] IS NULL THEN NULL ELSE jsonb_set(${column}, $2::text[], $3::jsonb) END WHERE token_id = $1`, [token.tokenId, path, JSON.stringify(value)]);
    expect(validateTokenSignature((await store.get(token.tokenId))!)).toEqual({ ok: false, error: "INVALID_SIGNATURE" });
    const decision = await new PolicyGateway({ resolveToken: id => store.get(id) }).intercept(request(token));
    expect(decision).toMatchObject({ action: "deny", denial: { policyViolated: "INVALID_SIGNATURE" } });
  });
  it("updates and clears all policy columns on signed replacements", async () => {
    const initial = issue(fixture.policyFields);
    await store.store(initial);
    const changed = issue({ ...fixture.policyFields, regulatedDataPolicy: { allowedPurposes: ["RESEARCH"], allowFallback: false } });
    for (const next of [changed, issue(), initial]) {
      const replacement = { ...next, tokenId: initial.tokenId };
      const signed = { ...replacement, signature: sign(key.privateKey, computeSigningPayload(replacement)) };
      await store.store(signed);
      const restored = await store.get(initial.tokenId);
      expect(restored).toEqual(signed);
      expect(validateTokenSignature(restored!)).toEqual({ ok: true, value: true });
    }
  });
});

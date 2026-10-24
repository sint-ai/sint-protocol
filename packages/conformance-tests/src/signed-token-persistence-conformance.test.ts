import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { capabilityTokenSchema, type SintCapabilityToken, type SintCapabilityTokenRequest } from "@pshkv/core";
import { computeSigningPayload, generateKeypair, generateUUIDv7, issueCapabilityToken, validateTokenSignature } from "@pshkv/gate-capability-tokens";
import { PgTokenStore } from "@pshkv/persistence";
import { PolicyGateway } from "@pshkv/gate-policy-gateway";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/security/signed-token-persistence.v1.json", import.meta.url), "utf8")) as {
  policyFields: Record<string, unknown>; otherOptionalFields: Record<string, unknown>; combinations: string[][];
};
const key = generateKeypair();
const variants = fixture.combinations.map(fields => ({ name: fields.join("+") || "absent", fields: Object.fromEntries(fields.map(field => [field, fixture.policyFields[field]])) }));
variants.push({ name: "all-signed-optional-fields", fields: { ...fixture.policyFields, ...fixture.otherOptionalFields } });
function issue(fields: Record<string, unknown> = {}): SintCapabilityToken {
  const result = issueCapabilityToken({ issuer: key.publicKey, subject: key.publicKey, resource: "mcp://*", actions: ["call"], constraints: {}, delegationChain: { parentTokenId: null, depth: 0, attenuated: false }, expiresAt: new Date(Date.now() + 3600000).toISOString(), revocable: true, ...fields } as SintCapabilityTokenRequest, key.privateKey);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error("test token invalid");
  return result.value;
}
// A SQL transport double, not an authorization harness: it maps INSERT column
// lists to parameters generically and mimics JSONB key reordering and SQL NULL.
// The required CI database gate exercises the actual PostgreSQL driver/schema.
function transport() {
  const rows = new Map<string, Record<string, unknown>>();
  const jsonColumns = new Set(["actions", "constraints", "delegation_chain", "model_constraints", "attestation_requirements", "verifiable_compute_requirements", "execution_envelope", "behavioral_constraints", "post_quantum_signatures", "autonomy_policy", "human_authority_requirements", "regulated_data_policy", "deployment_envelope", "manufacturing_envelope", "hazardous_energy_envelope", "adaptation_permit"]);
  const reorder = (value: any): any => Array.isArray(value) ? value.map(reorder) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().reverse().map(key => [key, reorder(value[key])])) : value;
  const query = async (sql: string, values: unknown[]) => {
    const insert = /INSERT INTO sint_tokens\s*\(([^)]+)\)/.exec(sql);
    if (insert) {
      const columns = insert[1]!.split(",").map(column => column.trim());
      const row = Object.fromEntries(columns.map((column, index) => [column, values[index] == null ? null : jsonColumns.has(column) ? reorder(JSON.parse(values[index] as string)) : values[index]]));
      rows.set(row["token_id"] as string, row);
      return { rows: [] };
    }
    return { rows: [...rows.values()].filter(row => sql.includes("subject =") ? row["subject"] === values[0] : row["token_id"] === values[0]) };
  };
  return new PgTokenStore({ query } as unknown as ConstructorParameters<typeof PgTokenStore>[0]);
}

describe("signed token SQL transport invariants", () => {
  it.each(variants)("$name retains signing payload and signature through both read paths", async ({ fields }) => {
    const token = issue(fields);
    const store = transport();
    await store.store(token);
    const reads = [await store.get(token.tokenId), ...(await store.getBySubject(token.subject))];
    expect(reads).toHaveLength(2);
    for (const restored of reads) {
      expect(restored).toEqual(token);
      expect(computeSigningPayload(restored!)).toBe(computeSigningPayload(token));
      expect(validateTokenSignature(restored!)).toEqual({ ok: true, value: true });
    }
  });
  it.each(variants)("$name preserves actual gateway decisions", async ({ fields }) => {
    const token = issue(fields);
    const store = transport();
    await store.store(token);
    const request = { requestId: generateUUIDv7(), timestamp: new Date().toISOString(), agentId: key.publicKey, tokenId: token.tokenId, resource: "mcp://filesystem/readFile", action: "call", params: {} };
    const before = await new PolicyGateway({ resolveToken: () => token }).intercept(request);
    const after = await new PolicyGateway({ resolveToken: id => store.get(id) }).intercept(request);
    expect(after.action).toBe(before.action);
    expect(after.denial?.policyViolated).toBe(before.denial?.policyViolated);
    expect(after.assignedTier).toBe(before.assignedTier);
  });
  it.each(Object.keys(fixture.policyFields))("removing stored %s still invalidates the signature", async field => {
    const store = transport();
    const token = issue({ [field]: fixture.policyFields[field] });
    await store.store(token);
    const restored = await store.get(token.tokenId);
    expect(validateTokenSignature(restored!)).toEqual({ ok: true, value: true });
    const altered = { ...restored, [field]: undefined } as SintCapabilityToken;
    expect(validateTokenSignature(altered)).toEqual({ ok: false, error: "INVALID_SIGNATURE" });
  });
  it("the populated fixture covers every schema and signing-payload field", () => {
    const token = issue({ ...fixture.policyFields, ...fixture.otherOptionalFields });
    const schemaKeys = capabilityTokenSchema.keyof().options;
    expect(Object.keys(token).filter(key => token[key as keyof SintCapabilityToken] !== undefined).sort()).toEqual([...schemaKeys].sort());
    expect(Object.keys(JSON.parse(computeSigningPayload(token))).sort()).toEqual(schemaKeys.filter(key => key !== "signature").sort());
  });
});

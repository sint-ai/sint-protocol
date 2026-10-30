import { describe, expect, it } from "vitest";
import { generateKeypair, issueCapabilityToken, delegateCapabilityToken, RevocationStore } from "@pshkv/gate-capability-tokens";
import type { SintCapabilityToken } from "@pshkv/core";
import { verifyTokenTrustChain } from "../src/token-trust.js";
import { PolicyGateway } from "../src/gateway.js";
import { generateUUIDv7, nowISO8601 } from "@pshkv/gate-capability-tokens";

const expiry = () => new Date(Date.now() + 60_000).toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");

describe("trusted capability lineage", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  const subagent = generateKeypair();
  const attacker = generateKeypair();

  function fixture() {
    const issued = issueCapabilityToken({
      issuer: root.publicKey, subject: agent.publicKey, resource: "mcp://filesystem/*",
      actions: ["call", "subscribe"], constraints: { maxVelocityMps: 1 },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: expiry(), revocable: true,
    }, root.privateKey);
    if (!issued.ok) throw new Error(issued.error);
    const delegated = delegateCapabilityToken(issued.value, {
      newSubject: subagent.publicKey, restrictActions: ["call"],
      tightenConstraints: { maxVelocityMps: 0.5 },
    }, agent.privateKey);
    if (!delegated.ok) throw new Error(delegated.error);
    const tokens = new Map<string, SintCapabilityToken>([
      [issued.value.tokenId, issued.value], [delegated.value.tokenId, delegated.value],
    ]);
    return { root: issued.value, child: delegated.value, tokens };
  }

  it("accepts an attenuated chain from an approved root", async () => {
    const { child, tokens } = fixture();
    expect((await verifyTokenTrustChain(child, id => tokens.get(id), [root.publicKey])).ok).toBe(true);
  });

  it("rejects a self-issued root even with a valid signature", async () => {
    const issued = issueCapabilityToken({
      issuer: attacker.publicKey, subject: attacker.publicKey, resource: "mcp://*",
      actions: ["call"], constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: expiry(), revocable: true,
    }, attacker.privateKey);
    if (!issued.ok) throw new Error(issued.error);
    expect(await verifyTokenTrustChain(issued.value, () => undefined, [root.publicKey]))
      .toEqual({ ok: false, error: "UNKNOWN_ISSUER" });
    const gateway = new PolicyGateway({
      resolveToken: () => issued.value, trustedIssuers: [root.publicKey],
    });
    const decision = await gateway.intercept({
      requestId: generateUUIDv7(), timestamp: nowISO8601(), agentId: attacker.publicKey,
      tokenId: issued.value.tokenId, resource: "mcp://filesystem/readFile",
      action: "call", params: {},
    });
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("UNKNOWN_ISSUER");
  });

  it("rejects missing or revoked ancestors", async () => {
    const { root: parent, child, tokens } = fixture();
    expect((await verifyTokenTrustChain(child, () => undefined, [root.publicKey])).ok).toBe(false);
    const revoked = new RevocationStore();
    revoked.revoke(parent.tokenId, "compromised", "operator");
    expect(await verifyTokenTrustChain(child, id => tokens.get(id), [root.publicKey], revoked))
      .toEqual({ ok: false, error: "TOKEN_REVOKED" });
  });

  it("rejects a signed child that expands its parent's permissions", async () => {
    const { root: parent, tokens } = fixture();
    const expanded = issueCapabilityToken({
      issuer: agent.publicKey, subject: subagent.publicKey, resource: parent.resource,
      actions: ["call", "exec.run"], constraints: parent.constraints,
      delegationChain: { parentTokenId: parent.tokenId, depth: 1, attenuated: true },
      expiresAt: expiry(), revocable: true,
    }, agent.privateKey);
    if (!expanded.ok) throw new Error(expanded.error);
    expect(await verifyTokenTrustChain(expanded.value, id => tokens.get(id), [root.publicKey]))
      .toEqual({ ok: false, error: "INSUFFICIENT_PERMISSIONS" });
  });
});

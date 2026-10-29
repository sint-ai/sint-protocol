import { describe, expect, it } from "vitest";
import { canonicalJsonStringify } from "@pshkv/core";
import { generateKeypair, sign } from "@pshkv/gate-capability-tokens";
import { verifyOperatorVote } from "../src/approval-signature.js";

describe("operator approval signatures", () => {
  const operator = generateKeypair();
  const agent = generateKeypair();
  const requestId = "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7";
  const at = new Date();

  function vote(by = operator.publicKey, privateKey = operator.privateKey, signedAt = at.toISOString()) {
    const payload = { requestId, status: "approved", by, signedAt, reason: null };
    return { ...payload, signature: sign(privateKey, canonicalJsonStringify(payload)) };
  }

  it("accepts a fresh vote from an allowlisted operator", () => {
    expect(verifyOperatorVote(requestId, vote(), agent.publicKey, [operator.publicKey], at.getTime())).toBe(true);
  });

  it("rejects agent votes, forged identities and altered decisions", () => {
    expect(verifyOperatorVote(requestId, vote(agent.publicKey, agent.privateKey), agent.publicKey,
      [agent.publicKey], at.getTime())).toBe(false);
    expect(verifyOperatorVote(requestId, vote(operator.publicKey, agent.privateKey), agent.publicKey,
      [operator.publicKey], at.getTime())).toBe(false);
    expect(verifyOperatorVote(requestId, { ...vote(), status: "denied" }, agent.publicKey,
      [operator.publicKey], at.getTime())).toBe(false);
  });

  it("rejects stale and cross-request replayed votes", () => {
    expect(verifyOperatorVote(requestId, vote(operator.publicKey, operator.privateKey,
      new Date(at.getTime() - 301_000).toISOString()), agent.publicKey,
      [operator.publicKey], at.getTime())).toBe(false);
    expect(verifyOperatorVote("another-request", vote(), agent.publicKey,
      [operator.publicKey], at.getTime())).toBe(false);
  });
});

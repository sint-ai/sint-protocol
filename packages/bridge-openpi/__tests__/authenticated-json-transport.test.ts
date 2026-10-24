import { describe, expect, it, vi } from "vitest";
import { ok } from "@pshkv/core";
import { AuthenticatedOpenPiTransport } from "../src/index.js";

const digest = (character: string): string => character.repeat(64);
const request = {
  requestNonce: "nonce:unique", observation: { digest: digest("a"), worldSnapshotDigest: digest("b"), payload: {} },
  prompt: "move", intentDigest: digest("c"), requestedAt: "2026-09-02T20:00:00.000Z",
};

describe("AuthenticatedOpenPiTransport", () => {
  it("sends the versioned protocol only over a secure endpoint", async () => {
    const exchange = vi.fn(async () => ok({
      requestNonce: request.requestNonce, responseId: "r1", issuedAt: request.requestedAt,
      serverIdentity: "did:key:openpi", observationDigest: digest("a"), actionSpaceDigest: digest("d"),
      embodimentId: "arm-1", checkpointDigest: digest("e"), actions: [[0.1]], signature: "sig",
    }));
    const transport = new AuthenticatedOpenPiTransport({ endpoint: "wss://openpi.internal/infer", timeoutMs: 500, channel: { exchange } });
    expect((await transport.infer(request)).ok).toBe(true);
    expect(exchange.mock.calls[0]?.[0]).toBe("wss://openpi.internal/infer");
    expect(exchange.mock.calls[0]?.[1]).toMatchObject({ protocol: "sint-openpi/1", type: "infer" });
  });

  it("rejects malformed untrusted wire responses", async () => {
    const transport = new AuthenticatedOpenPiTransport({
      endpoint: "unix:///run/openpi.sock", timeoutMs: 500,
      channel: { exchange: async () => ok({ actions: [[null]] }) },
    });
    const result = await transport.infer(request);
    expect(result.ok ? undefined : result.error.code).toBe("INVALID_RESPONSE");
  });
});

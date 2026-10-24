import { describe, expect, it } from "vitest";
import {
  delegateCapabilityToken,
  generateKeypair,
  issueCapabilityToken,
} from "../src/index.js";
import type { SintCapabilityTokenRequest } from "@pshkv/core";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

describe("Manufacturing execution envelope", () => {
  const issuer = generateKeypair();
  const subject = generateKeypair();
  const delegate = generateKeypair();

  const baseRequest: SintCapabilityTokenRequest = {
    issuer: issuer.publicKey,
    subject: subject.publicKey,
    resource: "factory:///parts/PN-42",
    actions: ["execute"],
    constraints: {},
    deploymentEnvelope: {
      contextualBinding: {
        deploymentProfile: "industrial-cell",
        siteId: "factory-7",
        bridgeId: "bridge-1",
        bridgeProtocol: "opc-ua",
        resource: "factory:///parts/PN-42",
        action: "execute",
      },
    },
    manufacturingEnvelope: {
      partNumber: "PN-42",
      revision: "B",
      drawingDigest: "a".repeat(64),
      camProgramDigest: "b".repeat(64),
      machineId: "cnc-7",
      cellId: "cell-a",
      fixtureSet: ["vise-a"],
      toolingSet: ["tool-1"],
      materialLotId: "lot-9",
      allowedMaterialSubstitutions: ["lot-9b"],
      routeId: "route-1",
      maxRouteStep: 3,
      qualityPlanDigest: "c".repeat(64),
      inspectionRequired: true,
      flowdownTags: ["export-controlled"],
    },
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    expiresAt: futureISO(12),
    revocable: true,
  };

  it("preserves the manufacturing envelope through issuance and delegation", () => {
    const issued = issueCapabilityToken(baseRequest, issuer.privateKey);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    expect(issued.value.manufacturingEnvelope?.partNumber).toBe("PN-42");
    expect(issued.value.manufacturingEnvelope?.allowedMaterialSubstitutions).toEqual(["lot-9b"]);

    const delegated = delegateCapabilityToken(
      issued.value,
      { newSubject: delegate.publicKey },
      subject.privateKey,
    );
    expect(delegated.ok).toBe(true);
    if (!delegated.ok) return;

    expect(delegated.value.manufacturingEnvelope?.partNumber).toBe("PN-42");
    expect(delegated.value.manufacturingEnvelope?.machineId).toBe("cnc-7");
  });
});


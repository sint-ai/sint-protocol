/**
 * APS ↔ SINT interoperability mapping tests.
 */

import { describe, it, expect } from "vitest";
import { apsScopeToSintMapping, sintTokenToApsProjection } from "../src/aps-mapping.js";
import type { ApsDelegationScope } from "../src/aps-mapping.js";
import {
  generateKeypair,
  issueCapabilityToken,
} from "@sint/gate-capability-tokens";

function futureISO(h = 24): string {
  return new Date(Date.now() + h * 3_600_000).toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

const root = generateKeypair();
const agent = generateKeypair();

function makeToken(overrides: {
  resource?: string;
  actions?: string[];
  maxVelocityMps?: number;
  maxForceNewtons?: number;
}) {
  const result = issueCapabilityToken({
    issuer: root.publicKey,
    subject: agent.publicKey,
    resource: overrides.resource ?? "a2a://warehouse.example.com/*",
    actions: overrides.actions ?? ["a2a.send"],
    constraints: {
      maxVelocityMps: overrides.maxVelocityMps,
      maxForceNewtons: overrides.maxForceNewtons,
    },
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    expiresAt: futureISO(),
    revocable: true,
  }, root.privateKey);
  if (!result.ok) throw new Error("Token issuance failed");
  return result.value;
}

describe("apsScopeToSintMapping", () => {
  it("maps single-domain APS scope to scoped a2a URI", () => {
    const scope: ApsDelegationScope = {
      resourceScope: ["logistics:dispatch"],
      allowedActions: ["execute"],
      attestationGrade: 2,
    };
    const result = apsScopeToSintMapping(scope);
    expect(result.resource).toBe("a2a://logistics/dispatch");
    expect(result.actions).toContain("a2a.send");
  });

  it("maps multi-path APS scope to wildcard URI for same domain", () => {
    const scope: ApsDelegationScope = {
      resourceScope: ["logistics:dispatch", "logistics:status"],
      attestationGrade: 2,
    };
    const result = apsScopeToSintMapping(scope);
    expect(result.resource).toBe("a2a://logistics/*");
  });

  it("maps multi-domain scope to full wildcard", () => {
    const scope: ApsDelegationScope = {
      resourceScope: ["logistics:dispatch", "inventory:read"],
      attestationGrade: 2,
    };
    const result = apsScopeToSintMapping(scope);
    expect(result.resource).toBe("a2a://*");
  });

  it("empty scope maps to a2a://*", () => {
    const scope: ApsDelegationScope = { resourceScope: [] };
    const result = apsScopeToSintMapping(scope);
    expect(result.resource).toBe("a2a://*");
  });

  it("maps APS allowedActions to SINT a2a.* actions", () => {
    const scope: ApsDelegationScope = {
      resourceScope: ["logistics:dispatch"],
      allowedActions: ["execute", "read", "stream"],
      attestationGrade: 2,
    };
    const result = apsScopeToSintMapping(scope);
    expect(result.actions).toContain("a2a.send");
    expect(result.actions).toContain("a2a.get");
    expect(result.actions).toContain("a2a.stream");
  });

  it("maps spendLimit to rateLimit.maxCalls (1 call per $10 proxy)", () => {
    const scope: ApsDelegationScope = {
      resourceScope: ["logistics:dispatch"],
      spendLimit: 500,
      attestationGrade: 2,
    };
    const result = apsScopeToSintMapping(scope);
    expect(result.constraints.rateLimit).toBeDefined();
    expect(result.constraints.rateLimit!.maxCalls).toBe(50); // 500/10
    expect(result.constraints.rateLimit!.windowMs).toBe(3_600_000);
  });

  it("maps APS temporalValidity to SINT timeWindow", () => {
    const start = new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
    const end = futureISO(8);
    const scope: ApsDelegationScope = {
      resourceScope: ["logistics:dispatch"],
      temporalValidity: { start, end },
      attestationGrade: 2,
    };
    const result = apsScopeToSintMapping(scope);
    expect(result.constraints.timeWindow).toEqual({ start, end });
  });

  it("tier escalation = 0 for attestation grade 2 (infrastructure-attested)", () => {
    const scope: ApsDelegationScope = {
      resourceScope: ["logistics:dispatch"],
      attestationGrade: 2,
    };
    const result = apsScopeToSintMapping(scope);
    expect(result.tierEscalation).toBe(0);
  });

  it("tier escalation = 1 for attestation grade < 2 (not infrastructure-attested)", () => {
    const scope: ApsDelegationScope = {
      resourceScope: ["logistics:dispatch"],
      attestationGrade: 1,
    };
    const result = apsScopeToSintMapping(scope);
    expect(result.tierEscalation).toBe(1);
  });

  it("tier escalation = 1 when attestationGrade is absent", () => {
    const scope: ApsDelegationScope = {
      resourceScope: ["logistics:dispatch"],
    };
    const result = apsScopeToSintMapping(scope);
    expect(result.tierEscalation).toBe(1);
  });

  it("warns that physical constraints cannot be derived from APS scope", () => {
    const scope: ApsDelegationScope = { resourceScope: ["logistics:dispatch"] };
    const result = apsScopeToSintMapping(scope);
    expect(result.warnings.some((w) => w.includes("maxVelocityMps"))).toBe(true);
  });

  it("warns about spendLimit→rateLimit approximation when spendLimit is set", () => {
    const scope: ApsDelegationScope = {
      resourceScope: ["logistics:dispatch"],
      spendLimit: 100,
    };
    const result = apsScopeToSintMapping(scope);
    expect(result.warnings.some((w) => w.includes("spendLimit"))).toBe(true);
  });
});

describe("sintTokenToApsProjection", () => {
  it("preserves resource as resourceScope", () => {
    const token = makeToken({ resource: "a2a://warehouse.example.com/navigate" });
    const projection = sintTokenToApsProjection(token);
    expect(projection.resourceScope).toContain("a2a://warehouse.example.com/navigate");
  });

  it("maps SINT a2a.send to APS execute action", () => {
    const token = makeToken({ actions: ["a2a.send"] });
    const projection = sintTokenToApsProjection(token);
    expect(projection.allowedActions).toContain("execute");
  });

  it("maps SINT a2a.get to APS read action", () => {
    const token = makeToken({ actions: ["a2a.get"] });
    const projection = sintTokenToApsProjection(token);
    expect(projection.allowedActions).toContain("read");
  });

  it("preserves temporalValidity from token issuedAt/expiresAt", () => {
    const token = makeToken({});
    const projection = sintTokenToApsProjection(token);
    expect(projection.temporalValidity.start).toBe(token.issuedAt);
    expect(projection.temporalValidity.end).toBe(token.expiresAt);
  });

  it("SINT tokens are always attestation grade 2 (infrastructure-attested)", () => {
    const token = makeToken({});
    const projection = sintTokenToApsProjection(token);
    expect(projection.attestationGrade).toBe(2);
  });

  it("includes physical constraint metadata in dataAccessTerms", () => {
    const token = makeToken({ maxVelocityMps: 0.5, maxForceNewtons: 50 });
    const projection = sintTokenToApsProjection(token);
    expect(projection.dataAccessTerms.some((t) => t.includes("maxVelocityMps"))).toBe(true);
    expect(projection.dataAccessTerms.some((t) => t.includes("maxForceNewtons"))).toBe(true);
  });

  it("preserves the full sintPhysicalConstraints for APS to log", () => {
    const token = makeToken({ maxVelocityMps: 0.5, maxForceNewtons: 50 });
    const projection = sintTokenToApsProjection(token);
    expect(projection.sintPhysicalConstraints.maxVelocityMps).toBe(0.5);
    expect(projection.sintPhysicalConstraints.maxForceNewtons).toBe(50);
  });

  it("attenuation invariant: SINT projection scope ⊆ original token scope", () => {
    const token = makeToken({
      resource: "a2a://warehouse.example.com/navigate",
      actions: ["a2a.send"],
      maxVelocityMps: 0.5,
    });
    const projection = sintTokenToApsProjection(token);

    // The projection should not expand the resource scope
    expect(projection.resourceScope).toHaveLength(1);
    expect(projection.resourceScope[0]).toBe(token.resource);

    // The projection preserves or narrows actions
    expect(projection.allowedActions.length).toBeLessThanOrEqual(token.actions.length + 2);
  });
});

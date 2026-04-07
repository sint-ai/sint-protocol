/**
 * action_ref identity + explainability conformance.
 *
 * Validates a minimal cross-engine comparison contract:
 * - same request identity tuple => same action_ref
 * - different verdicts are acceptable only with complete explainability context
 * - decision artifact and execution receipt link via action_ref + digest
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  loadActionRefExplainabilityFixture,
  type ActionRefExplainabilityFixture,
} from "./fixture-loader.js";

type IdentityTuple = ActionRefExplainabilityFixture["cases"][number]["identity"]["engineA"];
type DecisionContext = NonNullable<ActionRefExplainabilityFixture["cases"][number]["decisionContext"]>["engineA"];

function computeActionRef(identity: IdentityTuple): string {
  const payload = [
    identity.agentId,
    identity.resource,
    identity.action,
    identity.scope,
    identity.timestamp,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

function isExplainabilityComplete(ctx: DecisionContext): boolean {
  return Boolean(
    ctx.policyProfile &&
    ctx.ruleIds &&
    ctx.ruleIds.length > 0 &&
    ctx.constraintDigest &&
    ctx.decisionTime,
  );
}

describe("ActionRef Identity + Explainability Conformance", () => {
  const fixture = loadActionRefExplainabilityFixture();

  it("fixture profile shape is valid", () => {
    expect(fixture.profile.hashAlgorithm).toBe("sha256");
    expect(fixture.profile.identityTuple).toEqual([
      "agentId",
      "resource",
      "action",
      "scope",
      "timestamp",
    ]);
    expect(fixture.cases.length).toBeGreaterThanOrEqual(3);
  });

  it("enforces action_ref equivalence, explainability comparability, and linkage checks", () => {
    for (const scenario of fixture.cases) {
      const actionRefA = computeActionRef(scenario.identity.engineA);
      const actionRefB = computeActionRef(scenario.identity.engineB);
      const sameActionRef = actionRefA === actionRefB;

      expect(sameActionRef).toBe(scenario.expected.sameActionRef);

      if (scenario.expected.explainabilityComparable !== undefined) {
        const decisionContext = scenario.decisionContext;
        if (!decisionContext) {
          expect(false).toBe(scenario.expected.explainabilityComparable);
          continue;
        }
        const comparable = isExplainabilityComplete(decisionContext.engineA)
          && isExplainabilityComplete(decisionContext.engineB);
        expect(comparable).toBe(scenario.expected.explainabilityComparable);
      }

      if (scenario.expected.linkageValid !== undefined) {
        const linkage = scenario.artifactLinkage;
        if (!linkage) {
          expect(false).toBe(scenario.expected.linkageValid);
          continue;
        }
        const artifactActionRef = linkage.decisionArtifact.actionRef === "__COMPUTED__"
          ? actionRefA
          : linkage.decisionArtifact.actionRef;
        const receiptActionRef = linkage.executionReceipt.actionRef === "__COMPUTED__"
          ? actionRefB
          : linkage.executionReceipt.actionRef;
        const linkageValid = artifactActionRef === receiptActionRef
          && linkage.decisionArtifact.compoundDigest === linkage.executionReceipt.decisionArtifactDigest;
        expect(linkageValid).toBe(scenario.expected.linkageValid);
      }
    }
  });
});

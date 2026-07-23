import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE_PATH = resolve(
  ROOT,
  "packages/conformance-tests/fixtures/mission-authority/reference-gateway-readiness.v1.json",
);

interface ReadinessFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly referencePath: {
    readonly guide: string;
    readonly missionAuthorityDoc: string;
    readonly exampleScript: string;
    readonly exampleReadme: string;
    readonly demoCommand: string;
    readonly conformanceCommand: string;
  };
  readonly requiredGates: readonly Array<{
    readonly id: string;
    readonly status: "implemented";
    readonly evidence: readonly string[];
  }>;
  readonly negativeCases: readonly string[];
  readonly productionReplacements: readonly Array<{
    readonly reference: string;
    readonly production: string;
  }>;
  readonly nonGoals: readonly string[];
}

function readFixture(): ReadinessFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as ReadinessFixture;
}

function readRepoFile(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

function proseIncludesSlug(text: string, slug: string): boolean {
  const normalizedText = text.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const normalizedSlug = slug.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  return normalizedText.includes(normalizedSlug);
}

describe("Mission Authority reference gateway readiness", () => {
  const fixture = readFixture();

  it("declares the public reference path and keeps every referenced file present", () => {
    expect(fixture.fixtureId).toBe("mission-authority-reference-gateway-readiness-v1");
    expect(fixture.schemaVersion).toBe("1.0.0");

    for (const path of [
      fixture.referencePath.guide,
      fixture.referencePath.missionAuthorityDoc,
      fixture.referencePath.exampleScript,
      fixture.referencePath.exampleReadme,
    ]) {
      expect(existsSync(resolve(ROOT, path)), `${path} should exist`).toBe(true);
    }
  });

  it("keeps package scripts aligned with the documented runnable commands", () => {
    const rootPackage = JSON.parse(readRepoFile("package.json")) as {
      scripts: Record<string, string>;
    };
    const conformancePackage = JSON.parse(
      readRepoFile("packages/conformance-tests/package.json"),
    ) as { scripts: Record<string, string> };

    expect(rootPackage.scripts["demo:mission-authority-reference"]).toBe(
      "node ./examples/mission-authority-reference-slice.mjs",
    );
    expect(fixture.referencePath.demoCommand).toBe(
      "pnpm run demo:mission-authority-reference",
    );
    expect(fixture.referencePath.conformanceCommand).toContain(
      "mission-authority-reference-gateway-conformance.test.ts",
    );
    expect(conformancePackage.scripts["test:fixtures"]).toContain(
      "mission-authority-reference-gateway-conformance.test.ts",
    );
  });

  it("requires the full pilot-readiness gate set before the reference path is called ready", () => {
    expect(fixture.requiredGates.map((gate) => gate.id)).toEqual([
      "signed-authority",
      "operator-quorum",
      "gateway-separation",
      "append-only-execution",
      "edge-revalidation",
      "evidence-replay",
      "revocation-drill",
      "public-data-boundary",
    ]);

    for (const gate of fixture.requiredGates) {
      expect(gate.status).toBe("implemented");
      expect(gate.evidence.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps the guide tied to the same gates, commands, and negative drills", () => {
    const guide = readRepoFile(fixture.referencePath.guide);
    const normalizedGuide = guide.toLowerCase();

    expect(guide).toContain(fixture.referencePath.demoCommand);
    expect(guide).toContain(fixture.referencePath.conformanceCommand);
    for (const gate of fixture.requiredGates) {
      expect(proseIncludesSlug(normalizedGuide, gate.id)).toBe(true);
    }
    for (const negativeCase of fixture.negativeCases) {
      expect(proseIncludesSlug(normalizedGuide, negativeCase)).toBe(true);
    }
  });

  it("preserves the public-data boundary and does not present the slice as live hardware", () => {
    expect(fixture.nonGoals).toEqual([
      "no live hardware control",
      "no customer mission data",
      "no controlled technical data",
      "no bypass around PolicyGateway.intercept",
    ]);
    expect(fixture.productionReplacements.length).toBeGreaterThanOrEqual(4);

    const guide = readRepoFile(fixture.referencePath.guide);
    expect(guide).toContain("synthetic");
    expect(guide).toContain("without customer data");
    expect(guide).toContain("does not change: every physical effect still requires both");
  });
});

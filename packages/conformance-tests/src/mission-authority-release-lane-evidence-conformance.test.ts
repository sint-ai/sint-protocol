import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE_PATH = resolve(
  ROOT,
  "packages/conformance-tests/fixtures/mission-authority/release-lane-evidence.v1.json",
);

interface ReleaseLaneEvidence {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly lane: {
    readonly name: string;
    readonly branchPattern: string;
    readonly pullRequest: string;
    readonly targetBase: string;
  };
  readonly requiredCommands: readonly Array<{
    readonly id: string;
    readonly command: string;
    readonly evidence: string;
  }>;
  readonly requiredArtifacts: readonly string[];
  readonly invariants: readonly Array<{
    readonly id: string;
    readonly statement: string;
  }>;
  readonly githubChecks: readonly string[];
  readonly greenDefinition: {
    readonly localCommandsPass: boolean;
    readonly githubChecksPass: boolean;
    readonly draftPrAllowed: boolean;
    readonly untrackedLocalConfigIgnored: string;
  };
}

function fixture(): ReleaseLaneEvidence {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as ReleaseLaneEvidence;
}

function read(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("Mission Authority release-lane evidence", () => {
  const evidence = fixture();

  it("declares the release lane and exact green commands", () => {
    expect(evidence.fixtureId).toBe("mission-authority-release-lane-evidence-v1");
    expect(evidence.schemaVersion).toBe("1.0.0");
    expect(evidence.lane).toEqual({
      name: "mission-authority-reference",
      branchPattern: "feat/*",
      pullRequest: "draft-until-review",
      targetBase: "main",
    });
    expect(evidence.requiredCommands.map((entry) => entry.id)).toEqual([
      "readiness",
      "conformance",
      "docs",
      "workspace-build",
      "workspace-test",
    ]);
  });

  it("keeps command declarations aligned with package scripts and docs", () => {
    const rootPackage = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    const missionDoc = read("docs/mission-authority.md");
    const guide = read("docs/guides/mission-authority-reference-gateway.md");

    for (const entry of evidence.requiredCommands) {
      if (entry.command.startsWith("pnpm run ")) {
        const script = entry.command.replace("pnpm run ", "");
        expect(rootPackage.scripts[script]).toBeDefined();
      }
    }

    expect(missionDoc).toContain("pnpm run mission-authority:readiness");
    expect(guide).toContain("pnpm --filter @pshkv/conformance-tests exec vitest run src/mission-authority-reference-gateway-conformance.test.ts");
  });

  it("requires every named artifact to exist in the public repo", () => {
    for (const artifact of evidence.requiredArtifacts) {
      expect(existsSync(resolve(ROOT, artifact)), `${artifact} should exist`).toBe(true);
    }
  });

  it("pins the security invariants this lane must preserve", () => {
    expect(evidence.invariants.map((entry) => entry.id)).toEqual([
      "gateway-no-bypass",
      "append-only-evidence",
      "attenuation-only",
      "edge-can-only-deny",
      "public-synthetic-data",
    ]);

    for (const invariant of evidence.invariants) {
      expect(invariant.statement.length).toBeGreaterThan(40);
    }
  });

  it("tracks the expected GitHub checks without requiring local config to be committed", () => {
    expect(evidence.githubChecks).toEqual([
      "build-and-test (22)",
      "generate-benchmark-report",
      "guardrails",
    ]);
    expect(evidence.greenDefinition).toEqual({
      localCommandsPass: true,
      githubChecksPass: true,
      draftPrAllowed: true,
      untrackedLocalConfigIgnored: ".codex/",
    });
  });
});

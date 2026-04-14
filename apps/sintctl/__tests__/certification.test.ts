import { describe, expect, it } from "vitest";
import {
  buildCertificationSummary,
  defaultCertificationOutputPath,
} from "../src/certification.js";

describe("certification summary helpers", () => {
  it("builds pass summary when exit code is 0", () => {
    const summary = buildCertificationSummary({
      outputPath: "/tmp/report.json",
      exitCode: 0,
      command: ["pnpm", "--filter", "@pshkv/conformance-tests", "test:fixtures"],
      gatewayUrl: "http://localhost:3100",
    });

    expect(summary.success).toBe(true);
    expect(summary.evidence.status).toBe("passed");
    expect(summary.fixtureTestCommand).toBe(
      "pnpm --filter @sint/conformance-tests test:fixtures",
    );
  });

  it("builds failed summary when exit code is non-zero", () => {
    const summary = buildCertificationSummary({
      outputPath: "/tmp/report.json",
      exitCode: 1,
      command: ["pnpm", "--filter", "@pshkv/conformance-tests", "test:fixtures"],
    });

    expect(summary.success).toBe(false);
    expect(summary.evidence.status).toBe("failed");
    expect(summary.evidence.exitCode).toBe(1);
  });

  it("uses docs report default path", () => {
    const outputPath = defaultCertificationOutputPath("/repo");
    expect(outputPath).toBe(
      "/repo/docs/reports/standalone-conformance-certification.json",
    );
  });
});

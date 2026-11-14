import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("predictive safety operator runbook", () => {
  it("records the shipped worker and client controls and does not authorize execution", () => {
    const runbook = read("docs/guides/predictive-safety-operator-runbook.md");
    const config = read("apps/simulation-server/src/config.ts");
    const server = read("apps/simulation-server/src/server.ts");

    expect(runbook).toContain("Status: operator runbook");
    expect(runbook).toContain("pnpm --filter @pshkv/simulation-server start");
    expect(runbook).toContain("does not authorize execution");
    expect(runbook).toContain("authorizesExecution: false");
    expect(server).toContain("authorizesExecution: false");

    const configPhrases = [
      "SINT_SIM_BEARER_TOKEN is required in production",
      "SINT_SIM_MODEL is required in production",
      "SINT_SIM_SIGNER_PUBLIC_KEY and SINT_SIM_SIGNER_PRIVATE_KEY must be set together",
      "SINT_SIM_SIGNER_PUBLIC_KEY is retired and cannot sign new receipts",
      "SINT_SIM_RETIRED_SIGNER_KEYS entries must be lowercase Ed25519 public keys",
      "SINT_SIM_MAX_SIMULATE_REQUESTS",
      "SINT_SIM_MAX_IN_FLIGHT_REQUESTS",
      "SINT_SIM_TENANT_ID",
      "SINT_SIM_TRUST_DOMAIN",
      "SINT_SIM_RETIRED_SIGNER_KEYS",
    ];
    for (const phrase of configPhrases) {
      expect(runbook, phrase).toContain(phrase);
      expect(config, phrase).toContain(phrase);
    }

    const serverPhrases = [
      "QUEUE_FULL",
      "Simulation request queue is full",
      "QUOTA_EXCEEDED",
      "Simulation request quota is exhausted",
      "TENANT_MISMATCH",
      "Simulation request tenant does not match this worker",
    ];
    for (const phrase of serverPhrases) {
      expect(runbook, phrase).toContain(phrase);
      expect(server, phrase).toContain(phrase);
    }

    expect(runbook).toContain("retryable` is true");
    expect(server).toContain("retryable: true");
    expect(runbook).toContain("retryable` is false");
    expect(server).toContain("retryable: false");
    expect(runbook).toContain("does not reach another region's worker");
    expect(runbook).toContain("does not reach the worker");
    expect(runbook).toContain("docs/specs/predictive-safety-conformance-profile-v1.md");
    expect(runbook).toContain(
      "pnpm --filter @pshkv/conformance-tests exec vitest run src/predictive-safety-shadow-conformance.test.ts",
    );
    expect(runbook).toContain("never authorize or block");
    expect(runbook).toContain("does not add gRPC");
    expect(runbook).toContain("does not add a Gazebo worker");
    expect(runbook).toContain("does not add a GPU or vendor industrial simulator");
    expect(runbook).toContain("does not record a pilot-site canary");
  });
});

/**
 * SINT Industrial Pack conformance.
 *
 * Keeps the Sprint 3 industrial-pack surface honest: machine-readable,
 * adapter-contract scoped, and backed by existing schemas, policies, tests, or
 * explicit planned status.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const MANIFEST_PATH = resolve(REPO_ROOT, "sint-industrial/manifest.v1.json");

type IndustrialPackManifest = {
  readonly packId: string;
  readonly schemaVersion: string;
  readonly status: "preview" | "stable";
  readonly scopeNote: string;
  readonly root: string;
  readonly invariants: readonly string[];
  readonly paths: Record<string, string>;
  readonly schemas: readonly Array<{
    readonly id: string;
    readonly packPath: string;
    readonly sourcePath: string;
    readonly object: string;
  }>;
  readonly policies: readonly Array<{
    readonly id: string;
    readonly packPath: string;
    readonly sourcePath: string;
    readonly requires: readonly string[];
  }>;
  readonly settlementProfiles: readonly Array<{
    readonly id: string;
    readonly status: "active-profile" | "planned";
    readonly schemaPath: string;
    readonly samplePath: string;
    readonly triggerEvent: string;
    readonly settlementEvent: string;
    readonly requiredEvidence: readonly string[];
    readonly shareTotalBps: number;
    readonly paymentMethods: readonly string[];
    readonly claimsExecutionAuthority: boolean;
  }>;
  readonly adapters: readonly Array<{
    readonly id: string;
    readonly path: string;
    readonly status:
      | "active-profile"
      | "active-export-stub"
      | "planned";
    readonly protocol: string;
    readonly policyResource: string;
    readonly actionSurface: string;
    readonly implementationRefs: readonly string[];
    readonly requiredEvidence: readonly string[];
    readonly defaultTier: string;
    readonly claimsLiveControl: boolean;
  }>;
  readonly simulators: readonly Array<{
    readonly id: string;
    readonly path: string;
    readonly status: "active-receipt-stub" | "planned";
    readonly receiptObject: string;
    readonly implementationRefs: readonly string[];
    readonly requiredOutputs: readonly string[];
    readonly claimsLiveControl: boolean;
  }>;
  readonly examples: readonly Array<{
    readonly id: string;
    readonly path: string;
    readonly status: "active-fixture-backed" | "planned";
    readonly sourceFixture: string | null;
    readonly requiredAdapters: readonly string[];
    readonly requiredSimulator: string;
  }>;
  readonly acceptanceCriteria: {
    readonly minimumActiveExecutionPaths: number;
    readonly requiredActiveProtocols: readonly string[];
    readonly allActivePathsRequireSimulationReceipt: boolean;
    readonly allActivePathsRequireHumanApproval: boolean;
    readonly allActivePathsRequireReceiptChain: boolean;
    readonly settlementRequiresExecutionReceipt: boolean;
    readonly allPlannedPathsClaimNoLiveControl: boolean;
  };
};

type FactorySettlementSample = {
  readonly settlement_id: string;
  readonly workcell_id: string;
  readonly trigger: {
    readonly on_event: string;
    readonly require_receipt_chain: boolean;
  };
  readonly contributors: readonly Array<{
    readonly type: string;
    readonly id: string;
    readonly role?: string;
    readonly share_bps: number;
    readonly evidence_ref?: string;
  }>;
  readonly payment: {
    readonly method: string;
    readonly network: string;
    readonly currency: string;
    readonly max_amount?: number;
    readonly escrow_required: boolean;
  };
  readonly evidence: {
    readonly receipt_chain_required: boolean;
    readonly execution_receipt_event: string;
    readonly settlement_event: string;
    readonly ledger_digest?: string;
  };
};

function loadManifest(): IndustrialPackManifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as IndustrialPackManifest;
}

function repoPath(path: string): string {
  return resolve(REPO_ROOT, path);
}

function hasReadme(path: string): boolean {
  return existsSync(resolve(repoPath(path), "README.md"));
}

function isActiveAdapter(
  adapter: IndustrialPackManifest["adapters"][number],
): boolean {
  return adapter.status !== "planned";
}

describe("SINT Industrial Pack manifest v1", () => {
  const manifest = loadManifest();

  it("packages Sprint 3 under a real sint-industrial root", () => {
    expect(manifest.packId).toBe("sint-industrial-pack-v1");
    expect(manifest.schemaVersion).toBe("1.0.0");
    expect(manifest.status).toBe("preview");
    expect(manifest.root).toBe("sint-industrial");
    expect(manifest.scopeNote).toContain("does not claim live certified");

    for (const path of Object.values(manifest.paths)) {
      expect(path.startsWith("sint-industrial/")).toBe(true);
      expect(existsSync(repoPath(path))).toBe(true);
    }

    expect(manifest.invariants).toEqual(
      expect.arrayContaining([
        "all_authorization_flows_through_policy_gateway",
        "adapters_translate_but_do_not_authorize",
        "simulation_receipt_required_for_physical_execution",
        "human_approval_required_for_T2_T3_execution",
      ]),
    );
  });

  it("points schemas and policies at files that exist", () => {
    expect(manifest.schemas.map((schema) => schema.object)).toEqual(
      expect.arrayContaining([
        "FactoryIntent",
        "CellGraph",
        "RobotActionProfile",
        "SimulationReceipt",
        "FactorySettlement",
      ]),
    );

    for (const schema of manifest.schemas) {
      expect(existsSync(repoPath(schema.packPath))).toBe(true);
      expect(existsSync(repoPath(schema.sourcePath))).toBe(true);
    }

    for (const policy of manifest.policies) {
      expect(existsSync(repoPath(policy.packPath))).toBe(true);
      expect(existsSync(repoPath(policy.sourcePath))).toBe(true);
      expect(policy.requires).toEqual(
        expect.arrayContaining([
          "simulation_receipt",
          "human_approval",
          "receipt_chain",
        ]),
      );
    }
  });

  it("defines settlement as receipt-backed attribution, not execution authority", () => {
    const settlementProfile = manifest.settlementProfiles.find(
      (profile) => profile.id === "factory-settlement",
    );
    expect(settlementProfile).toBeDefined();
    expect(settlementProfile?.status).toBe("active-profile");
    expect(settlementProfile?.triggerEvent).toBe("factory.execution.receipt");
    expect(settlementProfile?.settlementEvent).toBe("factory.settlement.recorded");
    expect(settlementProfile?.claimsExecutionAuthority).toBe(false);
    expect(settlementProfile?.requiredEvidence).toEqual(
      expect.arrayContaining([
        "simulationReceipt",
        "humanApproval",
        "factoryReceiptChain",
        "executionReceipt",
      ]),
    );
    expect(existsSync(repoPath(settlementProfile?.schemaPath ?? ""))).toBe(true);
    expect(existsSync(repoPath(settlementProfile?.samplePath ?? ""))).toBe(true);

    const sample = JSON.parse(
      readFileSync(repoPath(settlementProfile?.samplePath ?? ""), "utf8"),
    ) as FactorySettlementSample;
    const totalBps = sample.contributors.reduce(
      (total, contributor) => total + contributor.share_bps,
      0,
    );

    expect(sample.settlement_id).toMatch(/^fs_/);
    expect(sample.workcell_id).toBe("packaging_cell_001");
    expect(sample.trigger).toEqual({
      on_event: "factory.execution.receipt",
      require_receipt_chain: true,
    });
    expect(totalBps).toBe(settlementProfile?.shareTotalBps);
    expect(sample.evidence.receipt_chain_required).toBe(true);
    expect(sample.evidence.execution_receipt_event).toBe("factory.execution.receipt");
    expect(sample.evidence.settlement_event).toBe("factory.settlement.recorded");
    expect(settlementProfile?.paymentMethods).toContain(sample.payment.method);
    expect(sample.payment.escrow_required).toBe(true);
  });

  it("expresses at least three shared industrial execution paths", () => {
    const activeAdapters = manifest.adapters.filter(isActiveAdapter);
    const activeProtocols = new Set(activeAdapters.map((adapter) => adapter.protocol));

    for (const adapter of manifest.adapters) {
      expect(existsSync(repoPath(adapter.path))).toBe(true);
      expect(hasReadme(adapter.path)).toBe(true);
    }

    expect(activeAdapters.length).toBeGreaterThanOrEqual(
      manifest.acceptanceCriteria.minimumActiveExecutionPaths,
    );
    for (const protocol of manifest.acceptanceCriteria.requiredActiveProtocols) {
      expect(activeProtocols.has(protocol)).toBe(true);
    }

    for (const adapter of activeAdapters) {
      expect(adapter.policyResource.length).toBeGreaterThan(0);
      expect(adapter.actionSurface.length).toBeGreaterThan(0);
      expect(adapter.requiredEvidence).toEqual(
        expect.arrayContaining([
          "simulationReceipt",
          "humanApproval",
          "factoryReceiptChain",
        ]),
      );
      expect(["T2_act", "T3_commit"]).toContain(adapter.defaultTier);
      expect(adapter.claimsLiveControl).toBe(false);

      for (const implementationRef of adapter.implementationRefs) {
        expect(existsSync(repoPath(implementationRef))).toBe(true);
      }
    }
  });

  it("keeps planned vendor paths scoped as non-live adapter contracts", () => {
    const plannedAdapters = manifest.adapters.filter(
      (adapter) => adapter.status === "planned",
    );
    expect(plannedAdapters.length).toBeGreaterThan(0);

    for (const adapter of plannedAdapters) {
      expect(hasReadme(adapter.path)).toBe(true);
      expect(adapter.claimsLiveControl).toBe(false);
      expect(adapter.requiredEvidence).toEqual(
        expect.arrayContaining([
          "simulationReceipt",
          "humanApproval",
          "factoryReceiptChain",
        ]),
      );
    }
  });

  it("keeps simulator and example profiles receipt-backed", () => {
    for (const simulator of manifest.simulators) {
      expect(existsSync(repoPath(simulator.path))).toBe(true);
      expect(hasReadme(simulator.path)).toBe(true);
      expect(simulator.claimsLiveControl).toBe(false);
      if (simulator.status === "active-receipt-stub") {
        expect(simulator.implementationRefs.length).toBeGreaterThan(0);
        for (const implementationRef of simulator.implementationRefs) {
          expect(existsSync(repoPath(implementationRef))).toBe(true);
        }
      }
    }

    for (const example of manifest.examples) {
      expect(existsSync(repoPath(example.path))).toBe(true);
      expect(hasReadme(example.path)).toBe(true);
    }

    const isaacSim = manifest.simulators.find(
      (simulator) => simulator.id === "isaac-sim",
    );
    const roboDk = manifest.simulators.find(
      (simulator) => simulator.id === "robodk",
    );
    const robotStudio = manifest.simulators.find(
      (simulator) => simulator.id === "robotstudio",
    );
    const roboGuide = manifest.simulators.find(
      (simulator) => simulator.id === "roboguide",
    );
    const kukaSim = manifest.simulators.find(
      (simulator) => simulator.id === "kuka-sim",
    );
    expect(isaacSim?.status).toBe("active-receipt-stub");
    expect(isaacSim?.receiptObject).toBe("SimulationReceipt");
    expect(roboDk?.status).toBe("active-receipt-stub");
    expect(roboDk?.receiptObject).toBe("SimulationReceipt");
    expect(robotStudio?.status).toBe("active-receipt-stub");
    expect(robotStudio?.receiptObject).toBe("SimulationReceipt");
    expect(roboGuide?.status).toBe("active-receipt-stub");
    expect(roboGuide?.receiptObject).toBe("SimulationReceipt");
    expect(kukaSim?.status).toBe("active-receipt-stub");
    expect(kukaSim?.receiptObject).toBe("SimulationReceipt");
    expect(isaacSim?.requiredOutputs).toEqual(
      expect.arrayContaining([
        "vendorProgramHash",
        "collisionFree",
        "decisionDigest",
      ]),
    );

    const activeExample = manifest.examples.find(
      (example) => example.status === "active-fixture-backed",
    );
    expect(activeExample?.id).toBe("pick-place-cell");
    expect(activeExample?.sourceFixture).toBe(
      "packages/conformance-tests/fixtures/industrial/factory-action-demo.v1.json",
    );
    expect(activeExample?.requiredAdapters).toEqual(
      expect.arrayContaining(["ros2", "srci", "abb-rapid", "fanuc-ls"]),
    );
    expect(existsSync(repoPath(activeExample?.sourceFixture ?? ""))).toBe(true);
  });
});

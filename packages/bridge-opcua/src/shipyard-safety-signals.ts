import { ApprovalTier } from "@pshkv/core";
import { opcUaNodeToResourceUri } from "./opcua-resource-mapper.js";

export type ShipyardSafetySignal =
  | "hotWorkPermit"
  | "fireWatchReady"
  | "fumeExtractionOnline"
  | "gasAtmosphereSafe"
  | "weldCellInterlockClosed"
  | "estopClear";

export interface ShipyardSafetySignalRef {
  readonly signal: ShipyardSafetySignal;
  readonly nodeId: string;
  readonly resource: string;
  readonly action: "read" | "subscribe";
  readonly expectedFreshnessMs: number;
  readonly defaultTier: ApprovalTier;
  readonly requiredFor: readonly string[];
}

export interface ShipyardSafetySignalOptions {
  readonly endpoint?: string;
  readonly action?: "read" | "subscribe";
  readonly expectedFreshnessMs?: number;
}

export interface ShipyardSafetySnapshotValue extends ShipyardSafetySignalRef {
  readonly observedAt: string;
  readonly value: boolean | number | string | null;
}

export interface ShipyardSafetySnapshotOptions extends ShipyardSafetySignalOptions {
  readonly observedAt?: string;
  readonly values: Partial<Record<ShipyardSafetySignal, boolean | number | string | null>>;
}

const DEFAULT_SHIPYARD_SAFETY_ENDPOINT = "opc.tcp://safety-plc.shipyard.local";

const SHIPYARD_SIGNAL_NODES: Record<ShipyardSafetySignal, {
  readonly nodeId: string;
  readonly requiredFor: readonly string[];
}> = {
  hotWorkPermit: {
    nodeId: "ns=2;s=HotWork/Permit",
    requiredFor: ["arc_weld_start", "grinder_start"],
  },
  fireWatchReady: {
    nodeId: "ns=2;s=FireWatch/Ready",
    requiredFor: ["arc_weld_start", "grinder_start"],
  },
  fumeExtractionOnline: {
    nodeId: "ns=2;s=FumeExtraction/Status",
    requiredFor: ["arc_weld_start", "grinder_start", "confined_space_entry"],
  },
  gasAtmosphereSafe: {
    nodeId: "ns=2;s=GasMonitor/O2",
    requiredFor: ["arc_weld_start", "confined_space_entry"],
  },
  weldCellInterlockClosed: {
    nodeId: "ns=2;s=Interlock/WeldCellClosed",
    requiredFor: ["arc_weld_start", "material_lift"],
  },
  estopClear: {
    nodeId: "ns=2;s=Safety/EStop",
    requiredFor: ["arc_weld_start", "confined_space_entry", "material_lift"],
  },
};

export function shipyardSafetySignalToOpcUaRef(
  signal: ShipyardSafetySignal,
  options: ShipyardSafetySignalOptions = {},
): ShipyardSafetySignalRef {
  const definition = SHIPYARD_SIGNAL_NODES[signal];
  const action = options.action ?? "subscribe";

  return {
    signal,
    nodeId: definition.nodeId,
    resource: opcUaNodeToResourceUri(
      definition.nodeId,
      options.endpoint ?? DEFAULT_SHIPYARD_SAFETY_ENDPOINT,
    ),
    action,
    expectedFreshnessMs: options.expectedFreshnessMs ?? 2500,
    defaultTier: ApprovalTier.T0_OBSERVE,
    requiredFor: definition.requiredFor,
  };
}

export function buildShipyardSafetySignalSet(
  options: ShipyardSafetySignalOptions = {},
): readonly ShipyardSafetySignalRef[] {
  return (Object.keys(SHIPYARD_SIGNAL_NODES) as ShipyardSafetySignal[]).map(
    (signal) => shipyardSafetySignalToOpcUaRef(signal, options),
  );
}

export function buildShipyardSafetySnapshot(
  options: ShipyardSafetySnapshotOptions,
): readonly ShipyardSafetySnapshotValue[] {
  const observedAt = options.observedAt ?? new Date().toISOString();
  return buildShipyardSafetySignalSet(options).map((signal) => ({
    ...signal,
    observedAt,
    value: options.values[signal.signal] ?? null,
  }));
}

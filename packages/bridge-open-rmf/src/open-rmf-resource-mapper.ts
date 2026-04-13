import { ApprovalTier, type BridgeProfile } from "@pshkv/core";

export type RmfOperation =
  | "fleet.status"
  | "robot.status"
  | "task.dispatch"
  | "task.cancel"
  | "traffic.reserve"
  | "door.command"
  | "lift.command"
  | "emergency.stop"
  | "emergency.release";

function encode(value: string): string {
  return encodeURIComponent(value.trim());
}

/** Canonical URI for a fleet in Open-RMF. */
export function rmfFleetResourceUri(fleetName: string): string {
  return `open-rmf://fleet/${encode(fleetName)}`;
}

/** Canonical URI for an individual robot in a fleet. */
export function rmfRobotResourceUri(fleetName: string, robotName: string): string {
  return `${rmfFleetResourceUri(fleetName)}/robot/${encode(robotName)}`;
}

/** Canonical URI for task dispatch ingress. */
export function rmfDispatchResourceUri(fleetName: string): string {
  return `${rmfFleetResourceUri(fleetName)}/dispatch`;
}

/** Canonical URI for facility workflow endpoints (doors/lifts/zones). */
export function rmfFacilityResourceUri(
  siteId: string,
  kind: "door" | "lift" | "zone",
  id: string,
): string {
  return `open-rmf://site/${encode(siteId)}/${kind}/${encode(id)}`;
}

/** Map RMF operation to SINT action semantics. */
export function rmfOperationToAction(
  operation: RmfOperation,
): "observe" | "prepare" | "call" | "override" {
  switch (operation) {
    case "fleet.status":
    case "robot.status":
      return "observe";
    case "traffic.reserve":
      return "prepare";
    case "task.dispatch":
    case "task.cancel":
    case "door.command":
    case "lift.command":
      return "call";
    case "emergency.stop":
    case "emergency.release":
      return "override";
  }
}

/** Default approval tier for Open-RMF operations. */
export function defaultTierForRmfOperation(operation: RmfOperation): ApprovalTier {
  switch (operation) {
    case "fleet.status":
    case "robot.status":
      return ApprovalTier.T0_OBSERVE;
    case "traffic.reserve":
      return ApprovalTier.T1_PREPARE;
    case "task.dispatch":
    case "task.cancel":
    case "door.command":
    case "lift.command":
      return ApprovalTier.T2_ACT;
    case "emergency.stop":
    case "emergency.release":
      return ApprovalTier.T3_COMMIT;
  }
}

/** Bridge profile for Open-RMF dispatch/facility interoperability. */
export const OPEN_RMF_BRIDGE_PROFILE: BridgeProfile = {
  bridgeId: "open-rmf",
  protocol: "open-rmf",
  version: "2.x",
  resourcePattern: "open-rmf://*/**",
  defaultTierByAction: {
    observe: ApprovalTier.T0_OBSERVE,
    prepare: ApprovalTier.T1_PREPARE,
    call: ApprovalTier.T2_ACT,
    override: ApprovalTier.T3_COMMIT,
  },
  notes: "Fleet dispatch and facility workflow profile for warehouse/industrial deployments.",
};

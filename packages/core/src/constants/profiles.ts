/**
 * SINT Protocol — Public deployment and bridge profiles.
 *
 * @module @sint/core/constants/profiles
 */

import { ApprovalTier } from "../types/policy.js";
import type { BridgeProfile, SiteProfile } from "../types/protocol.js";

/** Current version of the public SINT protocol surface. */
export const SINT_PROTOCOL_VERSION = "0.2.0" as const;

/** Protocol boundary statement used in discovery and docs. */
export const SINT_PROTOCOL_BOUNDARY =
  "SINT is the governance and runtime enforcement layer for digital-to-physical execution.";

/** Canonical bridge profiles exposed by discovery and schema endpoints. */
export const SINT_BRIDGE_PROFILES: readonly BridgeProfile[] = [
  {
    bridgeId: "mcp",
    protocol: "mcp",
    version: "1.x",
    resourcePattern: "mcp://*/**",
    defaultTierByAction: {
      call: ApprovalTier.T1_PREPARE,
    },
    notes: "Agent-to-tool ingress with tool-level policy enforcement.",
  },
  {
    bridgeId: "a2a",
    protocol: "a2a",
    version: "0.x",
    resourcePattern: "a2a://*/**",
    defaultTierByAction: {
      send: ApprovalTier.T1_PREPARE,
      execute: ApprovalTier.T2_ACT,
    },
    notes: "Agent-to-agent delegation ingress.",
  },
  {
    bridgeId: "ros2",
    protocol: "ros2",
    version: "jazzy+",
    resourcePattern: "ros2:///**",
    defaultTierByAction: {
      subscribe: ApprovalTier.T0_OBSERVE,
      publish: ApprovalTier.T2_ACT,
      call: ApprovalTier.T2_ACT,
    },
    notes: "Robot runtime ingress for AMR and industrial cells.",
  },
  {
    bridgeId: "grpc",
    protocol: "grpc",
    version: "grpc-v1",
    resourcePattern: "grpc://*/**",
    defaultTierByAction: {
      observe: ApprovalTier.T0_OBSERVE,
      call: ApprovalTier.T2_ACT,
      write: ApprovalTier.T2_ACT,
    },
    notes: "Generic service ingress for unary/stream RPC governance.",
  },
  {
    bridgeId: "mavlink",
    protocol: "mavlink",
    version: "v2",
    resourcePattern: "mavlink://*/**",
    defaultTierByAction: {
      call: ApprovalTier.T2_ACT,
      publish: ApprovalTier.T2_ACT,
    },
    notes: "UAV ingress maintained as proof of generality.",
  },
  {
    bridgeId: "mqtt-sparkplug",
    protocol: "mqtt",
    version: "sparkplug-b-v3",
    resourcePattern: "mqtt-sparkplug:///**",
    defaultTierByAction: {
      observe: ApprovalTier.T0_OBSERVE,
      publish: ApprovalTier.T1_PREPARE,
      call: ApprovalTier.T2_ACT,
    },
    notes: "Industrial IoT ingress for edge and factory telemetry/command channels.",
  },
  {
    bridgeId: "opcua",
    protocol: "opcua",
    version: "1.05+",
    resourcePattern: "opcua://*/**",
    defaultTierByAction: {
      observe: ApprovalTier.T0_OBSERVE,
      read: ApprovalTier.T0_OBSERVE,
      write: ApprovalTier.T2_ACT,
      call: ApprovalTier.T2_ACT,
    },
    notes: "OT and PLC interoperability bridge profile.",
  },
  {
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
    notes: "Facility/fleet orchestration profile for multi-vendor robot operations.",
  },
  {
    bridgeId: "homeassistant",
    protocol: "ha-mcp",
    version: "2024.11+",
    resourcePattern: "ha://*/**",
    defaultTierByAction: {
      observe: ApprovalTier.T0_OBSERVE,
      prepare: ApprovalTier.T1_PREPARE,
      act: ApprovalTier.T2_ACT,
      commit: ApprovalTier.T3_COMMIT,
    },
    notes: "Consumer smart home ingress via Home Assistant MCP Server. Phase 1 physical AI governance.",
  },
] as const;

/** First-class site profiles for 2026 industrial wedge deployments. */
export const SINT_SITE_PROFILES: readonly SiteProfile[] = [
  {
    siteId: "warehouse-amr",
    deploymentProfile: "warehouse-amr",
    bridges: ["mcp", "a2a", "ros2", "grpc", "mqtt-sparkplug", "open-rmf"],
    defaultEscalationTheta: 0.15,
    notes: "Human-shared warehouse environment with AMR fleets.",
  },
  {
    siteId: "industrial-cell",
    deploymentProfile: "industrial-cell",
    bridges: ["mcp", "a2a", "ros2", "grpc", "opcua", "mqtt-sparkplug"],
    defaultEscalationTheta: 0.2,
    notes: "Safety-fenced manipulator cell with PLC interlock dependencies.",
  },
  {
    siteId: "edge-gateway",
    deploymentProfile: "edge-gateway",
    bridges: ["grpc", "mqtt-sparkplug", "opcua", "open-rmf"],
    defaultEscalationTheta: 0.25,
    notes: "Local T0/T1 verification profile with central T2/T3 escalation.",
  },
  {
    siteId: "home-safe",
    deploymentProfile: "home-safe",
    bridges: ["homeassistant", "mcp", "a2a"],
    defaultEscalationTheta: 0.15,
    notes: "Consumer smart home with family occupancy awareness. Phase 1 consumer deployment profile.",
  },
] as const;

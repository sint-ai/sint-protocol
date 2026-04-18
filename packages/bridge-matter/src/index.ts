/**
 * @pshkv/bridge-matter — SINT Bridge for Matter Protocol
 *
 * Governs AI agent access to Matter-certified smart home devices.
 * Implements Phase 2 of Physical AI Governance Roadmap.
 *
 * @packageDocumentation
 */

export {
  MatterInterceptor,
  createMatterCapabilityToken,
  type MatterInterceptorConfig,
  type MatterOperationResult,
} from "./matter-interceptor.js";

export {
  mapMatterToSint,
  parseMatterUri,
  getClusterName,
  isPhysicalActuatorCluster,
  isReadOnlyCluster,
  getSafetyTopics,
  MatterClusterId,
  MATTER_CLUSTER_TIER_DEFAULTS,
  MATTER_COMMAND_TIER_OVERRIDES,
  type MatterAccessContext,
  type MatterCommandType,
  type MatterResourceMapping,
} from "./cluster-mapper.js";

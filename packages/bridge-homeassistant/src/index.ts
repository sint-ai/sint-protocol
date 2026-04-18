/**
 * @pshkv/bridge-homeassistant — SINT Bridge for Home Assistant
 *
 * Governs AI agent access to consumer smart home devices via Home Assistant MCP.
 * Implements Phase 1 consumer smart home governance from Physical AI Governance
 * Roadmap 2026-2029.
 *
 * @packageDocumentation
 */

export {
  HAInterceptor,
  createHACapabilityToken,
  type HAInterceptorConfig,
  type MCPToolCall,
  type MCPToolResult,
} from "./ha-interceptor.js";

export {
  parseEntityId,
  mapServiceCallToSint,
  extractEntityIdFromMCP,
  extractServiceFromMCP,
  isSafetyCritical,
  type HAEntity,
  type HAServiceCall,
  type SintResourceMapping,
} from "./resource-mapper.js";

export {
  CONSUMER_DEVICE_PROFILES,
  getProfileForDomain,
  getTierForService,
  isHumanAware,
  type ConsumerDeviceClass,
  type ConsumerDeviceProfile,
} from "./consumer-profiles.js";

/**
 * @sint/bridge-a2a — SINT security bridge for the Google A2A Protocol.
 *
 * Makes SINT the security layer for agent-to-agent task delegation.
 * Every A2A `tasks/send` call flows through the PolicyGateway before
 * being forwarded to the target agent.
 *
 * @example
 * ```ts
 * import { A2AInterceptor, AgentCardRegistry } from "@sint-ai/bridge-a2a";
 *
 * const registry = new AgentCardRegistry();
 * registry.register(await fetchAgentCard("https://agents.example.com/fleet-manager"));
 *
 * const interceptor = new A2AInterceptor(gateway, agentId, tokenId, {
 *   agentCard: registry.get("https://agents.example.com/fleet-manager")!,
 * });
 *
 * const result = await interceptor.interceptSend(params);
 * if (result.action === "forward") {
 *   // PolicyGateway approved — safe to call downstream agent
 * }
 * ```
 */

// Types
export type {
  A2AAgentCard,
  A2ASkill,
  A2AAuthScheme,
  A2ATask,
  A2ATaskStatus,
  A2AMessage,
  A2APart,
  A2ATextPart,
  A2AFilePart,
  A2ADataPart,
  A2AArtifact,
  A2AJsonRpcRequest,
  A2AJsonRpcResponse,
  A2AJsonRpcSuccess,
  A2AJsonRpcError,
  A2AMethod,
  A2ASendTaskParams,
  A2AInterceptResult,
  A2AInterceptorConfig,
  A2ATaskId,
} from "./types.js";
export { A2A_ERROR_CODES } from "./types.js";

// Resource mapper
export {
  buildResourceUri,
  resolveSkill,
  extractA2APhysicalContext,
  mapMethodToAction,
  A2A_ACTIONS,
} from "./a2a-resource-mapper.js";
export type { A2AAction } from "./a2a-resource-mapper.js";

// Core interceptor
export {
  A2AInterceptor,
  buildDenyResponse,
  buildEscalationResponse,
} from "./a2a-interceptor.js";

// Agent Card registry
export {
  AgentCardRegistry,
  fetchAgentCard,
} from "./agent-card-registry.js";

// APS ↔ SINT interoperability mapping
export { apsScopeToSintMapping, sintTokenToApsProjection } from "./aps-mapping.js";
export type { ApsDelegationScope, ApsMappingResult } from "./aps-mapping.js";

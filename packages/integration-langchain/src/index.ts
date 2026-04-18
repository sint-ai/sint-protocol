/**
 * @sint/integration-langchain — SINT Protocol governance for LangChain.
 *
 * Provides a callback handler and tool wrapper that enforce
 * capability tokens on every LangChain tool invocation.
 *
 * Usage (LangChain JS/TS):
 *
 *   import { SintGovernanceHandler } from "@pshkv/integration-langchain";
 *
 *   const handler = new SintGovernanceHandler({
 *     gatewayUrl: "http://localhost:4100",
 *     agentId: "my-agent",
 *     token: capabilityToken,
 *   });
 *
 *   const agent = createReactAgent({ llm, tools, callbacks: [handler] });
 *
 * Every tool call will be intercepted by SINT's Policy Gateway.
 * Denied actions throw SintDeniedError with the denial reason.
 *
 * @module @sint/integration-langchain
 */

export { SintGovernanceHandler } from "./handler.js";
export { sintGovernedTool, wrapToolsWithGovernance } from "./tool-wrapper.js";
export { SintDeniedError } from "./errors.js";
export type {
  SintGovernanceConfig,
  SintInterceptResult,
  SintToolCallContext,
} from "./types.js";

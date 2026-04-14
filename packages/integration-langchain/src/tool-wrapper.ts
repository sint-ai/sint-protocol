/**
 * Tool wrapper utilities for SINT governance.
 *
 * Wraps individual LangChain tools or entire tool arrays
 * with SINT Policy Gateway enforcement.
 */

import type { SintGovernanceConfig, SintInterceptResult } from "./types.js";
import { intercept } from "./gateway-client.js";
import { SintDeniedError } from "./errors.js";

/**
 * Generic tool interface (compatible with LangChain StructuredTool).
 * We use a minimal interface to avoid LangChain as a dependency.
 */
interface ToolLike {
  name: string;
  description: string;
  invoke(input: unknown, config?: unknown): Promise<unknown>;
}

/**
 * Wrap a single tool with SINT governance.
 *
 * Returns a proxy that intercepts `invoke()` calls and validates
 * against the Policy Gateway before execution.
 *
 * @example
 * ```typescript
 * import { sintGovernedTool } from "@pshkv/integration-langchain";
 *
 * const governedSearch = sintGovernedTool(searchTool, {
 *   gatewayUrl: "http://localhost:4100",
 *   agentId: "my-agent",
 * });
 * ```
 */
export function sintGovernedTool<T extends ToolLike>(
  tool: T,
  config: SintGovernanceConfig
): T {
  const resourceMapper =
    config.resourceMapper ?? ((name: string) => `tool:${name}`);
  const actionMapper =
    config.actionMapper ?? ((_name: string) => "execute");

  return new Proxy(tool, {
    get(target, prop, receiver) {
      if (prop === "invoke") {
        return async function governedInvoke(
          input: unknown,
          invokeConfig?: unknown
        ): Promise<unknown> {
          const resource = resourceMapper(target.name);
          const action = actionMapper(target.name);

          const result: SintInterceptResult = await intercept(config, {
            agentId: config.agentId,
            resource,
            action,
            context: {
              toolName: target.name,
              toolInput:
                typeof input === "string" ? input : JSON.stringify(input),
              source: "langchain-tool-wrapper",
            },
          });

          if (!result.approved) {
            if (config.throwOnDeny !== false) {
              throw new SintDeniedError({
                toolName: target.name,
                resource,
                reason: result.reason ?? "Denied by SINT Policy Gateway",
                tier: result.tier,
              });
            }
            return `[SINT DENIED] ${result.reason ?? "Action denied by policy"}`;
          }

          return target.invoke(input, invokeConfig);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Wrap an array of tools with SINT governance.
 *
 * @example
 * ```typescript
 * import { wrapToolsWithGovernance } from "@pshkv/integration-langchain";
 *
 * const governedTools = wrapToolsWithGovernance(tools, {
 *   gatewayUrl: "http://localhost:4100",
 *   agentId: "my-agent",
 * });
 *
 * const agent = createReactAgent({ llm, tools: governedTools });
 * ```
 */
export function wrapToolsWithGovernance<T extends ToolLike>(
  tools: T[],
  config: SintGovernanceConfig
): T[] {
  return tools.map((tool) => sintGovernedTool(tool, config));
}

/**
 * SINT Protocol — HTTP Pricing Adapter.
 *
 * Implements IPricingPort by calling the product API's MCP marketplace:
 * - GET /mcps/:id/pricing → getPrice
 *
 * @module @sint/bridge-economy/adapters/http-pricing-adapter
 */

import { ok, type Result } from "@sint-ai/core";
import type { IPricingPort, PricingContext, PricingInfo } from "../interfaces.js";
import { HttpClient, type HttpClientConfig } from "./http-client.js";
import { BASE_TOOL_CALL_COST, GLOBAL_MARKUP_MULTIPLIER } from "../pricing-calculator.js";

/**
 * HTTP adapter for the product API's MCP marketplace pricing.
 *
 * @example
 * ```ts
 * const adapter = new HttpPricingAdapter({
 *   baseUrl: "https://api.sint.gg",
 *   authToken: keycloakToken,
 * });
 * const result = await adapter.getPrice({ actionType: "call", resource: "my-mcp" });
 * ```
 */
export class HttpPricingAdapter implements IPricingPort {
  private readonly client: HttpClient;

  constructor(config: HttpClientConfig) {
    this.client = new HttpClient(config);
  }

  async getPrice(context: PricingContext): Promise<Result<PricingInfo, Error>> {
    // If no MCP server ID, return default pricing
    if (!context.mcpServerId) {
      return ok({
        baseCost: BASE_TOOL_CALL_COST,
        costMultiplier: 1.0,
        globalMarkup: GLOBAL_MARKUP_MULTIPLIER,
        totalCost: Math.ceil(BASE_TOOL_CALL_COST * 1.0 * GLOBAL_MARKUP_MULTIPLIER),
      });
    }

    const result = await this.client.get<{ costMultiplier: number }>(
      `/mcps/${encodeURIComponent(context.mcpServerId)}/pricing`,
    );

    if (!result.ok) {
      // Fail-open: return default pricing on error
      return ok({
        baseCost: BASE_TOOL_CALL_COST,
        costMultiplier: 1.0,
        globalMarkup: GLOBAL_MARKUP_MULTIPLIER,
        totalCost: Math.ceil(BASE_TOOL_CALL_COST * 1.0 * GLOBAL_MARKUP_MULTIPLIER),
      });
    }

    const costMultiplier = result.value.costMultiplier;
    return ok({
      baseCost: BASE_TOOL_CALL_COST,
      costMultiplier,
      globalMarkup: GLOBAL_MARKUP_MULTIPLIER,
      totalCost: Math.ceil(BASE_TOOL_CALL_COST * costMultiplier * GLOBAL_MARKUP_MULTIPLIER),
    });
  }
}

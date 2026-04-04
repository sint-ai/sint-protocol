/**
 * SINT Protocol — In-Memory Pricing Adapter.
 *
 * Testing implementation of IPricingPort with configurable
 * per-resource cost multipliers.
 *
 * @module @sint/bridge-economy/adapters/in-memory-pricing-adapter
 */

import { ok, type Result } from "@sint/core";
import type { IPricingPort, PricingContext, PricingInfo } from "../interfaces.js";
import { GLOBAL_MARKUP_MULTIPLIER, BASE_TOOL_CALL_COST } from "../pricing-calculator.js";

/**
 * In-memory pricing adapter for testing.
 *
 * @example
 * ```ts
 * const adapter = new InMemoryPricingAdapter();
 * adapter.setCostMultiplier("premium-tool", 2.0);
 * const result = await adapter.getPrice({ actionType: "call", resource: "premium-tool" });
 * // result.value.costMultiplier === 2.0, totalCost = ceil(6 × 2.0 × 1.5) = 18
 * ```
 */
export class InMemoryPricingAdapter implements IPricingPort {
  private readonly multipliers = new Map<string, number>();
  private readonly defaultMultiplier: number;

  constructor(defaultMultiplier = 1.0) {
    this.defaultMultiplier = defaultMultiplier;
  }

  async getPrice(context: PricingContext): Promise<Result<PricingInfo, Error>> {
    const costMultiplier =
      this.multipliers.get(context.resource) ??
      (context.mcpServerId ? this.multipliers.get(context.mcpServerId) : undefined) ??
      this.defaultMultiplier;

    const baseCost = BASE_TOOL_CALL_COST;
    const totalCost = Math.ceil(baseCost * costMultiplier * GLOBAL_MARKUP_MULTIPLIER);

    return ok({
      baseCost,
      costMultiplier,
      globalMarkup: GLOBAL_MARKUP_MULTIPLIER,
      totalCost,
    });
  }

  /** Set cost multiplier for a specific resource or MCP server (test helper). */
  setCostMultiplier(key: string, multiplier: number): void {
    this.multipliers.set(key, multiplier);
  }
}

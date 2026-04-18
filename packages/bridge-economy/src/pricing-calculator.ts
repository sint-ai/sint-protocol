/**
 * SINT Protocol — Pricing Calculator.
 *
 * Pure function that computes the token cost for an action.
 * Mirrors the billing formula from the product API's ChatService:
 *
 *   tokens = ceil(baseCost × costMultiplier × globalMarkup)
 *
 * Default MCP tool call: ceil(6 × 1.0 × 1.5) = 9 tokens.
 *
 * @module @sint/bridge-economy/pricing-calculator
 */

import type { SintRequest } from "@sint-ai/core";
import type { PricingInfo } from "./interfaces.js";

// ─── Constants matching the product API ────────────────────────

/** Base cost for a tool/MCP call, in tokens. */
export const BASE_TOOL_CALL_COST = 6;

/** Base cost for a chat message, in tokens. */
export const BASE_CHAT_MESSAGE_COST = 4;

/** Base cost for capsule execution, in tokens. */
export const BASE_CAPSULE_EXEC_COST = 12;

/** Base cost for ROS 2 topic publish, in tokens. */
export const BASE_ROS2_PUBLISH_COST = 8;

/** Global markup multiplier applied to all actions. */
export const GLOBAL_MARKUP_MULTIPLIER = 1.5;

/** Number of tokens per US dollar. */
export const TOKENS_PER_DOLLAR = 250;

/** Initial user balance in tokens. */
export const INITIAL_USER_BALANCE = 250;

/**
 * Determine the base cost for a request based on its action type.
 *
 * @param request - The SINT request
 * @returns Base cost in tokens
 */
export function getBaseCost(request: SintRequest): number {
  const action = request.action.toLowerCase();
  const resource = request.resource.toLowerCase();

  // Capsule execution
  if (resource.startsWith("capsule://") || action === "capsule_exec") {
    return BASE_CAPSULE_EXEC_COST;
  }

  // ROS 2 topic operations
  if (resource.startsWith("ros2://")) {
    return BASE_ROS2_PUBLISH_COST;
  }

  // Chat/message operations
  if (action === "chat" || action === "message") {
    return BASE_CHAT_MESSAGE_COST;
  }

  // Default: tool/MCP call
  return BASE_TOOL_CALL_COST;
}

/**
 * Compute the total cost of an action in tokens.
 *
 * Formula: ceil(baseCost × costMultiplier × globalMarkup)
 *
 * @param request - The SINT request to price
 * @param costMultiplier - MCP/resource-specific cost multiplier (default 1.0)
 * @returns Pricing information with breakdown
 *
 * @example
 * ```ts
 * const pricing = computeActionCost(request); // 9 tokens for default MCP
 * const pricing = computeActionCost(request, 2.0); // 18 tokens for premium MCP
 * ```
 */
export function computeActionCost(
  request: SintRequest,
  costMultiplier = 1.0,
): PricingInfo {
  const baseCost = getBaseCost(request);
  const totalCost = Math.ceil(baseCost * costMultiplier * GLOBAL_MARKUP_MULTIPLIER);

  return {
    baseCost,
    costMultiplier,
    globalMarkup: GLOBAL_MARKUP_MULTIPLIER,
    totalCost,
  };
}

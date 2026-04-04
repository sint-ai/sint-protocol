/**
 * SINT Protocol — HTTP Budget Adapter.
 *
 * Implements IBudgetPort by calling the product API's budget endpoints:
 * - POST /budgets/check → checkBudget
 *
 * @module @sint/bridge-economy/adapters/http-budget-adapter
 */

import { err, type Result } from "@sint/core";
import type { IBudgetPort, BudgetCheckParams, BudgetCheckResult } from "../interfaces.js";
import { HttpClient, type HttpClientConfig } from "./http-client.js";

/**
 * HTTP adapter for the product API's BudgetService.
 *
 * @example
 * ```ts
 * const adapter = new HttpBudgetAdapter({
 *   baseUrl: "https://api.sint.gg",
 *   authToken: keycloakToken,
 * });
 * const result = await adapter.checkBudget({ userId: "u1", estimatedCost: 9, ... });
 * ```
 */
export class HttpBudgetAdapter implements IBudgetPort {
  private readonly client: HttpClient;

  constructor(config: HttpClientConfig) {
    this.client = new HttpClient(config);
  }

  async checkBudget(params: BudgetCheckParams): Promise<Result<BudgetCheckResult, Error>> {
    const result = await this.client.post<BudgetCheckResult>(
      "/budgets/check",
      {
        userId: params.userId,
        action: params.action,
        resource: params.resource,
        estimatedCost: params.estimatedCost,
      },
    );

    if (!result.ok) {
      return err(new Error(`Failed to check budget: ${result.error.message}`));
    }

    return result;
  }
}

/**
 * SINT Protocol — HTTP Balance Adapter.
 *
 * Implements IBalancePort by calling the product API's balance endpoints:
 * - GET  /balance/:userId      → getBalance
 * - POST /balance/withdraw     → withdraw
 * - POST /balance/deposit      → deposit
 *
 * @module @sint/bridge-economy/adapters/http-balance-adapter
 */

import { err, type Result } from "@sint/core";
import type { IBalancePort, BalanceInfo } from "../interfaces.js";
import { HttpClient, type HttpClientConfig } from "./http-client.js";

/**
 * HTTP adapter for the product API's BalanceService.
 *
 * @example
 * ```ts
 * const adapter = new HttpBalanceAdapter({
 *   baseUrl: "https://api.sint.ai",
 *   authToken: keycloakToken,
 * });
 * const result = await adapter.getBalance("user1");
 * ```
 */
export class HttpBalanceAdapter implements IBalancePort {
  private readonly client: HttpClient;

  constructor(config: HttpClientConfig) {
    this.client = new HttpClient(config);
  }

  async getBalance(userId: string): Promise<Result<BalanceInfo, Error>> {
    const result = await this.client.get<{ balance: number; updatedAt: string }>(
      `/balance/${encodeURIComponent(userId)}`,
    );

    if (!result.ok) {
      return err(new Error(`Failed to get balance: ${result.error.message}`));
    }

    return {
      ok: true,
      value: {
        userId,
        balance: result.value.balance,
        updatedAt: result.value.updatedAt,
      },
    };
  }

  async withdraw(
    userId: string,
    tokens: number,
    description: string,
    source: string,
  ): Promise<Result<BalanceInfo, Error>> {
    const result = await this.client.post<{ balance: number; updatedAt: string }>(
      "/balance/withdraw",
      { userId, tokens, description, source },
    );

    if (!result.ok) {
      return err(new Error(`Failed to withdraw: ${result.error.message}`));
    }

    return {
      ok: true,
      value: {
        userId,
        balance: result.value.balance,
        updatedAt: result.value.updatedAt,
      },
    };
  }

  async deposit(
    userId: string,
    tokens: number,
    description: string,
    source: string,
  ): Promise<Result<BalanceInfo, Error>> {
    const result = await this.client.post<{ balance: number; updatedAt: string }>(
      "/balance/deposit",
      { userId, tokens, description, source },
    );

    if (!result.ok) {
      return err(new Error(`Failed to deposit: ${result.error.message}`));
    }

    return {
      ok: true,
      value: {
        userId,
        balance: result.value.balance,
        updatedAt: result.value.updatedAt,
      },
    };
  }
}

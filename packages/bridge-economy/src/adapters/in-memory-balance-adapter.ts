/**
 * SINT Protocol — In-Memory Balance Adapter.
 *
 * Testing implementation of IBalancePort that stores balances
 * in a Map. No external dependencies.
 *
 * @module @sint/bridge-economy/adapters/in-memory-balance-adapter
 */

import { ok, err, type Result } from "@sint/core";
import type { IBalancePort, BalanceInfo } from "../interfaces.js";

/**
 * In-memory balance adapter for testing.
 *
 * @example
 * ```ts
 * const adapter = new InMemoryBalanceAdapter(250); // 250 initial tokens
 * await adapter.getBalance("user1"); // { balance: 250 }
 * await adapter.withdraw("user1", 9, "MCP call", "sint_protocol");
 * await adapter.getBalance("user1"); // { balance: 241 }
 * ```
 */
export class InMemoryBalanceAdapter implements IBalancePort {
  private readonly balances = new Map<string, number>();
  private readonly defaultBalance: number;

  constructor(defaultBalance = 250) {
    this.defaultBalance = defaultBalance;
  }

  async getBalance(userId: string): Promise<Result<BalanceInfo, Error>> {
    const balance = this.balances.get(userId) ?? this.defaultBalance;
    return ok({
      userId,
      balance,
      updatedAt: new Date().toISOString(),
    });
  }

  async withdraw(
    userId: string,
    tokens: number,
    _description: string,
    _source: string,
  ): Promise<Result<BalanceInfo, Error>> {
    const current = this.balances.get(userId) ?? this.defaultBalance;

    if (tokens < 0) {
      return err(new Error("Cannot withdraw negative tokens"));
    }

    if (current < tokens) {
      return err(
        new Error(`Insufficient balance: requires ${tokens}, has ${current}`),
      );
    }

    const newBalance = current - tokens;
    this.balances.set(userId, newBalance);

    return ok({
      userId,
      balance: newBalance,
      updatedAt: new Date().toISOString(),
    });
  }

  async deposit(
    userId: string,
    tokens: number,
    _description: string,
    _source: string,
  ): Promise<Result<BalanceInfo, Error>> {
    if (tokens < 0) {
      return err(new Error("Cannot deposit negative tokens"));
    }

    const current = this.balances.get(userId) ?? this.defaultBalance;
    const newBalance = current + tokens;
    this.balances.set(userId, newBalance);

    return ok({
      userId,
      balance: newBalance,
      updatedAt: new Date().toISOString(),
    });
  }

  /** Set a specific balance (test helper). */
  setBalance(userId: string, balance: number): void {
    this.balances.set(userId, balance);
  }

  /** Get the raw balance map (test helper). */
  getBalanceMap(): ReadonlyMap<string, number> {
    return this.balances;
  }
}

/**
 * SINT Persistence — In-Memory Ledger Store.
 *
 * Reference implementation of LedgerStore for testing and development.
 * Uses the same contract that PG/Redis adapters must satisfy.
 *
 * @module @sint/persistence/in-memory-ledger-store
 */

import type { LedgerQuery, SintLedgerEvent, UUIDv7 } from "@sint-ai/core";
import type { LedgerStore } from "./interfaces.js";

export class InMemoryLedgerStore implements LedgerStore {
  private events: SintLedgerEvent[] = [];

  async append(event: SintLedgerEvent): Promise<void> {
    this.events.push(event);
  }

  async query(query: LedgerQuery): Promise<readonly SintLedgerEvent[]> {
    let result = [...this.events];

    if (query.agentId) {
      result = result.filter((e) => e.agentId === query.agentId);
    }
    if (query.eventType) {
      result = result.filter((e) => e.eventType === query.eventType);
    }
    if (query.fromSequence !== undefined) {
      result = result.filter((e) => e.sequenceNumber >= query.fromSequence!);
    }
    if (query.toSequence !== undefined) {
      result = result.filter((e) => e.sequenceNumber <= query.toSequence!);
    }

    // Sort by sequence number
    result.sort((a, b) => Number(a.sequenceNumber - b.sequenceNumber));

    if (query.offset) {
      result = result.slice(query.offset);
    }
    if (query.limit) {
      result = result.slice(0, query.limit);
    }

    return result;
  }

  async getById(eventId: UUIDv7): Promise<SintLedgerEvent | undefined> {
    return this.events.find((e) => e.eventId === eventId);
  }

  async getHead(): Promise<SintLedgerEvent | undefined> {
    if (this.events.length === 0) return undefined;
    return this.events[this.events.length - 1];
  }

  async count(): Promise<number> {
    return this.events.length;
  }

  async verifyChain(): Promise<boolean> {
    if (this.events.length === 0) return true;

    for (let i = 1; i < this.events.length; i++) {
      const current = this.events[i]!;
      const previous = this.events[i - 1]!;
      if (current.previousHash !== previous.hash) {
        return false;
      }
    }
    return true;
  }
}

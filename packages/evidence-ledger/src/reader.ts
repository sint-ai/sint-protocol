/**
 * SINT Protocol — Evidence Ledger Reader.
 *
 * Query interface for the Evidence Ledger.
 * Supports filtering by agent, event type, time range, and sequence range.
 *
 * @module @sint/gate-evidence-ledger/reader
 */

import type {
  LedgerQuery,
  SintLedgerEvent,
} from "@sint-ai/core";

/**
 * Query the ledger for events matching the given criteria.
 * Pure function — filters an existing event list.
 *
 * @param events - All events in the ledger
 * @param query - Filter criteria
 * @returns Matching events, sorted by sequence number
 *
 * @example
 * ```ts
 * const safetyEvents = queryLedger(allEvents, {
 *   eventType: "safety.estop.triggered",
 *   fromTimestamp: "2026-03-16T00:00:00.000000Z",
 * });
 * ```
 */
export function queryLedger(
  events: readonly SintLedgerEvent[],
  query: LedgerQuery,
): readonly SintLedgerEvent[] {
  let filtered = events;

  if (query.agentId) {
    const agentId = query.agentId;
    filtered = filtered.filter((e) => e.agentId === agentId);
  }

  if (query.eventType) {
    const eventType = query.eventType;
    filtered = filtered.filter((e) => e.eventType === eventType);
  }

  if (query.fromSequence !== undefined) {
    const from = query.fromSequence;
    filtered = filtered.filter((e) => e.sequenceNumber >= from);
  }

  if (query.toSequence !== undefined) {
    const to = query.toSequence;
    filtered = filtered.filter((e) => e.sequenceNumber <= to);
  }

  if (query.fromTimestamp) {
    const from = new Date(query.fromTimestamp).getTime();
    filtered = filtered.filter(
      (e) => new Date(e.timestamp).getTime() >= from,
    );
  }

  if (query.toTimestamp) {
    const to = new Date(query.toTimestamp).getTime();
    filtered = filtered.filter(
      (e) => new Date(e.timestamp).getTime() <= to,
    );
  }

  // Apply offset and limit
  const offset = query.offset ?? 0;
  const limit = query.limit ?? filtered.length;

  return filtered.slice(offset, offset + limit);
}

/**
 * Replay events in sequence order, calling a callback for each.
 * Useful for reconstructing state from the audit trail.
 *
 * @example
 * ```ts
 * replayEvents(events, (event) => {
 *   console.log(`[${event.sequenceNumber}] ${event.eventType}`);
 * });
 * ```
 */
export function replayEvents(
  events: readonly SintLedgerEvent[],
  callback: (event: SintLedgerEvent) => void,
): void {
  const sorted = [...events].sort((a, b) =>
    a.sequenceNumber < b.sequenceNumber ? -1 : 1,
  );
  for (const event of sorted) {
    callback(event);
  }
}

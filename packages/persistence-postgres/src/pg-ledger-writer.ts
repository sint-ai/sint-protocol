/**
 * SINT Persistence Postgres — PostgreSQL Ledger Writer.
 *
 * Implements the LedgerStore interface from @sint/persistence using a real
 * PostgreSQL backend. Events are INSERT-only and hash-chained.
 *
 * Table: sint_ledger_events
 *   id          SERIAL PRIMARY KEY
 *   event_id    UUID NOT NULL UNIQUE
 *   agent_id    TEXT NOT NULL
 *   token_id    TEXT
 *   event_type  TEXT NOT NULL
 *   payload     JSONB NOT NULL
 *   prev_hash   TEXT NOT NULL
 *   hash        TEXT NOT NULL
 *   created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
 *
 * @module @sint/persistence-postgres/pg-ledger-writer
 */

import type { LedgerQuery, SintLedgerEvent, UUIDv7 } from "@sint/core";
import type { LedgerStore } from "@sint/persistence";
import type { PgPool } from "./pg-pool.js";

/** Map a raw database row to a SintLedgerEvent. */
function rowToEvent(row: Record<string, unknown>): SintLedgerEvent {
  return {
    eventId: row["event_id"] as UUIDv7,
    // sequence_number is stored as a BIGINT string in PG
    sequenceNumber: BigInt(String(row["sequence_number"] ?? row["id"] ?? 0)),
    timestamp: String(row["created_at"] ?? row["timestamp"] ?? new Date().toISOString()),
    eventType: row["event_type"] as SintLedgerEvent["eventType"],
    agentId: String(row["agent_id"]),
    tokenId: row["token_id"] != null ? String(row["token_id"]) : undefined,
    payload: (row["payload"] ?? {}) as Record<string, unknown>,
    previousHash: String(row["prev_hash"] ?? row["previous_hash"] ?? "0".repeat(64)),
    hash: String(row["hash"]),
  };
}

/**
 * PostgreSQL-backed LedgerStore.
 *
 * Preserves the full hash chain across process restarts.
 * All writes are append-only — no UPDATE or DELETE is issued.
 */
export class PgLedgerWriter implements LedgerStore {
  constructor(private readonly pool: PgPool) {}

  /** Append an event (INSERT-only). */
  async append(event: SintLedgerEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO sint_ledger_events
         (event_id, sequence_number, agent_id, token_id, event_type, payload, prev_hash, hash, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`,
      [
        event.eventId,
        event.sequenceNumber.toString(),
        event.agentId,
        event.tokenId ?? null,
        event.eventType,
        JSON.stringify(event.payload),
        event.previousHash,
        event.hash,
        event.timestamp,
      ],
    );
  }

  /** Query events with optional filters (agentId, eventType, sequence range, limit, offset). */
  async query(query: LedgerQuery): Promise<readonly SintLedgerEvent[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    if (query.agentId) {
      conditions.push(`agent_id = $${p++}`);
      params.push(query.agentId);
    }
    if (query.eventType) {
      conditions.push(`event_type = $${p++}`);
      params.push(query.eventType);
    }
    if (query.fromSequence !== undefined) {
      conditions.push(`sequence_number >= $${p++}`);
      params.push(query.fromSequence.toString());
    }
    if (query.toSequence !== undefined) {
      conditions.push(`sequence_number <= $${p++}`);
      params.push(query.toSequence.toString());
    }

    let sql = "SELECT * FROM sint_ledger_events";
    if (conditions.length > 0) sql += " WHERE " + conditions.join(" AND ");
    sql += " ORDER BY sequence_number ASC";

    if (query.limit !== undefined) {
      sql += ` LIMIT $${p++}`;
      params.push(query.limit);
    }
    if (query.offset !== undefined) {
      sql += ` OFFSET $${p++}`;
      params.push(query.offset);
    }

    const result = await this.pool.query(sql, params);
    return result.rows.map((r) => rowToEvent(r as Record<string, unknown>));
  }

  /** Look up an event by its UUID. */
  async getById(eventId: UUIDv7): Promise<SintLedgerEvent | undefined> {
    const result = await this.pool.query(
      "SELECT * FROM sint_ledger_events WHERE event_id = $1",
      [eventId],
    );
    if (result.rows.length === 0) return undefined;
    return rowToEvent(result.rows[0] as Record<string, unknown>);
  }

  /** Return the most recently inserted event (head of chain). */
  async getHead(): Promise<SintLedgerEvent | undefined> {
    const result = await this.pool.query(
      "SELECT * FROM sint_ledger_events ORDER BY sequence_number DESC LIMIT 1",
    );
    if (result.rows.length === 0) return undefined;
    return rowToEvent(result.rows[0] as Record<string, unknown>);
  }

  /** Total number of stored events. */
  async count(): Promise<number> {
    const result = await this.pool.query(
      "SELECT COUNT(*) AS cnt FROM sint_ledger_events",
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return parseInt(String(row?.["cnt"] ?? "0"), 10);
  }

  /**
   * Verify the hash chain integrity.
   * Reads all events ordered by sequence_number and checks previousHash links.
   *
   * Returns `true` when the chain is intact (or empty).
   */
  async verifyChain(): Promise<boolean> {
    const result = await this.pool.query(
      "SELECT * FROM sint_ledger_events ORDER BY sequence_number ASC",
    );
    const events = result.rows.map((r) => rowToEvent(r as Record<string, unknown>));

    if (events.length === 0) return true;

    for (let i = 1; i < events.length; i++) {
      const current = events[i]!;
      const previous = events[i - 1]!;
      if (current.previousHash !== previous.hash) {
        return false;
      }
    }
    return true;
  }
}

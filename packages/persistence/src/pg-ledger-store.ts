/**
 * SINT Persistence — PostgreSQL Ledger Store.
 *
 * INSERT-only ledger with SHA-256 hash chain verification.
 *
 * @module @sint/persistence/pg-ledger-store
 */

import type pg from "pg";
import type {
  LedgerQuery,
  SintLedgerEvent,
  UUIDv7,
} from "@pshkv/core";
import type { LedgerStore } from "./interfaces.js";

/** Map a database row to a SintLedgerEvent. */
function rowToEvent(row: any): SintLedgerEvent {
  return {
    eventId: row.event_id,
    sequenceNumber: BigInt(row.sequence_number),
    timestamp: row.timestamp,
    eventType: row.event_type,
    agentId: row.agent_id,
    tokenId: row.token_id ?? undefined,
    payload: row.payload,
    previousHash: row.previous_hash,
    hash: row.hash,
  };
}

export class PgLedgerStore implements LedgerStore {
  constructor(private readonly pool: pg.Pool) {}

  async append(event: SintLedgerEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO sint_ledger_events
        (event_id, sequence_number, timestamp, event_type, agent_id, token_id, payload, previous_hash, hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        event.eventId,
        event.sequenceNumber.toString(),
        event.timestamp,
        event.eventType,
        event.agentId,
        event.tokenId ?? null,
        JSON.stringify(event.payload),
        event.previousHash,
        event.hash,
      ],
    );
  }

  async query(query: LedgerQuery): Promise<readonly SintLedgerEvent[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (query.agentId) {
      conditions.push(`agent_id = $${paramIndex++}`);
      params.push(query.agentId);
    }
    if (query.eventType) {
      conditions.push(`event_type = $${paramIndex++}`);
      params.push(query.eventType);
    }
    if (query.fromSequence !== undefined) {
      conditions.push(`sequence_number >= $${paramIndex++}`);
      params.push(query.fromSequence.toString());
    }
    if (query.toSequence !== undefined) {
      conditions.push(`sequence_number <= $${paramIndex++}`);
      params.push(query.toSequence.toString());
    }
    if (query.fromTimestamp) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(query.fromTimestamp);
    }
    if (query.toTimestamp) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(query.toTimestamp);
    }

    let sql = "SELECT * FROM sint_ledger_events";
    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY sequence_number ASC";

    if (query.limit !== undefined) {
      sql += ` LIMIT $${paramIndex++}`;
      params.push(query.limit);
    }
    if (query.offset !== undefined) {
      sql += ` OFFSET $${paramIndex++}`;
      params.push(query.offset);
    }

    const result = await this.pool.query(sql, params);
    return result.rows.map(rowToEvent);
  }

  async getById(eventId: UUIDv7): Promise<SintLedgerEvent | undefined> {
    const result = await this.pool.query(
      "SELECT * FROM sint_ledger_events WHERE event_id = $1",
      [eventId],
    );
    return result.rows.length > 0 ? rowToEvent(result.rows[0]) : undefined;
  }

  async getHead(): Promise<SintLedgerEvent | undefined> {
    const result = await this.pool.query(
      "SELECT * FROM sint_ledger_events ORDER BY sequence_number DESC LIMIT 1",
    );
    return result.rows.length > 0 ? rowToEvent(result.rows[0]) : undefined;
  }

  async count(): Promise<number> {
    const result = await this.pool.query(
      "SELECT COUNT(*) AS cnt FROM sint_ledger_events",
    );
    return parseInt(result.rows[0].cnt, 10);
  }

  async verifyChain(): Promise<boolean> {
    const result = await this.pool.query(
      "SELECT * FROM sint_ledger_events ORDER BY sequence_number ASC",
    );
    const events = result.rows.map(rowToEvent);

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

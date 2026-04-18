/**
 * SINT Persistence — Storage Interfaces.
 *
 * Interface-first design: define contracts, implement adapters separately.
 * All methods are async to support remote backends (PG, Redis).
 *
 * @module @sint/persistence/interfaces
 */

import type {
  ISO8601,
  LedgerQuery,
  SintCapabilityToken,
  SintLedgerEvent,
  UUIDv7,
} from "@sint-ai/core";

/**
 * Persistent storage for ledger events.
 * INSERT-only — no updates or deletes permitted.
 */
export interface LedgerStore {
  /** Append an event to the ledger. */
  append(event: SintLedgerEvent): Promise<void>;

  /** Query events by filter criteria. */
  query(query: LedgerQuery): Promise<readonly SintLedgerEvent[]>;

  /** Get a single event by ID. */
  getById(eventId: UUIDv7): Promise<SintLedgerEvent | undefined>;

  /** Get the latest event (head of chain). */
  getHead(): Promise<SintLedgerEvent | undefined>;

  /** Get total event count. */
  count(): Promise<number>;

  /** Verify the hash chain integrity of stored events. */
  verifyChain(): Promise<boolean>;
}

/**
 * Persistent storage for capability tokens.
 */
export interface TokenStore {
  /** Store a token. */
  store(token: SintCapabilityToken): Promise<void>;

  /** Retrieve a token by ID. */
  get(tokenId: UUIDv7): Promise<SintCapabilityToken | undefined>;

  /** Get all tokens for a subject (agent). */
  getBySubject(subject: string): Promise<readonly SintCapabilityToken[]>;

  /** Delete an expired or revoked token. */
  remove(tokenId: UUIDv7): Promise<boolean>;

  /** Count stored tokens. */
  count(): Promise<number>;
}

/**
 * Pub/sub bus for token revocation events.
 * Enables <1s propagation across distributed nodes.
 */
export interface RevocationBus {
  /** Publish a revocation event. */
  publish(tokenId: UUIDv7, reason: string, revokedBy: string): Promise<void>;

  /** Subscribe to revocation events. Returns unsubscribe function. */
  subscribe(
    handler: (event: RevocationEvent) => void,
  ): () => void;
}

/** A revocation event on the bus. */
export interface RevocationEvent {
  readonly tokenId: UUIDv7;
  readonly reason: string;
  readonly revokedBy: string;
  readonly timestamp: ISO8601;
}

/**
 * TTL-based cache for hot data.
 */
export interface CacheStore {
  /** Get a cached value. Returns undefined on miss. */
  get<T>(key: string): Promise<T | undefined>;

  /** Set a cached value with TTL in milliseconds. */
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;

  /** Delete a cached entry. */
  delete(key: string): Promise<boolean>;

  /** Check if key exists. */
  has(key: string): Promise<boolean>;

  /** Clear all entries. */
  clear(): Promise<void>;
}

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
  MissionManifest,
  MissionManifestRevocation,
  MissionActionOutcomeReport,
  SintCapabilityToken,
  SintLedgerEvent,
  UUIDv7,
} from "@pshkv/core";

export interface MissionManifestQuery {
  readonly platformId?: string;
  readonly missionClass?: MissionManifest["missionClass"];
  readonly activeAt?: ISO8601;
}

export interface MissionActionClaim {
  readonly actionRef: string;
  readonly manifestId: UUIDv7;
  readonly effectId?: string;
  readonly claimedAt: ISO8601;
}

export type MissionActionClaimResult =
  | { readonly status: "claimed"; readonly claim: MissionActionClaim }
  | { readonly status: "duplicate"; readonly claim: MissionActionClaim }
  | { readonly status: "effect_limit_exceeded" };

export type MissionActionOutcomeResult =
  | { readonly status: "finalized"; readonly report: MissionActionOutcomeReport }
  | { readonly status: "duplicate"; readonly report: MissionActionOutcomeReport }
  | { readonly status: "missing_claim" };

export type MissionManifestStoreResult =
  | { readonly status: "stored"; readonly manifest: MissionManifest }
  | { readonly status: "duplicate"; readonly manifest: MissionManifest }
  | { readonly status: "rollback"; readonly head: MissionManifest }
  | { readonly status: "fork"; readonly head: MissionManifest };

/**
 * Immutable mission manifests and append-only revocations.
 */
export interface MissionManifestStore {
  /**
   * Atomically store a manifest and advance the platform authority head.
   * Existing authority can only advance through a higher-version direct child.
   */
  store(manifest: MissionManifest): Promise<MissionManifestStoreResult>;

  /** Retrieve a manifest by ID. */
  get(manifestId: UUIDv7): Promise<MissionManifest | undefined>;

  /** Retrieve the monotonic authority head for a platform identity. */
  getAuthorityHead(platformIdentity: string): Promise<MissionManifest | undefined>;

  /** List manifests matching optional operational filters. */
  list(query?: MissionManifestQuery): Promise<readonly MissionManifest[]>;

  /** Append a revocation. Returns false when missing or already revoked. */
  revoke(revocation: MissionManifestRevocation): Promise<boolean>;

  /** Retrieve the revocation record for a manifest. */
  getRevocation(manifestId: UUIDv7): Promise<MissionManifestRevocation | undefined>;

  /**
   * Atomically reserve an executable action and, when applicable, one effect use.
   * Claims are append-only so action replay and concurrent max-use races fail closed.
   */
  claimAction(
    claim: MissionActionClaim,
    effectMaxUses?: number,
  ): Promise<MissionActionClaimResult>;

  /** Append the single terminal outcome for an existing execution claim. */
  finalizeAction(
    report: MissionActionOutcomeReport,
  ): Promise<MissionActionOutcomeResult>;
}

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

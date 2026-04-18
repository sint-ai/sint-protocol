import type { ISO8601, UUIDv7 } from "@sint-ai/core";

export interface MemoryEntry {
  readonly key: string;
  readonly value: unknown;
  readonly tags: readonly string[];
  readonly storedAt: ISO8601;
  readonly source: "working" | "operator" | "ledger";
  readonly ledgerEventId?: UUIDv7;
}

export interface MemorySearchResult {
  readonly entry: MemoryEntry;
  readonly score: number; // 0.0–1.0, keyword match relevance
}

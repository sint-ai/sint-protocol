import { canonicalJsonStringify, type SHA256 } from "@pshkv/core";
import { hashSha256, nowISO8601 } from "@pshkv/gate-capability-tokens";
import type { EdgeJournalEntry } from "./types.js";

const GENESIS_HASH = "0".repeat(64);

export class EdgeJournal {
  private readonly entries: EdgeJournalEntry[] = [];
  private head: SHA256 = GENESIS_HASH;

  append(
    input: Omit<EdgeJournalEntry, "sequence" | "timestamp" | "previousHash" | "hash">,
  ): EdgeJournalEntry {
    const partial = {
      ...input,
      sequence: this.entries.length + 1,
      timestamp: nowISO8601(),
      previousHash: this.head,
    };
    const entry: EdgeJournalEntry = {
      ...partial,
      hash: hashSha256(canonicalJsonStringify(partial)),
    };
    this.entries.push(entry);
    this.head = entry.hash;
    return entry;
  }

  get headHash(): SHA256 {
    return this.head;
  }

  getAll(): readonly EdgeJournalEntry[] {
    return [...this.entries];
  }

  verify(): boolean {
    let previousHash = GENESIS_HASH;
    for (let index = 0; index < this.entries.length; index += 1) {
      const entry = this.entries[index]!;
      if (entry.sequence !== index + 1 || entry.previousHash !== previousHash) return false;
      const { hash, ...payload } = entry;
      if (hashSha256(canonicalJsonStringify(payload)) !== hash) return false;
      previousHash = hash;
    }
    return true;
  }
}

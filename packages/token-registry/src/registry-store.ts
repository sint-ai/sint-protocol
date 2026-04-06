import type { RegistryEntry, RegistryLookupResult, RegistryListFilter } from "./types.js";

export interface RegistryStore {
  publish(entry: RegistryEntry): Promise<void>;
  get(tokenId: string): Promise<RegistryEntry | undefined>;
  list(filter?: RegistryListFilter): Promise<RegistryEntry[]>;
  verify(tokenId: string): Promise<RegistryLookupResult>;
}

export class InMemoryRegistryStore implements RegistryStore {
  private readonly entries = new Map<string, RegistryEntry>();

  async publish(entry: RegistryEntry): Promise<void> {
    this.entries.set(entry.tokenId, entry);
  }

  async get(tokenId: string): Promise<RegistryEntry | undefined> {
    return this.entries.get(tokenId);
  }

  async list(filter?: RegistryListFilter): Promise<RegistryEntry[]> {
    let results = [...this.entries.values()];
    if (filter?.issuer) {
      results = results.filter((e) => e.issuer === filter.issuer);
    }
    if (filter?.toolScope) {
      results = results.filter((e) => e.toolScope === filter.toolScope);
    }
    return results;
  }

  async verify(tokenId: string): Promise<RegistryLookupResult> {
    const entry = this.entries.get(tokenId);
    return entry ? { found: true, entry } : { found: false };
  }
}

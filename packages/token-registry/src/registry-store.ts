import type { RegistryEntry, RegistryListFilter, RegistryLookupResult } from "./types.js";

export interface RegistryStore {
  publish(entry: RegistryEntry): Promise<void>;
  get(tokenId: string): Promise<RegistryEntry | undefined>;
  list(filter?: RegistryListFilter): Promise<RegistryEntry[]>;
  verify(tokenId: string): Promise<RegistryLookupResult>;
}

export class InMemoryRegistryStore implements RegistryStore {
  private readonly store = new Map<string, RegistryEntry>();

  async publish(entry: RegistryEntry): Promise<void> {
    this.store.set(entry.tokenId, entry);
  }

  async get(tokenId: string): Promise<RegistryEntry | undefined> {
    return this.store.get(tokenId);
  }

  async list(filter?: RegistryListFilter): Promise<RegistryEntry[]> {
    const entries = Array.from(this.store.values());
    if (!filter) return entries;
    return entries.filter(e => {
      if (filter.issuer && e.issuer !== filter.issuer) return false;
      if (filter.resource && !e.resource.startsWith(filter.resource.replace(/\*$/, ""))) return false;
      return true;
    });
  }

  async verify(tokenId: string): Promise<RegistryLookupResult> {
    const entry = this.store.get(tokenId);
    return entry ? { found: true, entry } : { found: false };
  }
}

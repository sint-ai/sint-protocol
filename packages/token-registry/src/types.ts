export interface RegistryEntry {
  readonly tokenId: string;
  readonly issuer: string;       // Ed25519 public key hex
  readonly subject: string;      // agent public key hex
  readonly resource: string;     // e.g. "mcp://filesystem/*"
  readonly actions: readonly string[];
  readonly validFrom: string;    // ISO8601
  readonly validTo: string;      // ISO8601
  readonly publishedAt: string;  // ISO8601
  readonly publisherNote?: string;
}

export interface RegistryPublishRequest {
  readonly tokenId: string;
  readonly issuer: string;
  readonly subject: string;
  readonly resource: string;
  readonly actions: readonly string[];
  readonly validFrom: string;
  readonly validTo: string;
  readonly publisherNote?: string;
}

export interface RegistryLookupResult {
  readonly found: boolean;
  readonly entry?: RegistryEntry;
}

export interface RegistryListFilter {
  readonly issuer?: string;
  readonly resource?: string;
}

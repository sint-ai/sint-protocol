/**
 * SINT Persistence — In-Memory Token Store.
 *
 * @module @sint/persistence/in-memory-token-store
 */

import type { SintCapabilityToken, UUIDv7 } from "@pshkv/core";
import type { TokenStore } from "./interfaces.js";

export class InMemoryTokenStore implements TokenStore {
  private tokens = new Map<string, SintCapabilityToken>();

  async store(token: SintCapabilityToken): Promise<void> {
    this.tokens.set(token.tokenId, token);
  }

  async get(tokenId: UUIDv7): Promise<SintCapabilityToken | undefined> {
    return this.tokens.get(tokenId);
  }

  async getBySubject(subject: string): Promise<readonly SintCapabilityToken[]> {
    return Array.from(this.tokens.values()).filter(
      (t) => t.subject === subject,
    );
  }

  async remove(tokenId: UUIDv7): Promise<boolean> {
    return this.tokens.delete(tokenId);
  }

  async count(): Promise<number> {
    return this.tokens.size;
  }
}

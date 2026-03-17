/**
 * SINT Persistence — In-Memory Revocation Bus.
 *
 * @module @sint/persistence/in-memory-revocation-bus
 */

import type { UUIDv7 } from "@sint/core";
import type { RevocationBus, RevocationEvent } from "./interfaces.js";

export class InMemoryRevocationBus implements RevocationBus {
  private handlers: Array<(event: RevocationEvent) => void> = [];

  async publish(tokenId: UUIDv7, reason: string, revokedBy: string): Promise<void> {
    const event: RevocationEvent = {
      tokenId,
      reason,
      revokedBy,
      timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    };

    for (const handler of this.handlers) {
      handler(event);
    }
  }

  subscribe(handler: (event: RevocationEvent) => void): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }
}

/**
 * SINT Persistence — Redis Revocation Bus.
 *
 * Cross-node revocation propagation via Redis pub/sub.
 * Enables <1s revocation propagation across distributed nodes.
 *
 * @module @sint/persistence/redis-revocation-bus
 */

import type { Redis } from "ioredis";
import type { UUIDv7 } from "@sint-ai/core";
import type { RevocationBus, RevocationEvent } from "./interfaces.js";

const CHANNEL = "sint:revocations";

export class RedisRevocationBus implements RevocationBus {
  private readonly handlers: Array<(event: RevocationEvent) => void> = [];
  private subscriber: Redis | null = null;

  constructor(
    private readonly publisher: Redis,
    subscriberFactory?: () => Redis,
  ) {
    // Create a dedicated subscriber connection (Redis requires separate connections for pub/sub)
    if (subscriberFactory) {
      this.subscriber = subscriberFactory();
      this.subscriber.subscribe(CHANNEL);
      this.subscriber.on("message", (_channel: string, message: string) => {
        try {
          const event: RevocationEvent = JSON.parse(message);
          for (const handler of this.handlers) {
            handler(event);
          }
        } catch {
          // Ignore malformed messages
        }
      });
    }
  }

  async publish(tokenId: UUIDv7, reason: string, revokedBy: string): Promise<void> {
    const event: RevocationEvent = {
      tokenId,
      reason,
      revokedBy,
      timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z") as any,
    };
    await this.publisher.publish(CHANNEL, JSON.stringify(event));
  }

  subscribe(handler: (event: RevocationEvent) => void): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }

  /** Shut down the subscriber connection. */
  async dispose(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.unsubscribe(CHANNEL);
      this.subscriber.disconnect();
      this.subscriber = null;
    }
  }
}

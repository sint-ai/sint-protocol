import type { Redis } from "ioredis";

/**
 * Records the first use of a simulation receipt nonce.
 * A repeated receipt id and nonce sets nothing and is rejected.
 */
export class RedisSimulationReceiptNonceStore {
  constructor(private readonly redis: Redis) {}

  async consume(receiptId: string, nonce: string): Promise<boolean> {
    const key = `sint:simulation-receipt-nonce:${receiptId.length}:${receiptId}:${nonce.length}:${nonce}`;
    const created = await this.redis.set(key, "1", "NX");
    return created === "OK";
  }
}

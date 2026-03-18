/**
 * SINT Gateway Server — Redis Connection Factory.
 *
 * Isolates the ioredis import to handle CJS/ESM interop.
 * Only called when SINT_CACHE=redis is configured.
 *
 * @module @sint/gateway-server/redis-factory
 */

import type { Redis } from "ioredis";

/**
 * Create a new Redis connection.
 * Uses dynamic require to handle ioredis' CJS export pattern.
 */
export function createRedisClient(url: string): Redis {
  // ioredis uses `export = Redis` (CJS) — must use require for Node16 moduleResolution
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RedisConstructor = require("ioredis") as new (url: string) => Redis;
  return new RedisConstructor(url);
}

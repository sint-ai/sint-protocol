/**
 * SINT Gateway Server — Redis Connection Factory.
 *
 * Isolates the ioredis import to handle CJS/ESM interop.
 * Only called when SINT_CACHE=redis is configured.
 *
 * @module @sint/gateway-server/redis-factory
 */

import { createRequire } from "node:module";
import type { Redis } from "ioredis";

const require = createRequire(import.meta.url);

/**
 * Create a new Redis connection.
 * Uses createRequire(import.meta.url) to pull ioredis' CJS export from an ESM module.
 */
export function createRedisClient(url: string): Redis {
  const RedisConstructor = require("ioredis") as new (url: string) => Redis;
  return new RedisConstructor(url);
}

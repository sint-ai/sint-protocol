/**
 * SINT Gateway Server — Configuration tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";

describe("Configuration", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all SINT env vars
    delete process.env.SINT_PORT;
    delete process.env.SINT_STORE;
    delete process.env.SINT_CACHE;
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    delete process.env.SINT_API_KEY;
    delete process.env.SINT_REQUIRE_SIGNATURES;
    delete process.env.SINT_RATE_LIMIT;
    delete process.env.SINT_WS_ALLOW_QUERY_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("loads defaults when no env vars set", () => {
    const config = loadConfig();
    expect(config.port).toBe(3100);
    expect(config.store).toBe("memory");
    expect(config.cache).toBe("memory");
    expect(config.requireSignatures).toBe(false);
    expect(config.rateLimitMax).toBe(100);
    expect(config.wsAllowQueryApiKey).toBe(true);
    expect(config.apiKey).toBeUndefined();
  });

  it("reads env var overrides", () => {
    process.env.SINT_PORT = "8080";
    process.env.SINT_API_KEY = "my-key";
    process.env.SINT_REQUIRE_SIGNATURES = "true";
    process.env.SINT_RATE_LIMIT = "50";
    process.env.SINT_WS_ALLOW_QUERY_API_KEY = "false";

    const config = loadConfig();
    expect(config.port).toBe(8080);
    expect(config.apiKey).toBe("my-key");
    expect(config.requireSignatures).toBe(true);
    expect(config.rateLimitMax).toBe(50);
    expect(config.wsAllowQueryApiKey).toBe(false);
  });

  it("throws when SINT_STORE=postgres without DATABASE_URL", () => {
    process.env.SINT_STORE = "postgres";
    expect(() => loadConfig()).toThrow("DATABASE_URL is required");
  });

  it("throws when SINT_CACHE=redis without REDIS_URL", () => {
    process.env.SINT_CACHE = "redis";
    expect(() => loadConfig()).toThrow("REDIS_URL is required");
  });

  it("accepts postgres config with DATABASE_URL", () => {
    process.env.SINT_STORE = "postgres";
    process.env.DATABASE_URL = "postgresql://localhost:5432/sint";
    const config = loadConfig();
    expect(config.store).toBe("postgres");
    expect(config.databaseUrl).toBe("postgresql://localhost:5432/sint");
  });

  it("accepts redis config with REDIS_URL", () => {
    process.env.SINT_CACHE = "redis";
    process.env.REDIS_URL = "redis://localhost:6379";
    const config = loadConfig();
    expect(config.cache).toBe("redis");
    expect(config.redisUrl).toBe("redis://localhost:6379");
  });
});

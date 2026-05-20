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
    delete process.env.SINT_ENV;
    delete process.env.NODE_ENV;
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
    expect(config.env).toBe("development");
    expect(config.port).toBe(3100);
    expect(config.store).toBe("memory");
    expect(config.cache).toBe("memory");
    expect(config.requireSignatures).toBe(false);
    expect(config.rateLimitMax).toBe(100);
    expect(config.wsAllowQueryApiKey).toBe(true);
    expect(config.apiKey).toBeUndefined();
  });

  it("reads env var overrides", () => {
    process.env.SINT_ENV = "test";
    process.env.SINT_PORT = "8080";
    process.env.SINT_API_KEY = "my-key";
    process.env.SINT_REQUIRE_SIGNATURES = "true";
    process.env.SINT_RATE_LIMIT = "50";
    process.env.SINT_WS_ALLOW_QUERY_API_KEY = "false";

    const config = loadConfig();
    expect(config.env).toBe("test");
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

  it("throws on invalid numeric env vars", () => {
    process.env.SINT_PORT = "0";
    expect(() => loadConfig()).toThrow("SINT_PORT must be a positive integer");

    process.env.SINT_PORT = "3100";
    process.env.SINT_RATE_LIMIT = "abc";
    expect(() => loadConfig()).toThrow("SINT_RATE_LIMIT must be a positive integer");
  });

  it("throws on invalid boolean env vars", () => {
    process.env.SINT_REQUIRE_SIGNATURES = "yes";
    expect(() => loadConfig()).toThrow('SINT_REQUIRE_SIGNATURES must be "true" or "false"');
  });

  it("requires durable stores and auth hardening in production", () => {
    process.env.SINT_ENV = "production";
    expect(() => loadConfig()).toThrow("SINT_STORE=postgres is required");

    process.env.SINT_STORE = "postgres";
    process.env.DATABASE_URL = "postgresql://localhost:5432/sint";
    expect(() => loadConfig()).toThrow("SINT_CACHE=redis is required");

    process.env.SINT_CACHE = "redis";
    process.env.REDIS_URL = "redis://localhost:6379";
    expect(() => loadConfig()).toThrow("SINT_API_KEY is required");

    process.env.SINT_API_KEY = "prod-key";
    expect(() => loadConfig()).toThrow("SINT_REQUIRE_SIGNATURES=true is required");

    process.env.SINT_REQUIRE_SIGNATURES = "true";
    expect(() => loadConfig()).toThrow("SINT_WS_ALLOW_QUERY_API_KEY=false is required");
  });

  it("accepts hardened production config", () => {
    process.env.NODE_ENV = "production";
    process.env.SINT_STORE = "postgres";
    process.env.SINT_CACHE = "redis";
    process.env.DATABASE_URL = "postgresql://localhost:5432/sint";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.SINT_API_KEY = "prod-key";
    process.env.SINT_REQUIRE_SIGNATURES = "true";
    process.env.SINT_WS_ALLOW_QUERY_API_KEY = "false";

    const config = loadConfig();
    expect(config.env).toBe("production");
    expect(config.store).toBe("postgres");
    expect(config.cache).toBe("redis");
    expect(config.apiKey).toBe("prod-key");
    expect(config.requireSignatures).toBe(true);
    expect(config.wsAllowQueryApiKey).toBe(false);
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

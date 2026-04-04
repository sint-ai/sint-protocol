/**
 * SINT MCP — Config tests.
 */

import { describe, it, expect, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";

describe("Config", () => {
  const envBackup: Record<string, string | undefined> = {};

  function setEnv(key: string, value: string) {
    envBackup[key] = process.env[key];
    process.env[key] = value;
  }

  afterEach(() => {
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("loads defaults when no config source", () => {
    const config = loadConfig([]);
    expect(config.transport).toBe("stdio");
    expect(config.port).toBe(3200);
    expect(config.defaultPolicy).toBe("cautious");
    expect(config.approvalTimeoutMs).toBe(120_000);
    expect(config.servers).toEqual({});
  });

  it("reads transport from CLI args", () => {
    const config = loadConfig(["--sse"]);
    expect(config.transport).toBe("sse");
  });

  it("reads port from CLI args", () => {
    const config = loadConfig(["--port", "4000"]);
    expect(config.port).toBe(4000);
  });

  it("reads policy from CLI args", () => {
    const config = loadConfig(["--policy", "strict"]);
    expect(config.defaultPolicy).toBe("strict");
  });

  it("reads timeout from CLI args", () => {
    const config = loadConfig(["--timeout", "60000"]);
    expect(config.approvalTimeoutMs).toBe(60000);
  });

  it("environment variables override defaults", () => {
    setEnv("SINT_MCP_PORT", "5000");
    setEnv("SINT_MCP_TRANSPORT", "sse");
    setEnv("SINT_MCP_POLICY", "strict");

    const config = loadConfig([]);
    expect(config.port).toBe(5000);
    expect(config.transport).toBe("sse");
    expect(config.defaultPolicy).toBe("strict");
  });

  it("CLI args override env vars", () => {
    setEnv("SINT_MCP_PORT", "5000");
    const config = loadConfig(["--port", "6000"]);
    expect(config.port).toBe(6000);
  });

  it("handles combined CLI args", () => {
    const config = loadConfig(["--sse", "--port", "3300", "--policy", "permissive", "--timeout", "30000"]);
    expect(config.transport).toBe("sse");
    expect(config.port).toBe(3300);
    expect(config.defaultPolicy).toBe("permissive");
    expect(config.approvalTimeoutMs).toBe(30000);
  });
});

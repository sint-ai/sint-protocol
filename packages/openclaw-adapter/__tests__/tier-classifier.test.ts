import { describe, it, expect } from "vitest";
import {
  classifyToolCall,
  classifyMCPCall,
  classifyNodeAction,
} from "../src/tier-classifier.js";

describe("classifyToolCall", () => {
  it("classifies read-only tools as T0", () => {
    expect(classifyToolCall({ tool: "read", params: {} })).toBe("T0");
    expect(classifyToolCall({ tool: "web_search", params: {} })).toBe("T0");
    expect(classifyToolCall({ tool: "web_fetch", params: {} })).toBe("T0");
    expect(classifyToolCall({ tool: "image", params: {} })).toBe("T0");
    expect(classifyToolCall({ tool: "pdf", params: {} })).toBe("T0");
    expect(classifyToolCall({ tool: "memory_search", params: {} })).toBe("T0");
    expect(classifyToolCall({ tool: "session_status", params: {} })).toBe("T0");
  });

  it("classifies process.list as T0 but process.write as T2", () => {
    expect(
      classifyToolCall({ tool: "process", params: { action: "list" } })
    ).toBe("T0");
    expect(
      classifyToolCall({ tool: "process", params: { action: "poll" } })
    ).toBe("T0");
    // process.write is not in T0_ACTIONS, falls through to T2 (unknown tool default)
    expect(
      classifyToolCall({ tool: "process", params: { action: "write" } })
    ).toBe("T2");
  });

  it("classifies write/edit as T1", () => {
    expect(classifyToolCall({ tool: "write", params: {} })).toBe("T1");
    expect(classifyToolCall({ tool: "edit", params: {} })).toBe("T1");
  });

  it("classifies messaging tools as T2", () => {
    expect(
      classifyToolCall({ tool: "message", params: { action: "send" } })
    ).toBe("T2");
    expect(classifyToolCall({ tool: "tts", params: {} })).toBe("T2");
    expect(classifyToolCall({ tool: "sessions_spawn", params: {} })).toBe("T2");
    expect(
      classifyToolCall({ tool: "cron", params: { action: "add" } })
    ).toBe("T2");
  });

  it("classifies exec and canvas as T3", () => {
    expect(
      classifyToolCall({ tool: "exec", params: { command: "ls" } })
    ).toBe("T3");
    expect(
      classifyToolCall({
        tool: "canvas",
        params: { action: "eval", javaScript: "alert(1)" },
      })
    ).toBe("T3");
  });

  it("bumps elevated tools to T2 minimum", () => {
    expect(
      classifyToolCall({ tool: "read", params: {}, elevated: true })
    ).toBe("T2");
    expect(
      classifyToolCall({ tool: "write", params: {}, elevated: true })
    ).toBe("T2");
  });

  it("defaults unknown tools to T2", () => {
    expect(
      classifyToolCall({ tool: "unknown_future_tool", params: {} })
    ).toBe("T2");
  });

  it("classifies cron.status as T0", () => {
    expect(
      classifyToolCall({ tool: "cron", params: { action: "status" } })
    ).toBe("T0");
    expect(
      classifyToolCall({ tool: "cron", params: { action: "list" } })
    ).toBe("T0");
  });

  it("classifies gateway.config.get as T0", () => {
    expect(
      classifyToolCall({
        tool: "gateway",
        params: { action: "config.get" },
      })
    ).toBe("T0");
  });

  it("classifies nodes.status as T0", () => {
    expect(
      classifyToolCall({ tool: "nodes", params: { action: "status" } })
    ).toBe("T0");
    expect(
      classifyToolCall({ tool: "nodes", params: { action: "describe" } })
    ).toBe("T0");
  });
});

describe("classifyMCPCall", () => {
  it("classifies read MCP tools as T0", () => {
    expect(
      classifyMCPCall({ server: "github", tool: "list_repos", args: {} })
    ).toBe("T0");
    expect(
      classifyMCPCall({ server: "db", tool: "search_records", args: {} })
    ).toBe("T0");
    expect(
      classifyMCPCall({ server: "api", tool: "fetch_data", args: {} })
    ).toBe("T0");
  });

  it("classifies write MCP tools as T1", () => {
    expect(
      classifyMCPCall({ server: "github", tool: "create_issue", args: {} })
    ).toBe("T1");
    expect(
      classifyMCPCall({ server: "db", tool: "update_record", args: {} })
    ).toBe("T1");
  });

  it("classifies destructive MCP tools as T2", () => {
    expect(
      classifyMCPCall({
        server: "github",
        tool: "delete_branch",
        args: {},
      })
    ).toBe("T2");
    expect(
      classifyMCPCall({ server: "ci", tool: "deploy_production", args: {} })
    ).toBe("T2");
    expect(
      classifyMCPCall({ server: "email", tool: "send_email", args: {} })
    ).toBe("T2");
  });

  it("defaults unknown MCP tools to T2", () => {
    expect(
      classifyMCPCall({
        server: "custom",
        tool: "do_thing",
        args: {},
      })
    ).toBe("T2");
  });
});

describe("classifyNodeAction", () => {
  it("classifies status/describe as T0", () => {
    expect(
      classifyNodeAction({
        nodeId: "iphone",
        action: "status",
        params: {},
      })
    ).toBe("T0");
    expect(
      classifyNodeAction({
        nodeId: "iphone",
        action: "describe",
        params: {},
      })
    ).toBe("T0");
  });

  it("classifies physical actions as T3", () => {
    expect(
      classifyNodeAction({
        nodeId: "iphone",
        action: "camera_snap",
        params: {},
      })
    ).toBe("T3");
    expect(
      classifyNodeAction({
        nodeId: "mac",
        action: "screen_record",
        params: {},
      })
    ).toBe("T3");
    expect(
      classifyNodeAction({
        nodeId: "iphone",
        action: "location_get",
        params: {},
      })
    ).toBe("T3");
    expect(
      classifyNodeAction({
        nodeId: "robot",
        action: "invoke",
        params: {},
      })
    ).toBe("T3");
  });

  it("defaults unknown node actions to T3", () => {
    expect(
      classifyNodeAction({
        nodeId: "drone",
        action: "arm_motors",
        params: {},
      })
    ).toBe("T3");
  });
});

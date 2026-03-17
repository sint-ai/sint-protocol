/**
 * SINT Bridge-MCP — Session Manager unit tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { MCPSessionManager } from "../src/mcp-session.js";

describe("MCPSessionManager", () => {
  let manager: MCPSessionManager;
  const agentId = "a".repeat(64);
  const tokenId = "01905f7c-0000-7000-8000-000000000001";

  beforeEach(() => {
    manager = new MCPSessionManager();
  });

  it("creates a session with correct fields", () => {
    const session = manager.create({
      agentId,
      tokenId,
      serverName: "filesystem",
    });

    expect(session.agentId).toBe(agentId);
    expect(session.tokenId).toBe(tokenId);
    expect(session.serverName).toBe("filesystem");
    expect(session.sessionId).toBeDefined();
    expect(session.createdAt).toBeDefined();
    expect(session.recentActions).toEqual([]);
  });

  it("get() returns session by ID", () => {
    const session = manager.create({ agentId, tokenId, serverName: "fs" });
    expect(manager.get(session.sessionId)).toBeDefined();
    expect(manager.get(session.sessionId)!.sessionId).toBe(session.sessionId);
  });

  it("get() returns undefined for unknown ID", () => {
    expect(manager.get("unknown")).toBeUndefined();
  });

  it("getByAgent() returns all sessions for an agent", () => {
    manager.create({ agentId, tokenId, serverName: "fs" });
    manager.create({ agentId, tokenId, serverName: "db" });
    manager.create({ agentId: "b".repeat(64), tokenId, serverName: "fs" });

    const sessions = manager.getByAgent(agentId);
    expect(sessions).toHaveLength(2);
  });

  it("recordAction() adds to recent actions", () => {
    const session = manager.create({ agentId, tokenId, serverName: "fs" });
    manager.recordAction(session.sessionId, "filesystem.readFile");
    manager.recordAction(session.sessionId, "filesystem.writeFile");

    const actions = manager.getRecentActions(session.sessionId);
    expect(actions).toEqual(["filesystem.readFile", "filesystem.writeFile"]);
  });

  it("recordAction() trims to maxRecentActions", () => {
    const session = manager.create({
      agentId,
      tokenId,
      serverName: "fs",
      maxRecentActions: 3,
    });

    manager.recordAction(session.sessionId, "a");
    manager.recordAction(session.sessionId, "b");
    manager.recordAction(session.sessionId, "c");
    manager.recordAction(session.sessionId, "d");

    const actions = manager.getRecentActions(session.sessionId);
    expect(actions).toEqual(["b", "c", "d"]);
  });

  it("remove() deletes a session", () => {
    const session = manager.create({ agentId, tokenId, serverName: "fs" });
    expect(manager.size).toBe(1);

    const removed = manager.remove(session.sessionId);
    expect(removed).toBe(true);
    expect(manager.size).toBe(0);
    expect(manager.get(session.sessionId)).toBeUndefined();
  });

  it("clear() removes all sessions", () => {
    manager.create({ agentId, tokenId, serverName: "fs" });
    manager.create({ agentId, tokenId, serverName: "db" });
    expect(manager.size).toBe(2);

    manager.clear();
    expect(manager.size).toBe(0);
  });
});

/**
 * SINT Bridge-MCP — Session Manager.
 *
 * Manages per-agent MCP sessions with token binding and
 * recent action tracking for forbidden combo detection.
 *
 * @module @sint/bridge-mcp/mcp-session
 */

import type { Ed25519PublicKey, ISO8601, UUIDv7 } from "@sint/core";
import type { MCPSession } from "./types.js";

/** Configuration for creating a new MCP session. */
export interface CreateSessionOptions {
  readonly agentId: Ed25519PublicKey;
  readonly tokenId: UUIDv7;
  readonly serverName: string;
  readonly maxRecentActions?: number;
}

/** Default number of recent actions to track per session. */
const DEFAULT_MAX_RECENT_ACTIONS = 20;

let sessionCounter = 0;

function generateSessionId(): string {
  return `mcp-session-${Date.now()}-${++sessionCounter}`;
}

function nowISO8601(): ISO8601 {
  return new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

/**
 * MCP Session Manager — tracks active sessions per agent.
 *
 * Each session binds an agent to a capability token and an MCP server.
 * It also tracks recent actions for forbidden combo detection.
 *
 * @example
 * ```ts
 * const manager = new MCPSessionManager();
 * const session = manager.create({
 *   agentId: agent.publicKey,
 *   tokenId: token.tokenId,
 *   serverName: "filesystem",
 * });
 *
 * manager.recordAction(session.sessionId, "filesystem.readFile");
 * const recent = manager.getRecentActions(session.sessionId);
 * ```
 */
export class MCPSessionManager {
  private readonly sessions = new Map<string, MCPSession>();

  /**
   * Create a new MCP session.
   */
  create(options: CreateSessionOptions): MCPSession {
    const session: MCPSession = {
      sessionId: generateSessionId(),
      agentId: options.agentId,
      tokenId: options.tokenId,
      serverName: options.serverName,
      createdAt: nowISO8601(),
      recentActions: [],
      maxRecentActions: options.maxRecentActions ?? DEFAULT_MAX_RECENT_ACTIONS,
    };

    this.sessions.set(session.sessionId, session);
    return session;
  }

  /**
   * Get a session by ID.
   */
  get(sessionId: string): MCPSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions for an agent.
   */
  getByAgent(agentId: Ed25519PublicKey): readonly MCPSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.agentId === agentId,
    );
  }

  /**
   * Record a tool action in the session's recent actions list.
   * Maintains a sliding window for forbidden combo detection.
   */
  recordAction(sessionId: string, toolId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.recentActions.push(toolId);

    // Trim to max size (sliding window)
    while (session.recentActions.length > session.maxRecentActions) {
      session.recentActions.shift();
    }
  }

  /**
   * Get the recent actions for a session.
   */
  getRecentActions(sessionId: string): readonly string[] {
    return this.sessions.get(sessionId)?.recentActions ?? [];
  }

  /**
   * Remove a session.
   */
  remove(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Number of active sessions.
   */
  get size(): number {
    return this.sessions.size;
  }

  /**
   * Clear all sessions.
   */
  clear(): void {
    this.sessions.clear();
  }
}

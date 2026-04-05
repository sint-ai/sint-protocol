/**
 * Default tier classifier for OpenClaw actions.
 *
 * Maps OpenClaw tools, MCP calls, and node actions to SINT safety tiers:
 *   T0 — Observe only (read, search, status)
 *   T1 — Reversible digital actions (write files, edit, git)
 *   T2 — Requires approval (deploy, exec with elevated, delete, send messages)
 *   T3 — Physical/irreversible (node actions, system.run, destructive ops)
 */

import type {
  OpenClawToolCall,
  OpenClawMCPCall,
  OpenClawNodeAction,
  SintTier,
} from "./types.js";

/** T0: observe-only tools (always T0 regardless of action). */
const T0_TOOLS = new Set([
  "read",
  "web_search",
  "web_fetch",
  "image",
  "pdf",
  "memory_search",
  "memory_get",
  "session_status",
  "sessions_list",
  "sessions_history",
  "agents_list",
]);

/** Tools where tier depends on the specific action param. */
const ACTION_DEPENDENT_TOOLS = new Set([
  "process",
  "subagents",
  "message",
  "cron",
  "gateway",
  "nodes",
]);

/** T0 actions for tools that have mixed tiers depending on action. */
const T0_ACTIONS: Record<string, Set<string>> = {
  process: new Set(["list", "poll", "log"]),
  subagents: new Set(["list"]),
  message: new Set(["poll"]),
  cron: new Set(["status", "list", "runs"]),
  gateway: new Set(["config.get", "config.schema.lookup"]),
  nodes: new Set(["status", "describe", "pending", "device_status", "device_info"]),
};

/** T1: reversible digital actions. */
const T1_TOOLS = new Set([
  "write",
  "edit",
]);

/** T2: requires approval. */
const T2_TOOLS = new Set([
  "message",         // send action
  "tts",
  "image_generate",
  "sessions_spawn",
  "sessions_send",
  "cron",            // add/update/remove
]);

/** T3: physical or irreversible. */
const T3_TOOLS = new Set([
  "exec",            // shell commands
  "canvas",          // eval (code execution in browser)
]);

/** T3 node actions (physical device control). */
const T3_NODE_ACTIONS = new Set([
  "camera_snap",
  "camera_clip",
  "camera_list",
  "screen_record",
  "location_get",
  "invoke",          // system.run on device
  "notify",
]);

/**
 * Classify an OpenClaw tool call into a SINT safety tier.
 */
export function classifyToolCall(call: OpenClawToolCall): SintTier {
  const { tool, params, elevated } = call;

  // Elevated always bumps to T2 minimum
  if (elevated) {
    return isPhysicalTool(tool) ? "T3" : "T2";
  }

  // Pure T0 tools (always safe)
  if (T0_TOOLS.has(tool)) return "T0";

  // Action-dependent tools: check if the specific action is T0
  if (ACTION_DEPENDENT_TOOLS.has(tool)) {
    const t0Actions = T0_ACTIONS[tool];
    if (t0Actions) {
      const action = (params?.action as string) ?? "";
      if (t0Actions.has(action)) return "T0";
    }
    // Non-T0 action on an action-dependent tool: fall through to other checks
  }

  // T1 tools
  if (T1_TOOLS.has(tool)) return "T1";

  // T3 tools (exec, canvas eval)
  if (T3_TOOLS.has(tool)) {
    // exec with specific safe commands could be T1, but default to T3
    return "T3";
  }

  // T2 tools (messaging, spawning, cron management)
  if (T2_TOOLS.has(tool)) return "T2";

  // Unknown tools default to T2 (safe default)
  return "T2";
}

/**
 * Classify an MCP server tool call.
 * MCP calls are external tools — default T2, escalate to T3 if writing/executing.
 */
export function classifyMCPCall(call: OpenClawMCPCall): SintTier {
  const toolLower = call.tool.toLowerCase();

  // Read-only MCP tools
  if (
    toolLower.includes("read") ||
    toolLower.includes("get") ||
    toolLower.includes("list") ||
    toolLower.includes("search") ||
    toolLower.includes("query") ||
    toolLower.includes("fetch")
  ) {
    return "T0";
  }

  // Write/mutate MCP tools
  if (
    toolLower.includes("write") ||
    toolLower.includes("create") ||
    toolLower.includes("update") ||
    toolLower.includes("edit") ||
    toolLower.includes("set")
  ) {
    return "T1";
  }

  // Destructive/execute MCP tools
  if (
    toolLower.includes("delete") ||
    toolLower.includes("remove") ||
    toolLower.includes("execute") ||
    toolLower.includes("run") ||
    toolLower.includes("deploy") ||
    toolLower.includes("send")
  ) {
    return "T2";
  }

  // Default: T2 for unknown MCP tools
  return "T2";
}

/**
 * Classify a node action (physical device).
 * All node actions are T3 by default (physical world interaction).
 */
export function classifyNodeAction(action: OpenClawNodeAction): SintTier {
  // Status/describe are T0
  if (action.action === "status" || action.action === "describe") {
    return "T0";
  }

  // Physical actions are T3
  if (T3_NODE_ACTIONS.has(action.action)) {
    return "T3";
  }

  // Default for unknown node actions
  return "T3";
}

function isPhysicalTool(tool: string): boolean {
  return tool === "nodes" || tool === "canvas";
}

/**
 * SINT MCP — Operator Interface Tools.
 *
 * These tools provide operator interface control: voice/TTS output, HUD panel
 * updates, memory operations, proactive notifications, and mode management.
 * All tools are prefixed with "sint__" and handled without policy enforcement
 * (they are operator-facing, not agent-facing actions).
 *
 * @module @sint/mcp/tools/interface-tools
 */

import { InterfaceStateManager } from "@pshkv/interface-bridge";
import type { MemoryBank } from "@pshkv/memory";
import type { LedgerWriter } from "@pshkv/gate-evidence-ledger";

/** Extended SINT tool context for interface tools. */
export interface InterfaceToolContext {
  readonly interfaceState: InterfaceStateManager;
  readonly memoryBank?: MemoryBank | undefined;
  readonly ledger: LedgerWriter;
  readonly agentPublicKey: string;
}

/** Interface tool definitions for tools/list. */
export function getInterfaceToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  return [
    {
      name: "sint__interface_status",
      description:
        "Return current operator interface state: mode, listening/speaking flags, active HUD panels, memory context size, and session ID",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "sint__recall_memory",
      description: "Search the memory bank for entries matching a query string. Returns matching entries as JSON.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query to match against memory entries" },
          limit: { type: "number", description: "Maximum number of results to return (default: 10)" },
        },
        required: ["query"],
      },
    },
    {
      name: "sint__speak",
      description: "Schedule TTS voice output to the operator with a configurable priority level",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Text to speak aloud to the operator" },
          priority: {
            type: "string",
            enum: ["low", "normal", "urgent"],
            description: "Voice output priority (default: normal)",
          },
        },
        required: ["text"],
      },
    },
    {
      name: "sint__show_hud",
      description: "Update a HUD panel with new data. Emits an operator.hud.updated event.",
      inputSchema: {
        type: "object",
        properties: {
          panel: {
            type: "string",
            enum: ["approvals", "audit", "context", "memory"],
            description: "Which HUD panel to update",
          },
          data: { description: "Data to display in the panel (any JSON value)" },
        },
        required: ["panel"],
      },
    },
    {
      name: "sint__store_memory",
      description: "Store an entry in the memory bank with optional tags and persistence",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "Unique key for the memory entry" },
          value: { description: "Value to store (any JSON value)" },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Optional tags for categorisation and search",
          },
          persist: {
            type: "boolean",
            description: "Whether to persist beyond this session (default: false)",
          },
        },
        required: ["key", "value"],
      },
    },
    {
      name: "sint__notify",
      description: "Send a proactive notification to the operator, optionally with an actionable button",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "Notification message text" },
          action: {
            type: "object",
            description: "Optional action button attached to the notification",
            properties: {
              label: { type: "string", description: "Button label" },
              tool: { type: "string", description: "MCP tool name to invoke on click" },
              args: { description: "Arguments to pass to the tool" },
            },
            required: ["label", "tool", "args"],
          },
        },
        required: ["message"],
      },
    },
    {
      name: "sint__interface_mode",
      description:
        "Change the operator interface display mode: hud, compact, voice-only, or silent",
      inputSchema: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["hud", "compact", "voice-only", "silent"],
            description: "Target interface mode",
          },
        },
        required: ["mode"],
      },
    },
  ];
}

/** Check if a tool name is an interface tool. */
export function isInterfaceTool(name: string): boolean {
  return (
    name === "sint__interface_status" ||
    name === "sint__recall_memory" ||
    name === "sint__speak" ||
    name === "sint__show_hud" ||
    name === "sint__store_memory" ||
    name === "sint__notify" ||
    name === "sint__interface_mode"
  );
}

/**
 * Handle an operator interface tool call.
 */
export async function handleInterfaceTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: InterfaceToolContext,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  switch (toolName) {
    case "sint__interface_status":
      return handleInterfaceStatus(ctx);
    case "sint__recall_memory":
      return handleRecallMemory(args, ctx);
    case "sint__speak":
      return handleSpeak(args, ctx);
    case "sint__show_hud":
      return handleShowHud(args, ctx);
    case "sint__store_memory":
      return handleStoreMemory(args, ctx);
    case "sint__notify":
      return handleNotify(args, ctx);
    case "sint__interface_mode":
      return handleInterfaceMode(args, ctx);
    default:
      return text(`Unknown interface tool: ${toolName}`);
  }
}

function text(content: string): { content: Array<{ type: string; text: string }> } {
  return { content: [{ type: "text", text: content }] };
}

function nowISO(): string {
  return new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function handleInterfaceStatus(ctx: InterfaceToolContext) {
  const state = ctx.interfaceState.getState();
  return text(JSON.stringify(state, null, 2));
}

async function handleRecallMemory(
  args: Record<string, unknown>,
  ctx: InterfaceToolContext,
) {
  const query = args["query"] as string | undefined;
  if (!query) {
    return text("Error: query is required");
  }

  const limit = (args["limit"] as number | undefined) ?? 10;

  if (!ctx.memoryBank) {
    console.error(`Recalled 0 memories for query: '${query}'`);
    return text(JSON.stringify([], null, 2));
  }

  const entries = await ctx.memoryBank.recall(query, limit);
  console.error(`Recalled ${entries.length} memories for query: '${query}'`);
  return text(JSON.stringify(entries, null, 2));
}

function handleSpeak(args: Record<string, unknown>, ctx: InterfaceToolContext) {
  const speakText = args["text"] as string | undefined;
  if (!speakText) {
    return text("Error: text is required");
  }

  const priority = (args["priority"] as "low" | "normal" | "urgent" | undefined) ?? "normal";
  const timestamp = nowISO();

  ctx.interfaceState.setSpeaking(true);

  // Emit voice output event to ledger
  ctx.ledger.append({
    eventType: "operator.voice.output" as any,
    agentId: ctx.agentPublicKey,
    tokenId: "interface",
    payload: { text: speakText, priority, timestamp },
  });

  // Speaking flag is async in real TTS; reset to false immediately in simulation
  ctx.interfaceState.setSpeaking(false);

  return text(JSON.stringify({ spoken: true, text: speakText, priority, timestamp }, null, 2));
}

function handleShowHud(args: Record<string, unknown>, ctx: InterfaceToolContext) {
  const panel = args["panel"] as "approvals" | "audit" | "context" | "memory" | undefined;
  if (!panel) {
    return text("Error: panel is required");
  }

  const timestamp = nowISO();

  ctx.interfaceState.showPanel(panel);

  ctx.ledger.append({
    eventType: "operator.hud.updated" as any,
    agentId: ctx.agentPublicKey,
    tokenId: "interface",
    payload: { panel, timestamp },
  });

  return text(JSON.stringify({ updated: true, panel, timestamp }, null, 2));
}

async function handleStoreMemory(
  args: Record<string, unknown>,
  ctx: InterfaceToolContext,
) {
  const key = args["key"] as string | undefined;
  const value = args["value"];
  if (!key || value === undefined) {
    return text("Error: key and value are required");
  }

  const tags = (args["tags"] as string[] | undefined) ?? [];
  const persist = (args["persist"] as boolean | undefined) ?? false;

  if (!ctx.memoryBank) {
    return text(JSON.stringify({ stored: true, key, persist }, null, 2));
  }

  const entry = await ctx.memoryBank.store(key, value, tags, persist);

  return text(
    JSON.stringify(
      {
        stored: true,
        key,
        persist,
        ledgerEventId: entry.ledgerEventId,
      },
      null,
      2,
    ),
  );
}

function handleNotify(args: Record<string, unknown>, ctx: InterfaceToolContext) {
  const message = args["message"] as string | undefined;
  if (!message) {
    return text("Error: message is required");
  }

  const action = args["action"] as
    | { label: string; tool: string; args: unknown }
    | undefined;
  const timestamp = nowISO();

  ctx.ledger.append({
    eventType: "operator.notification" as any,
    agentId: ctx.agentPublicKey,
    tokenId: "interface",
    payload: { message, action, timestamp },
  });

  return text(JSON.stringify({ notified: true, message, timestamp }, null, 2));
}

function handleInterfaceMode(args: Record<string, unknown>, ctx: InterfaceToolContext) {
  const mode = args["mode"] as "hud" | "compact" | "voice-only" | "silent" | undefined;
  if (!mode) {
    return text("Error: mode is required");
  }

  const timestamp = nowISO();
  ctx.interfaceState.setMode(mode);

  ctx.ledger.append({
    eventType: "operator.interface.mode.changed" as any,
    agentId: ctx.agentPublicKey,
    tokenId: "interface",
    payload: { mode, timestamp },
  });

  return text(JSON.stringify({ mode, changed: true, timestamp }, null, 2));
}

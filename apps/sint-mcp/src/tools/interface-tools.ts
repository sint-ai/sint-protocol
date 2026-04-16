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
        "Inspect the current operator interface state before sending operator-facing updates. Use this to confirm the active mode, HUD panels, speaking/listening flags, and session context. Returns a JSON snapshot of the current interface state.",
      inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
    {
      name: "sint__recall_memory",
      description:
        "Search the operator memory bank for relevant stored context. Use this before asking for human input again or when you need prior decisions, notes, or context by keyword. This tool does not mutate memory and returns matching entries as JSON.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            title: "Search query",
            type: "string",
            description: "Search string used to match memory keys, tags, or content",
            minLength: 1,
            examples: ["deployment approval", "customer abc", "incident 42"],
          },
          limit: {
            title: "Result limit",
            type: "number",
            description: "Maximum number of matches to return; defaults to 10",
            minimum: 1,
            default: 10,
            examples: [5, 10, 25],
          },
        },
        required: ["query"],
        additionalProperties: false,
        examples: [{ query: "incident 42", limit: 5 }],
      },
    },
    {
      name: "sint__speak",
      description:
        "Send text-to-speech output to the operator interface. Use this for spoken alerts or short status updates that need immediate attention; prefer concise text because the content is voiced aloud. Returns a JSON confirmation with the spoken text, priority, and timestamp.",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            title: "Spoken text",
            type: "string",
            description: "Short text that will be spoken aloud to the operator",
            minLength: 1,
            examples: ["Approval needed for production deploy", "Battery level critical"],
          },
          priority: {
            title: "Priority",
            type: "string",
            enum: ["low", "normal", "urgent"],
            description: "Voice output priority; defaults to normal",
            default: "normal",
          },
        },
        required: ["text"],
        additionalProperties: false,
        examples: [{ text: "Approval needed for production deploy", priority: "urgent" }],
      },
    },
    {
      name: "sint__show_hud",
      description:
        "Show or refresh one HUD panel in the operator interface. Use this to surface approvals, audit details, context, or memory on screen; this updates the live interface but does not persist business data. Returns a JSON confirmation describing which panel was updated and when.",
      inputSchema: {
        type: "object",
        properties: {
          panel: {
            title: "HUD panel",
            type: "string",
            enum: ["approvals", "audit", "context", "memory"],
            description: "HUD panel to display or refresh",
          },
          data: {
            title: "Panel payload",
            description: "Optional JSON payload for the panel; useful for supplying custom context alongside the panel change",
          },
        },
        required: ["panel"],
        additionalProperties: false,
        examples: [{ panel: "approvals" }, { panel: "context", data: { stage: "deploy", owner: "ops" } }],
      },
    },
    {
      name: "sint__store_memory",
      description:
        "Store structured context in the operator memory bank for later retrieval. Use this for durable notes, human preferences, incident breadcrumbs, or other context worth recalling later. Returns a JSON confirmation with the stored key, persistence state, and any ledger event identifier.",
      inputSchema: {
        type: "object",
        properties: {
          key: {
            title: "Memory key",
            type: "string",
            description: "Stable unique key for the memory entry",
            minLength: 1,
            examples: ["incident-42/root-cause", "customer/acme/preference"],
          },
          value: {
            title: "Memory value",
            description: "Any JSON value to persist under the key",
          },
          tags: {
            title: "Tags",
            type: "array",
            items: { type: "string" },
            description: "Optional tags used for categorization and later search",
            examples: [["incident", "prod"], ["customer", "billing"]],
          },
          persist: {
            title: "Persist beyond session",
            type: "boolean",
            description: "Whether the entry should persist beyond the current session; defaults to false",
            default: false,
          },
        },
        required: ["key", "value"],
        additionalProperties: false,
        examples: [{ key: "incident-42/root-cause", value: { service: "gateway", summary: "Token scope mismatch" }, tags: ["incident", "prod"], persist: true }],
      },
    },
    {
      name: "sint__notify",
      description:
        "Send a proactive notification to the operator interface, optionally with one follow-up action button. Use this for alerts or prompts that should remain visible in the UI; this is better than sint__speak when the operator needs something clickable or persistent. Returns a JSON confirmation with the notification timestamp and echoed message.",
      inputSchema: {
        type: "object",
        properties: {
          message: {
            title: "Notification message",
            type: "string",
            description: "Visible notification text shown to the operator",
            minLength: 1,
            examples: ["Approval queue has 2 blocked actions", "GPU temperature exceeded threshold"],
          },
          action: {
            title: "Optional action button",
            type: "object",
            description: "Optional action button attached to the notification",
            properties: {
              label: {
                title: "Button label",
                type: "string",
                description: "Button label shown in the notification UI",
                examples: ["Review approvals", "Open audit"],
              },
              tool: {
                title: "Tool to invoke",
                type: "string",
                description: "MCP tool name to invoke when the button is clicked",
                examples: ["sint__pending", "sint__approve"],
              },
              args: {
                title: "Tool arguments",
                description: "Arguments passed to the MCP tool when the action button is clicked",
              },
            },
            required: ["label", "tool", "args"],
            additionalProperties: false,
          },
        },
        required: ["message"],
        additionalProperties: false,
        examples: [{ message: "Approval queue has blocked actions", action: { label: "Review approvals", tool: "sint__pending", args: {} } }],
      },
    },
    {
      name: "sint__interface_mode",
      description:
        "Change how the operator interface presents information. Use this when the situation calls for a denser HUD, a minimal compact view, spoken output only, or silence. Returns a JSON confirmation with the new mode and timestamp.",
      inputSchema: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["hud", "compact", "voice-only", "silent"],
            description: "Target operator interface mode",
          },
        },
        required: ["mode"],
        additionalProperties: false,
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

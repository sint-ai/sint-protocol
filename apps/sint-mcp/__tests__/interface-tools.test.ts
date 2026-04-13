/**
 * SINT MCP — Interface tools tests.
 *
 * Tests all sint__interface_* operator tools:
 * status, speak, show_hud, notify, store_memory, recall_memory, interface_mode.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getInterfaceToolDefinitions,
  handleInterfaceTool,
  isInterfaceTool,
  type InterfaceToolContext,
} from "../src/tools/interface-tools.js";
import { InterfaceStateManager } from "@pshkv/interface-bridge";
import { LedgerWriter } from "@pshkv/gate-evidence-ledger";

function createCtx(withMemory = false): InterfaceToolContext {
  const ledger = new LedgerWriter();
  const interfaceState = new InterfaceStateManager("test-session-001");

  const ctx: InterfaceToolContext = {
    interfaceState,
    ledger,
    agentPublicKey: "a".repeat(64),
  };

  if (withMemory) {
    // Attach a minimal in-memory MemoryBank stub
    const store = new Map<string, { key: string; value: unknown; tags: string[] }>();
    (ctx as any).memoryBank = {
      async store(key: string, value: unknown, tags: string[], _persist: boolean) {
        store.set(key, { key, value, tags });
        return { ledgerEventId: `event-${key}` };
      },
      async recall(query: string, limit: number) {
        const results = [];
        for (const entry of store.values()) {
          if (
            entry.key.includes(query) ||
            entry.tags.some((t) => t.includes(query)) ||
            JSON.stringify(entry.value).includes(query)
          ) {
            results.push(entry);
            if (results.length >= limit) break;
          }
        }
        return results;
      },
    };
  }

  return ctx;
}

describe("isInterfaceTool", () => {
  it("returns true for all interface tools", () => {
    const tools = getInterfaceToolDefinitions();
    for (const tool of tools) {
      expect(isInterfaceTool(tool.name)).toBe(true);
    }
  });

  it("returns false for downstream and sint tools", () => {
    expect(isInterfaceTool("filesystem__readFile")).toBe(false);
    expect(isInterfaceTool("sint__approve")).toBe(false);
    expect(isInterfaceTool("unknown")).toBe(false);
  });
});

describe("getInterfaceToolDefinitions", () => {
  it("returns all 7 interface tools", () => {
    const tools = getInterfaceToolDefinitions();
    expect(tools).toHaveLength(7);
  });

  it("all tools have name, description, and inputSchema", () => {
    const tools = getInterfaceToolDefinitions();
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeTruthy();
      expect(tool.name.startsWith("sint__")).toBe(true);
    }
  });

  it("tool names match isInterfaceTool", () => {
    const tools = getInterfaceToolDefinitions();
    for (const tool of tools) {
      expect(isInterfaceTool(tool.name)).toBe(true);
    }
  });
});

describe("sint__interface_status", () => {
  it("returns current interface state as JSON", async () => {
    const ctx = createCtx();
    const result = await handleInterfaceTool("sint__interface_status", {}, ctx);

    expect(result.content).toHaveLength(1);
    const data = JSON.parse(result.content[0]!.text);
    expect(data).toBeDefined();
    expect(data.sessionId).toBe("test-session-001");
  });
});

describe("sint__speak", () => {
  it("speaks with default priority", async () => {
    const ctx = createCtx();
    const result = await handleInterfaceTool("sint__speak", { text: "Hello operator" }, ctx);

    const data = JSON.parse(result.content[0]!.text);
    expect(data.spoken).toBe(true);
    expect(data.text).toBe("Hello operator");
    expect(data.priority).toBe("normal");
    expect(data.timestamp).toBeTruthy();
  });

  it("speaks with urgent priority", async () => {
    const ctx = createCtx();
    const result = await handleInterfaceTool("sint__speak", { text: "STOP!", priority: "urgent" }, ctx);

    const data = JSON.parse(result.content[0]!.text);
    expect(data.priority).toBe("urgent");
  });

  it("speaks with low priority", async () => {
    const ctx = createCtx();
    const result = await handleInterfaceTool("sint__speak", { text: "FYI", priority: "low" }, ctx);

    const data = JSON.parse(result.content[0]!.text);
    expect(data.priority).toBe("low");
  });

  it("emits voice output ledger event", async () => {
    const ctx = createCtx();
    await handleInterfaceTool("sint__speak", { text: "Test voice" }, ctx);

    const events = ctx.ledger.getAll();
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe("operator.voice.output");
    expect(events[0]!.payload["text"]).toBe("Test voice");
  });

  it("returns error when text is missing", async () => {
    const ctx = createCtx();
    const result = await handleInterfaceTool("sint__speak", {}, ctx);
    expect(result.content[0]!.text).toContain("text is required");
  });
});

describe("sint__show_hud", () => {
  it("updates an approvals HUD panel", async () => {
    const ctx = createCtx();
    const result = await handleInterfaceTool(
      "sint__show_hud",
      { panel: "approvals", data: { count: 3 } },
      ctx,
    );

    const data = JSON.parse(result.content[0]!.text);
    expect(data.updated).toBe(true);
    expect(data.panel).toBe("approvals");
    expect(data.timestamp).toBeTruthy();
  });

  it("updates an audit panel", async () => {
    const ctx = createCtx();
    const result = await handleInterfaceTool("sint__show_hud", { panel: "audit" }, ctx);

    const data = JSON.parse(result.content[0]!.text);
    expect(data.panel).toBe("audit");
  });

  it("updates memory and context panels", async () => {
    const ctx = createCtx();
    for (const panel of ["memory", "context"] as const) {
      const result = await handleInterfaceTool("sint__show_hud", { panel }, ctx);
      const data = JSON.parse(result.content[0]!.text);
      expect(data.panel).toBe(panel);
    }
  });

  it("emits hud.updated ledger event", async () => {
    const ctx = createCtx();
    await handleInterfaceTool("sint__show_hud", { panel: "approvals" }, ctx);

    const events = ctx.ledger.getAll();
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe("operator.hud.updated");
    expect(events[0]!.payload["panel"]).toBe("approvals");
  });

  it("returns error when panel is missing", async () => {
    const ctx = createCtx();
    const result = await handleInterfaceTool("sint__show_hud", {}, ctx);
    expect(result.content[0]!.text).toContain("panel is required");
  });
});

describe("sint__notify", () => {
  it("sends a simple notification", async () => {
    const ctx = createCtx();
    const result = await handleInterfaceTool(
      "sint__notify",
      { message: "Task completed successfully" },
      ctx,
    );

    const data = JSON.parse(result.content[0]!.text);
    expect(data.notified).toBe(true);
    expect(data.message).toBe("Task completed successfully");
    expect(data.timestamp).toBeTruthy();
  });

  it("sends a notification with action button", async () => {
    const ctx = createCtx();
    const result = await handleInterfaceTool("sint__notify", {
      message: "Approval required",
      action: {
        label: "Approve",
        tool: "sint__approve",
        args: { requestId: "req-123" },
      },
    }, ctx);

    const data = JSON.parse(result.content[0]!.text);
    expect(data.notified).toBe(true);
  });

  it("emits operator.notification ledger event", async () => {
    const ctx = createCtx();
    await handleInterfaceTool("sint__notify", { message: "Alert" }, ctx);

    const events = ctx.ledger.getAll();
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe("operator.notification");
    expect(events[0]!.payload["message"]).toBe("Alert");
  });

  it("returns error when message is missing", async () => {
    const ctx = createCtx();
    const result = await handleInterfaceTool("sint__notify", {}, ctx);
    expect(result.content[0]!.text).toContain("message is required");
  });
});

describe("sint__interface_mode", () => {
  it("switches to each valid mode", async () => {
    const ctx = createCtx();
    for (const mode of ["hud", "compact", "voice-only", "silent"] as const) {
      const result = await handleInterfaceTool("sint__interface_mode", { mode }, ctx);
      const data = JSON.parse(result.content[0]!.text);
      expect(data.mode).toBe(mode);
      expect(data.changed).toBe(true);
    }
  });

  it("emits mode.changed ledger event", async () => {
    const ctx = createCtx();
    await handleInterfaceTool("sint__interface_mode", { mode: "silent" }, ctx);

    const events = ctx.ledger.getAll();
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe("operator.interface.mode.changed");
    expect(events[0]!.payload["mode"]).toBe("silent");
  });

  it("returns error when mode is missing", async () => {
    const ctx = createCtx();
    const result = await handleInterfaceTool("sint__interface_mode", {}, ctx);
    expect(result.content[0]!.text).toContain("mode is required");
  });
});

describe("sint__store_memory", () => {
  it("stores with memoryBank present", async () => {
    const ctx = createCtx(true);
    const result = await handleInterfaceTool("sint__store_memory", {
      key: "project-goal",
      value: "Build a safety layer for physical AI",
      tags: ["project", "goal"],
      persist: false,
    }, ctx);

    const data = JSON.parse(result.content[0]!.text);
    expect(data.stored).toBe(true);
    expect(data.key).toBe("project-goal");
    expect(data.ledgerEventId).toBeTruthy();
  });

  it("stores without memoryBank (no-op success)", async () => {
    const ctx = createCtx(false);
    const result = await handleInterfaceTool("sint__store_memory", {
      key: "note",
      value: "important note",
    }, ctx);

    const data = JSON.parse(result.content[0]!.text);
    expect(data.stored).toBe(true);
    expect(data.key).toBe("note");
  });

  it("returns error when key is missing", async () => {
    const ctx = createCtx();
    const result = await handleInterfaceTool("sint__store_memory", { value: "x" }, ctx);
    expect(result.content[0]!.text).toContain("required");
  });

  it("returns error when value is missing", async () => {
    const ctx = createCtx();
    const result = await handleInterfaceTool("sint__store_memory", { key: "k" }, ctx);
    expect(result.content[0]!.text).toContain("required");
  });
});

describe("sint__recall_memory", () => {
  it("returns empty array without memoryBank", async () => {
    const ctx = createCtx(false);
    const result = await handleInterfaceTool("sint__recall_memory", { query: "project" }, ctx);

    const data = JSON.parse(result.content[0]!.text);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(0);
  });

  it("recalls matching entries from memoryBank", async () => {
    const ctx = createCtx(true);
    // Store first
    await handleInterfaceTool("sint__store_memory", {
      key: "robot-task",
      value: "navigate to waypoint A",
      tags: ["robot", "navigation"],
    }, ctx);
    await handleInterfaceTool("sint__store_memory", {
      key: "unrelated",
      value: "something else entirely",
      tags: ["other"],
    }, ctx);

    // Recall
    const result = await handleInterfaceTool("sint__recall_memory", {
      query: "robot",
      limit: 5,
    }, ctx);

    const data = JSON.parse(result.content[0]!.text);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].key).toBe("robot-task");
  });

  it("respects the limit parameter", async () => {
    const ctx = createCtx(true);
    for (let i = 0; i < 5; i++) {
      await handleInterfaceTool("sint__store_memory", {
        key: `item-${i}`,
        value: `value-${i}`,
        tags: ["batch"],
      }, ctx);
    }

    const result = await handleInterfaceTool("sint__recall_memory", {
      query: "batch",
      limit: 2,
    }, ctx);

    const data = JSON.parse(result.content[0]!.text);
    expect(data.length).toBeLessThanOrEqual(2);
  });

  it("returns error when query is missing", async () => {
    const ctx = createCtx();
    const result = await handleInterfaceTool("sint__recall_memory", {}, ctx);
    expect(result.content[0]!.text).toContain("query is required");
  });
});

describe("unknown interface tool", () => {
  it("returns unknown tool error", async () => {
    const ctx = createCtx();
    const result = await handleInterfaceTool("sint__nonexistent_tool", {}, ctx);
    expect(result.content[0]!.text).toContain("Unknown interface tool");
  });
});

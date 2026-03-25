#!/usr/bin/env npx tsx
/**
 * Minimal Notes MCP Server.
 *
 * A simple MCP server that manages text notes. Designed to be
 * run behind the SINT MCP proxy to demonstrate policy enforcement
 * across all four approval tiers:
 *
 *   T0 (observe)  — listNotes, getNote
 *   T1 (prepare)  — createNote
 *   T2 (act)      — updateNote
 *   T3 (commit)   — deleteAllNotes
 *
 * Usage:
 *   npx tsx server.ts              # stdio transport
 *   npx tsx server.ts --sse 3300   # SSE transport on port 3300
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ── In-memory note storage ──────────────────────────────────

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

const notes = new Map<string, Note>();
let nextId = 1;

// Seed with sample data
notes.set("1", {
  id: "1",
  title: "Welcome",
  content: "This is a sample note from the Notes MCP server.",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
nextId = 2;

// ── MCP Server ──────────────────────────────────────────────

const server = new Server(
  { name: "notes-server", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "listNotes",
      description: "List all notes (titles and IDs only)",
      inputSchema: { type: "object" as const, properties: {} },
    },
    {
      name: "getNote",
      description: "Get a note by ID",
      inputSchema: {
        type: "object" as const,
        properties: { id: { type: "string", description: "Note ID" } },
        required: ["id"],
      },
    },
    {
      name: "createNote",
      description: "Create a new note",
      inputSchema: {
        type: "object" as const,
        properties: {
          title: { type: "string", description: "Note title" },
          content: { type: "string", description: "Note content" },
        },
        required: ["title", "content"],
      },
    },
    {
      name: "updateNote",
      description: "Update an existing note's content",
      inputSchema: {
        type: "object" as const,
        properties: {
          id: { type: "string", description: "Note ID" },
          title: { type: "string", description: "New title (optional)" },
          content: { type: "string", description: "New content (optional)" },
        },
        required: ["id"],
      },
    },
    {
      name: "deleteAllNotes",
      description: "Delete ALL notes (irreversible)",
      inputSchema: { type: "object" as const, properties: {} },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "listNotes": {
      const list = [...notes.values()].map((n) => ({
        id: n.id,
        title: n.title,
        updatedAt: n.updatedAt,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(list, null, 2) }],
      };
    }

    case "getNote": {
      const id = (args as Record<string, string>).id;
      const note = notes.get(id);
      if (!note) {
        return {
          content: [{ type: "text", text: `Note ${id} not found` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(note, null, 2) }],
      };
    }

    case "createNote": {
      const { title, content } = args as { title: string; content: string };
      const id = String(nextId++);
      const now = new Date().toISOString();
      const note: Note = { id, title, content, createdAt: now, updatedAt: now };
      notes.set(id, note);
      return {
        content: [{ type: "text", text: JSON.stringify(note, null, 2) }],
      };
    }

    case "updateNote": {
      const { id, title, content } = args as {
        id: string;
        title?: string;
        content?: string;
      };
      const note = notes.get(id);
      if (!note) {
        return {
          content: [{ type: "text", text: `Note ${id} not found` }],
          isError: true,
        };
      }
      if (title !== undefined) note.title = title;
      if (content !== undefined) note.content = content;
      note.updatedAt = new Date().toISOString();
      return {
        content: [{ type: "text", text: JSON.stringify(note, null, 2) }],
      };
    }

    case "deleteAllNotes": {
      const count = notes.size;
      notes.clear();
      nextId = 1;
      return {
        content: [
          { type: "text", text: `Deleted ${count} note(s). Storage is empty.` },
        ],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

// ── Start ───────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Notes MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

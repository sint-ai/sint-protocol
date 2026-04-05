import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sintGovernedTool,
  wrapToolsWithGovernance,
} from "../src/tool-wrapper.js";
import { SintDeniedError } from "../src/errors.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockGatewayResponse(
  outcome: "approve" | "deny" | "escalate",
  opts?: { reason?: string }
) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ outcome, reason: opts?.reason }),
  });
}

interface MockTool {
  name: string;
  description: string;
  invoke: ReturnType<typeof vi.fn>;
}

function createMockTool(name: string): MockTool {
  return {
    name,
    description: `Mock ${name} tool`,
    invoke: vi.fn().mockResolvedValue(`${name} result`),
  };
}

describe("sintGovernedTool", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("executes tool when approved", async () => {
    const tool = createMockTool("search");
    const governed = sintGovernedTool(tool, {
      gatewayUrl: "http://localhost:4100",
      agentId: "agent-1",
    });

    mockGatewayResponse("approve");

    const result = await governed.invoke({ query: "hello" });
    expect(result).toBe("search result");
    expect(tool.invoke).toHaveBeenCalledOnce();
  });

  it("blocks tool when denied", async () => {
    const tool = createMockTool("delete");
    const governed = sintGovernedTool(tool, {
      gatewayUrl: "http://localhost:4100",
      agentId: "agent-1",
    });

    mockGatewayResponse("deny", { reason: "No delete permission" });

    await expect(governed.invoke({ path: "/data" })).rejects.toThrow(
      SintDeniedError
    );
    expect(tool.invoke).not.toHaveBeenCalled();
  });

  it("returns denial string when throwOnDeny is false", async () => {
    const tool = createMockTool("write");
    const governed = sintGovernedTool(tool, {
      gatewayUrl: "http://localhost:4100",
      agentId: "agent-1",
      throwOnDeny: false,
    });

    mockGatewayResponse("deny", { reason: "Read-only scope" });

    const result = await governed.invoke({ data: "test" });
    expect(result).toContain("[SINT DENIED]");
    expect(result).toContain("Read-only scope");
    expect(tool.invoke).not.toHaveBeenCalled();
  });

  it("preserves non-invoke properties", () => {
    const tool = createMockTool("test");
    const governed = sintGovernedTool(tool, {
      gatewayUrl: "http://localhost:4100",
      agentId: "agent-1",
    });

    expect(governed.name).toBe("test");
    expect(governed.description).toBe("Mock test tool");
  });
});

describe("wrapToolsWithGovernance", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("wraps all tools in an array", async () => {
    const tools = [
      createMockTool("search"),
      createMockTool("calculate"),
      createMockTool("write"),
    ];

    const governed = wrapToolsWithGovernance(tools, {
      gatewayUrl: "http://localhost:4100",
      agentId: "agent-1",
    });

    expect(governed).toHaveLength(3);
    expect(governed[0]!.name).toBe("search");
    expect(governed[1]!.name).toBe("calculate");
    expect(governed[2]!.name).toBe("write");

    // Each should intercept when invoked
    mockGatewayResponse("approve");
    await governed[0]!.invoke("test");
    expect(mockFetch).toHaveBeenCalledOnce();
  });
});

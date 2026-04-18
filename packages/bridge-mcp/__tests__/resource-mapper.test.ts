/**
 * SINT Bridge-MCP — Resource Mapper unit tests.
 */

import { describe, it, expect } from "vitest";
import { ApprovalTier } from "@pshkv/core";
import {
  toResourceUri,
  toToolId,
  getRiskHint,
  toSintAction,
  isReadOnly,
  isDangerous,
  isShellExecTool,
} from "../src/mcp-resource-mapper.js";
import type { MCPToolCall } from "../src/types.js";

function makeToolCall(serverName: string, toolName: string): MCPToolCall {
  return {
    callId: "call-1",
    serverName,
    toolName,
    arguments: {},
    timestamp: new Date().toISOString(),
  };
}

describe("toResourceUri", () => {
  it("maps server/tool to mcp:// URI", () => {
    const call = makeToolCall("filesystem", "writeFile");
    expect(toResourceUri(call)).toBe("mcp://filesystem/writeFile");
  });

  it("handles nested server names", () => {
    const call = makeToolCall("my-server", "doSomething");
    expect(toResourceUri(call)).toBe("mcp://my-server/doSomething");
  });
});

describe("toToolId", () => {
  it("combines server and tool with dot separator", () => {
    expect(toToolId("filesystem", "readFile")).toBe("filesystem.readFile");
  });
});

describe("getRiskHint", () => {
  it("returns T0 for read-only filesystem tools", () => {
    const hint = getRiskHint(makeToolCall("filesystem", "readFile"));
    expect(hint.suggestedTier).toBe(ApprovalTier.T0_OBSERVE);
  });

  it("returns T1 for write filesystem tools", () => {
    const hint = getRiskHint(makeToolCall("filesystem", "writeFile"));
    expect(hint.suggestedTier).toBe(ApprovalTier.T1_PREPARE);
  });

  it("returns T2 for delete operations", () => {
    const hint = getRiskHint(makeToolCall("filesystem", "deleteFile"));
    expect(hint.suggestedTier).toBe(ApprovalTier.T2_ACT);
  });

  it("returns T3 for exec tools", () => {
    const hint = getRiskHint(makeToolCall("exec", "run"));
    expect(hint.suggestedTier).toBe(ApprovalTier.T3_COMMIT);
  });

  it("returns T3 for credential tools", () => {
    const hint = getRiskHint(makeToolCall("credential", "read"));
    expect(hint.suggestedTier).toBe(ApprovalTier.T3_COMMIT);
  });

  it("returns T1 default for unknown tools", () => {
    const hint = getRiskHint(makeToolCall("custom-server", "unknownTool"));
    expect(hint.suggestedTier).toBe(ApprovalTier.T1_PREPARE);
  });

  it("returns T0 for database query", () => {
    const hint = getRiskHint(makeToolCall("database", "query"));
    expect(hint.suggestedTier).toBe(ApprovalTier.T0_OBSERVE);
  });
});

describe("toSintAction", () => {
  it("returns 'call' for standard tools", () => {
    expect(toSintAction(makeToolCall("filesystem", "readFile"))).toBe("call");
  });

  it("returns 'exec.run' for exec tools", () => {
    expect(toSintAction(makeToolCall("exec", "run"))).toBe("exec.run");
  });
});

describe("isReadOnly", () => {
  it("true for read operations", () => {
    expect(isReadOnly(makeToolCall("filesystem", "readFile"))).toBe(true);
  });

  it("false for write operations", () => {
    expect(isReadOnly(makeToolCall("filesystem", "writeFile"))).toBe(false);
  });
});

describe("isDangerous", () => {
  it("true for exec tools", () => {
    expect(isDangerous(makeToolCall("exec", "run"))).toBe(true);
  });

  it("true for credential tools", () => {
    expect(isDangerous(makeToolCall("credential", "write"))).toBe(true);
  });

  it("false for read tools", () => {
    expect(isDangerous(makeToolCall("filesystem", "readFile"))).toBe(false);
  });

  it("false for unknown tools", () => {
    expect(isDangerous(makeToolCall("custom", "whatever"))).toBe(false);
  });
});

// ASI05: shell/code execution → T3_COMMIT
describe("ASI05 shell/exec classification", () => {
  it("bash tool → T3_COMMIT (isShellExecTool = true)", () => {
    const call = makeToolCall("any-server", "bash");
    expect(isShellExecTool(call)).toBe(true);
    const hint = getRiskHint(call);
    expect(hint.suggestedTier).toBe(ApprovalTier.T3_COMMIT);
  });

  it("run_command tool → T3_COMMIT (isShellExecTool = true)", () => {
    const call = makeToolCall("any-server", "run_command");
    expect(isShellExecTool(call)).toBe(true);
    const hint = getRiskHint(call);
    expect(hint.suggestedTier).toBe(ApprovalTier.T3_COMMIT);
  });

  it("execute tool on any server → T3_COMMIT", () => {
    const call = makeToolCall("my-custom-server", "execute");
    expect(isShellExecTool(call)).toBe(true);
    const hint = getRiskHint(call);
    expect(hint.suggestedTier).toBe(ApprovalTier.T3_COMMIT);
  });
});

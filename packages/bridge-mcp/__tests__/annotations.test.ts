/**
 * SINT Bridge-MCP — MCP Tool Annotation tests.
 * Tests tier resolution from MCP spec §tool-annotations fields.
 */

import { describe, it, expect } from "vitest";
import { ApprovalTier } from "@pshkv/core";
import { tierFromAnnotations, getRiskHint } from "../src/mcp-resource-mapper.js";
import type { MCPToolAnnotations, MCPToolCall } from "../src/types.js";

function makeToolCall(
  serverName: string,
  toolName: string,
  annotations?: MCPToolAnnotations,
): MCPToolCall {
  return {
    callId: "test-call-1",
    serverName,
    toolName,
    arguments: {},
    timestamp: new Date().toISOString(),
    annotations,
  };
}

describe("tierFromAnnotations", () => {
  it("readOnlyHint=true resolves to T0_OBSERVE", () => {
    const result = tierFromAnnotations({ readOnlyHint: true });
    expect(result).toBe(ApprovalTier.T0_OBSERVE);
  });

  it("destructiveHint=true resolves to T3_COMMIT", () => {
    const result = tierFromAnnotations({ destructiveHint: true });
    expect(result).toBe(ApprovalTier.T3_COMMIT);
  });

  it("openWorldHint=true resolves to T1_PREPARE", () => {
    const result = tierFromAnnotations({ openWorldHint: true });
    expect(result).toBe(ApprovalTier.T1_PREPARE);
  });

  it("no matching annotations returns undefined (fall through)", () => {
    const result = tierFromAnnotations({ idempotentHint: true });
    expect(result).toBeUndefined();
  });

  it("empty annotations object returns undefined", () => {
    const result = tierFromAnnotations({});
    expect(result).toBeUndefined();
  });
});

describe("getRiskHint with annotations", () => {
  it("annotations override keyword-based classification (readOnlyHint on exec tool)", () => {
    // Without annotations, 'exec' server → T3_COMMIT via ASI05 keyword detection
    // With readOnlyHint, annotations take precedence → T0_OBSERVE
    const toolCall = makeToolCall("exec", "runQuery", { readOnlyHint: true });
    const hint = getRiskHint(toolCall);
    expect(hint.suggestedTier).toBe(ApprovalTier.T0_OBSERVE);
  });

  it("annotations override keyword-based classification (destructiveHint on read tool)", () => {
    // filesystem.readFile is T0_OBSERVE in the map
    // With destructiveHint, annotations take precedence → T3_COMMIT
    const toolCall = makeToolCall("filesystem", "readFile", { destructiveHint: true });
    const hint = getRiskHint(toolCall);
    expect(hint.suggestedTier).toBe(ApprovalTier.T3_COMMIT);
  });

  it("no annotations falls through to keyword map (shell keyword → T3)", () => {
    const toolCall = makeToolCall("custom", "bash_exec");
    const hint = getRiskHint(toolCall);
    expect(hint.suggestedTier).toBe(ApprovalTier.T3_COMMIT);
  });

  it("no annotations falls through to keyword map (unknown → T1)", () => {
    const toolCall = makeToolCall("my-server", "doSomething");
    const hint = getRiskHint(toolCall);
    expect(hint.suggestedTier).toBe(ApprovalTier.T1_PREPARE);
  });

  it("idempotentHint alone does not change tier (falls through to map)", () => {
    // idempotentHint alone → undefined from tierFromAnnotations → falls through
    // filesystem.readFile → T0 from map
    const toolCall = makeToolCall("filesystem", "readFile", { idempotentHint: true });
    const hint = getRiskHint(toolCall);
    expect(hint.suggestedTier).toBe(ApprovalTier.T0_OBSERVE);
  });
});

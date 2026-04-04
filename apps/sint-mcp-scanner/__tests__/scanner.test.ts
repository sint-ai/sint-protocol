/**
 * SINT MCP Security Scanner — unit tests.
 */

import { describe, it, expect } from "vitest";
import { ApprovalTier } from "@sint/core";
import { scanTool, scanServer } from "../src/scanner.js";

describe("scanTool", () => {
  it("readFile tool → LOW risk (T0_OBSERVE)", () => {
    // filesystem.readFile is in the explicit map as T0
    const result = scanTool("filesystem", "readFile", "Reads a file from the filesystem");
    expect(result.riskLevel).toBe("LOW");
    expect(result.assignedTier).toBe(ApprovalTier.T0_OBSERVE);
    expect(result.requiresHumanApproval).toBe(false);
    expect(result.isShellExec).toBe(false);
  });

  it("bash tool → CRITICAL risk (isShellExec=true)", () => {
    const result = scanTool("custom", "bash", "Runs bash shell commands");
    expect(result.riskLevel).toBe("CRITICAL");
    expect(result.assignedTier).toBe(ApprovalTier.T3_COMMIT);
    expect(result.isShellExec).toBe(true);
    expect(result.requiresHumanApproval).toBe(true);
  });

  it("destructiveHint annotation → CRITICAL risk", () => {
    const result = scanTool("my-server", "processThing", "Processes a thing", {
      destructiveHint: true,
    });
    expect(result.riskLevel).toBe("CRITICAL");
    expect(result.assignedTier).toBe(ApprovalTier.T3_COMMIT);
    expect(result.requiresHumanApproval).toBe(true);
  });

  it("requiresHumanApproval=true for T2 (HIGH) tools", () => {
    // filesystem.deleteFile is T2_ACT in the map
    const result = scanTool("filesystem", "deleteFile", "Deletes a file");
    expect(result.riskLevel).toBe("HIGH");
    expect(result.assignedTier).toBe(ApprovalTier.T2_ACT);
    expect(result.requiresHumanApproval).toBe(true);
  });

  it("requiresHumanApproval=false for T0 and T1 tools", () => {
    const t0 = scanTool("filesystem", "readFile", "Reads a file");
    const t1 = scanTool("filesystem", "writeFile", "Writes a file");
    expect(t0.requiresHumanApproval).toBe(false);
    expect(t1.requiresHumanApproval).toBe(false);
  });

  it("openWorldHint annotation → MEDIUM risk (T1_PREPARE)", () => {
    const result = scanTool("api-server", "callWebhook", "Calls an external webhook", {
      openWorldHint: true,
    });
    expect(result.riskLevel).toBe("MEDIUM");
    expect(result.assignedTier).toBe(ApprovalTier.T1_PREPARE);
  });

  it("readOnlyHint annotation overrides shell keyword → LOW risk", () => {
    // 'exec' keyword would normally → CRITICAL, but readOnlyHint overrides
    const result = scanTool("exec", "execReadOnly", "Read-only execution", {
      readOnlyHint: true,
    });
    expect(result.riskLevel).toBe("LOW");
    expect(result.assignedTier).toBe(ApprovalTier.T0_OBSERVE);
  });
});

describe("scanServer", () => {
  it("server with all-LOW tools → overall LOW", () => {
    const tools = [
      { name: "readFile", description: "Read a file" },
      { name: "readDirectory", description: "List directory contents" },
      { name: "getFileInfo", description: "Get file metadata" },
    ];
    const report = scanServer("filesystem", tools);
    expect(report.overallRisk).toBe("LOW");
    expect(report.totalTools).toBe(3);
    expect(report.byRisk.LOW).toBe(3);
    expect(report.byRisk.CRITICAL).toBe(0);
  });

  it("server with any CRITICAL tool → overall CRITICAL", () => {
    const tools = [
      { name: "readFile", description: "Read a file" },
      { name: "bash", description: "Execute shell commands" },
    ];
    const report = scanServer("mixed-server", tools);
    expect(report.overallRisk).toBe("CRITICAL");
    expect(report.criticalTools.length).toBeGreaterThan(0);
  });

  it("recommendations include 'require human approval for CRITICAL tools'", () => {
    const tools = [{ name: "bash", description: "Execute shell commands" }];
    const report = scanServer("shell-server", tools);
    const hasRecommendation = report.recommendations.some(r =>
      r.toLowerCase().includes("human approval") && r.toLowerCase().includes("critical"),
    );
    expect(hasRecommendation).toBe(true);
  });

  it("scanServer counts by risk correctly", () => {
    const tools = [
      { name: "readFile", description: "Read a file" },           // LOW
      { name: "writeFile", description: "Write a file" },         // MEDIUM
      { name: "deleteFile", description: "Delete a file" },       // HIGH
      { name: "bash", description: "Execute shell commands" },    // CRITICAL
    ];
    const report = scanServer("filesystem", tools);
    expect(report.byRisk.LOW).toBe(1);
    expect(report.byRisk.MEDIUM).toBe(1);
    expect(report.byRisk.HIGH).toBe(1);
    expect(report.byRisk.CRITICAL).toBe(1);
    expect(report.totalTools).toBe(4);
  });
});

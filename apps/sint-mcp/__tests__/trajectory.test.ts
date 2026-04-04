import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  TrajectoryRecorder,
  TrajectoryExportService,
} from "../src/trajectory.js";

describe("TrajectoryRecorder", () => {
  it("captures tool calls/results with parent-child links", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "sint-trajectory-"));

    try {
      const recorder = new TrajectoryRecorder({
        runId: "run-1",
        agentId: "agent-1",
        taskId: "task-1",
        model: "test-model",
        outputDir,
      });

      const toolCallId = recorder.recordToolCall({
        tool: "filesystem.writeFile",
        args: { path: "/tmp/test.txt" },
      });

      recorder.recordToolResult({
        tool: "filesystem.writeFile",
        result: { ok: true },
        durationMs: 12,
        parentEventId: toolCallId,
      });

      const trajectory = recorder.snapshot();
      expect(trajectory.events).toHaveLength(2);
      expect(trajectory.events[0]!.type).toBe("tool_call");
      expect(trajectory.events[1]!.type).toBe("tool_result");
      expect(trajectory.events[1]!.parentEventId).toBe(toolCallId);
      expect(trajectory.metadata.totalToolCalls).toBe(1);
      expect(trajectory.metadata.totalDurationMs).toBe(12);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("persists one JSON file per run with classified outcome", async () => {
    const outputDir = mkdtempSync(join(tmpdir(), "sint-trajectory-"));

    try {
      const recorder = new TrajectoryRecorder({
        runId: "run-2",
        agentId: "agent-2",
        taskId: "task-2",
        model: "test-model",
        outputDir,
      });

      recorder.recordDecision("allow", "filesystem.readFile");
      recorder.markOutcome("partial");
      const filePath = await recorder.flushToFile();

      const fileContents = JSON.parse(readFileSync(filePath, "utf-8")) as {
        runId: string;
        outcome: string;
      };
      expect(fileContents.runId).toBe("run-2");
      expect(fileContents.outcome).toBe("partial");
      expect(filePath.endsWith("run-2.json")).toBe(true);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});

describe("TrajectoryExportService", () => {
  it("exports JSON, JSONL, and replay script", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "sint-trajectory-"));

    try {
      const recorder = new TrajectoryRecorder({
        runId: "run-3",
        agentId: "agent-3",
        taskId: "task-3",
        model: "test-model",
        outputDir,
      });

      recorder.recordToolCall({
        tool: "filesystem.readFile",
        args: { path: "/tmp/x" },
      });
      recorder.recordToolResult({
        tool: "filesystem.readFile",
        result: "ok",
        durationMs: 5,
      });

      const trajectory = recorder.snapshot();
      const exporter = new TrajectoryExportService();

      const json = exporter.exportJSON(trajectory);
      const jsonl = exporter.exportJSONL([trajectory]);
      const replay = exporter.exportReplay(trajectory);

      expect(JSON.parse(json).runId).toBe("run-3");
      expect(jsonl.trim().split("\n")).toHaveLength(1);
      expect(replay.steps.length).toBe(2);
      expect(replay.steps[0]!.type).toBe("tool_call");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});

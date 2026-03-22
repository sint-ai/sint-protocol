import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";

function nowISO8601(): string {
  return new Date().toISOString();
}

export type TrajectoryEventType =
  | "tool_call"
  | "tool_result"
  | "decision"
  | "error"
  | "escalation";

export interface TrajectoryEvent {
  readonly id: string;
  readonly runId: string;
  readonly agentId: string;
  readonly timestamp: string;
  readonly type: TrajectoryEventType;
  readonly payload: {
    readonly tool?: string;
    readonly args?: Record<string, unknown>;
    readonly result?: unknown;
    readonly reasoning?: string;
    readonly durationMs?: number;
  };
  readonly parentEventId?: string;
}

export type TrajectoryOutcome = "success" | "failure" | "partial" | "timeout";

export interface Trajectory {
  readonly runId: string;
  readonly agentId: string;
  readonly taskId: string;
  readonly events: readonly TrajectoryEvent[];
  readonly outcome: TrajectoryOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly metadata: {
    readonly model: string;
    readonly totalTokens: number;
    readonly totalToolCalls: number;
    readonly totalDurationMs: number;
  };
}

export interface ReplayStep {
  readonly index: number;
  readonly timestamp: string;
  readonly type: TrajectoryEventType;
  readonly summary: string;
  readonly payload: TrajectoryEvent["payload"];
  readonly parentEventId?: string;
}

export interface ReplayScript {
  readonly runId: string;
  readonly agentId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly steps: readonly ReplayStep[];
}

export interface TrajectoryRecorderConfig {
  readonly runId: string;
  readonly agentId: string;
  readonly taskId: string;
  readonly model: string;
  readonly outputDir: string;
}

export class TrajectoryRecorder {
  private readonly runId: string;
  private readonly agentId: string;
  private readonly taskId: string;
  private readonly model: string;
  private readonly outputDir: string;
  private readonly startedAt: string;
  private outcome: TrajectoryOutcome = "success";
  private totalDurationMs = 0;
  private totalToolCalls = 0;
  private readonly events: TrajectoryEvent[] = [];

  constructor(config: TrajectoryRecorderConfig) {
    this.runId = config.runId;
    this.agentId = config.agentId;
    this.taskId = config.taskId;
    this.model = config.model;
    this.outputDir = resolve(config.outputDir);
    this.startedAt = nowISO8601();
  }

  recordToolCall(input: {
    readonly tool: string;
    readonly args: Record<string, unknown>;
    readonly parentEventId?: string;
  }): string {
    const eventId = randomUUID();
    this.events.push({
      id: eventId,
      runId: this.runId,
      agentId: this.agentId,
      timestamp: nowISO8601(),
      type: "tool_call",
      payload: {
        tool: input.tool,
        args: input.args,
      },
      parentEventId: input.parentEventId,
    });
    this.totalToolCalls += 1;
    return eventId;
  }

  recordToolResult(input: {
    readonly tool: string;
    readonly result: unknown;
    readonly durationMs: number;
    readonly parentEventId?: string;
  }): string {
    const eventId = randomUUID();
    this.events.push({
      id: eventId,
      runId: this.runId,
      agentId: this.agentId,
      timestamp: nowISO8601(),
      type: "tool_result",
      payload: {
        tool: input.tool,
        result: input.result,
        durationMs: input.durationMs,
      },
      parentEventId: input.parentEventId,
    });
    this.totalDurationMs += input.durationMs;
    return eventId;
  }

  recordDecision(decision: string, tool: string, parentEventId?: string): string {
    return this.pushEvent({
      type: "decision",
      payload: {
        tool,
        reasoning: decision,
      },
      parentEventId,
    });
  }

  recordError(reason: string, tool?: string, parentEventId?: string): string {
    if (this.outcome === "success") {
      this.outcome = "partial";
    }
    return this.pushEvent({
      type: "error",
      payload: {
        tool,
        reasoning: reason,
      },
      parentEventId,
    });
  }

  recordEscalation(reason: string, tool?: string, parentEventId?: string): string {
    return this.pushEvent({
      type: "escalation",
      payload: {
        tool,
        reasoning: reason,
      },
      parentEventId,
    });
  }

  markOutcome(outcome: TrajectoryOutcome): void {
    this.outcome = outcome;
  }

  snapshot(): Trajectory {
    return {
      runId: this.runId,
      agentId: this.agentId,
      taskId: this.taskId,
      events: [...this.events],
      outcome: this.outcome,
      startedAt: this.startedAt,
      completedAt: nowISO8601(),
      metadata: {
        model: this.model,
        totalTokens: 0,
        totalToolCalls: this.totalToolCalls,
        totalDurationMs: this.totalDurationMs,
      },
    };
  }

  async flushToFile(): Promise<string> {
    await mkdir(this.outputDir, { recursive: true });
    const trajectory = this.snapshot();
    const filePath = join(this.outputDir, `${this.runId}.json`);
    await writeFile(filePath, JSON.stringify(trajectory, null, 2), "utf-8");
    return filePath;
  }

  private pushEvent(input: {
    readonly type: TrajectoryEventType;
    readonly payload: TrajectoryEvent["payload"];
    readonly parentEventId?: string;
  }): string {
    const eventId = randomUUID();
    this.events.push({
      id: eventId,
      runId: this.runId,
      agentId: this.agentId,
      timestamp: nowISO8601(),
      type: input.type,
      payload: input.payload,
      parentEventId: input.parentEventId,
    });
    return eventId;
  }
}

export class TrajectoryExportService {
  exportJSON(trajectory: Trajectory): string {
    return JSON.stringify(trajectory, null, 2);
  }

  exportJSONL(trajectories: readonly Trajectory[]): string {
    return trajectories.map((t) => JSON.stringify(t)).join("\n");
  }

  exportReplay(trajectory: Trajectory): ReplayScript {
    const sorted = [...trajectory.events].sort((a, b) => {
      return a.timestamp.localeCompare(b.timestamp);
    });

    const steps: ReplayStep[] = sorted.map((event, idx) => ({
      index: idx + 1,
      timestamp: event.timestamp,
      type: event.type,
      summary: this.describeEvent(event),
      payload: event.payload,
      parentEventId: event.parentEventId,
    }));

    return {
      runId: trajectory.runId,
      agentId: trajectory.agentId,
      startedAt: trajectory.startedAt,
      completedAt: trajectory.completedAt,
      steps,
    };
  }

  private describeEvent(event: TrajectoryEvent): string {
    const tool = event.payload.tool ?? "unknown-tool";
    switch (event.type) {
      case "tool_call":
        return `Call ${tool}`;
      case "tool_result":
        return `Result ${tool}`;
      case "decision":
        return `Decision ${event.payload.reasoning ?? "n/a"}`;
      case "error":
        return `Error ${event.payload.reasoning ?? "n/a"}`;
      case "escalation":
        return `Escalation ${event.payload.reasoning ?? "n/a"}`;
      default:
        return event.type;
    }
  }
}

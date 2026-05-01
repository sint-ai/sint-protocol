/**
 * Cloud agent runtime: full-featured, MCP-enabled, multi-step planning.
 * Acceptable seconds-of-latency. Designed to handle escalations from edge agents.
 */

export interface CloudDecision {
  action: string;
  reasoning: string;
  toolsUsed: string[];
  latencyMs: number;
  costCents: number;
  /** New table entry the edge agent should learn from this decision. */
  edgeUpdate?: { observationKey: string; action: string; confidence: number };
}

export interface CloudAgentConfig {
  /** MCP servers available to the agent */
  mcpServers: string[];
  /** Maximum thinking budget in tokens */
  thinkingBudget: number;
  /** Whether to emit edge-update suggestions for distillation */
  emitEdgeUpdates: boolean;
}

export type CloudThinkFn = (
  observation: Record<string, unknown>,
  context: { mcpServers: string[]; thinkingBudget: number },
) => Promise<{ action: string; reasoning: string; toolsUsed: string[] }>;

export class CloudAgent {
  private config: CloudAgentConfig;
  private thinkFn: CloudThinkFn;
  private invocations = 0;

  constructor(config: CloudAgentConfig, thinkFn: CloudThinkFn) {
    this.config = config;
    this.thinkFn = thinkFn;
  }

  async decide(observation: Record<string, unknown>): Promise<CloudDecision> {
    const start = Date.now();
    this.invocations++;

    const result = await this.thinkFn(observation, {
      mcpServers: this.config.mcpServers,
      thinkingBudget: this.config.thinkingBudget,
    });

    const latencyMs = Date.now() - start;
    const costCents = this.estimateCost(result.toolsUsed.length);

    const decision: CloudDecision = {
      action: result.action,
      reasoning: result.reasoning,
      toolsUsed: result.toolsUsed,
      latencyMs,
      costCents,
    };

    if (this.config.emitEdgeUpdates) {
      decision.edgeUpdate = {
        observationKey: this.hash(observation),
        action: result.action,
        confidence: this.estimateConfidence(result),
      };
    }

    return decision;
  }

  invocationCount(): number {
    return this.invocations;
  }

  private estimateCost(toolCalls: number): number {
    // Rough: 0.5 cents per LLM call + 0.1 cent per tool call
    return 0.5 + toolCalls * 0.1;
  }

  private estimateConfidence(result: { toolsUsed: string[]; reasoning: string }): number {
    // Heuristic: more tools used → more uncertainty about applying directly at edge
    const base = 0.85;
    const penalty = Math.min(0.3, result.toolsUsed.length * 0.05);
    return Math.max(0.5, base - penalty);
  }

  private hash(o: Record<string, unknown>): string {
    return JSON.stringify(o, Object.keys(o).sort());
  }
}

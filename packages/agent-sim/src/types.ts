/**
 * Agent simulation types.
 * Models a stream of decisions an agent made; allows replay and divergence detection.
 */

export interface DecisionTrace {
  id: string;
  timestamp: number;
  agentId: string;
  /** Inputs the agent observed at decision time */
  observation: Record<string, unknown>;
  /** Action the agent took */
  action: Record<string, unknown>;
  /** Optional reward / outcome */
  reward?: number;
  /** Latency the decision took in ms */
  latencyMs: number;
}

export interface AdversarialEvent {
  type: 'mcp_timeout' | 'malformed_response' | 'latency_spike' | 'state_corruption' | 'sensor_dropout';
  insertAfterDecision: number; // index into trace
  payload?: Record<string, unknown>;
}

export interface SimulationResult {
  totalDecisions: number;
  divergences: Divergence[];
  adversarialFaults: number;
  meanLatencyMs: number;
  rewardSum: number;
}

export interface Divergence {
  decisionIndex: number;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  severity: 'minor' | 'major';
}

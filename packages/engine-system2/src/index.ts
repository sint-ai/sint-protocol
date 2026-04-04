/**
 * SINT Protocol — Engine System 2 (Symbolic Reasoning + Arbitration).
 *
 * Public API for the behavior tree engine, task planner,
 * and System 1/System 2 arbitration layer.
 *
 * @module @sint/engine-system2
 */

// Behavior Tree
export { Blackboard } from "./bt/blackboard.js";
export type {
  NodeStatus,
  TreeNode,
  BlackboardValue,
  BlackboardKey,
} from "./bt/types.js";
export { SequenceNode } from "./bt/nodes/sequence.js";
export { SelectorNode } from "./bt/nodes/selector.js";
export { ParallelNode } from "./bt/nodes/parallel.js";
export { ConditionNode } from "./bt/nodes/condition.js";
export { ActionNode } from "./bt/nodes/action.js";
export {
  InverterNode,
  RepeatNode,
  RetryNode,
} from "./bt/nodes/decorator.js";
export { TreeExecutor } from "./bt/tree-executor.js";
export type {
  TreeExecutorConfig,
  TreeExecutorEvent,
} from "./bt/tree-executor.js";

// Task Planner
export { TaskPlanner } from "./planner/task-planner.js";
export type { TaskPlannerEvent } from "./planner/task-planner.js";
export { PlanConstraintChecker } from "./planner/constraint-checker.js";
export type { TokenConstraints } from "./planner/constraint-checker.js";
export { PlanExecutor } from "./planner/plan-executor.js";
export type { PlanExecutorEvent } from "./planner/plan-executor.js";

// Arbitration
export { classifyActionSafety } from "./arbitration/safety-classifier.js";
export type { SafetyClassification } from "./arbitration/safety-classifier.js";
export { Arbitrator } from "./arbitration/arbitrator.js";
export type { ArbitratorEvent } from "./arbitration/arbitrator.js";
export { EscalationManager } from "./arbitration/escalation.js";
export type { EscalationEvent } from "./arbitration/escalation.js";

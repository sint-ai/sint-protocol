# @pshkv/plan-mode

Multi-step plan execution with state-aware replanning. Each step has explicit precondition + postcondition predicates; if reality diverges from prediction, the plan is regenerated. Inspired by Applied Intuition's mining/defense use cases where the world state changes after every action.

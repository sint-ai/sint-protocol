/**
 * SINT Protocol — Action Predictor for System 1.
 *
 * Converts perception output (world state + optional inference results)
 * into action recommendations. Sets safety relevance flags based on
 * anomaly flags and human presence in the scene.
 *
 * @module @sint/engine-system1/action-predictor
 */

import type { SintActionRecommendation, SintWorldState } from "@pshkv/core";

/**
 * Event payload emitted by the ActionPredictor.
 */
interface PredictorEvent {
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
}

/**
 * Converts perception pipeline output into action recommendations.
 *
 * Determines action type, confidence, resource, and safety relevance
 * based on the fused world state. Actions are marked as safety-relevant
 * when anomaly flags are present or humans are detected.
 *
 * @example
 * ```ts
 * const predictor = new ActionPredictor((evt) => console.log(evt));
 * const recommendation = predictor.predict(worldState);
 * if (recommendation.isSafetyRelevant) {
 *   console.log("Safety-relevant action:", recommendation.action);
 * }
 * ```
 */
export class ActionPredictor {
  private readonly onEvent?: (event: PredictorEvent) => void;

  /**
   * Create an ActionPredictor with optional event callback.
   *
   * @param onEvent - Optional callback invoked when actions are predicted
   *
   * @example
   * ```ts
   * const predictor = new ActionPredictor((evt) => {
   *   console.log(`Event: ${evt.eventType}`, evt.payload);
   * });
   * ```
   */
  constructor(onEvent?: (event: PredictorEvent) => void) {
    this.onEvent = onEvent;
  }

  /**
   * Predict an action recommendation from the current world state.
   *
   * Logic:
   * - If anomaly flags include collision_risk, recommends "emergency_stop"
   * - If human is present with anomalies, recommends "slow_down"
   * - If human is present without anomalies, recommends "proceed_cautious"
   * - Otherwise recommends "proceed"
   *
   * Confidence is derived from the average object confidence in the world
   * state. Safety relevance is set whenever anomaly flags exist or a human
   * is detected.
   *
   * @param worldState - The fused world state from the perception pipeline
   * @param _inferenceOutput - Optional raw inference output (reserved for future use)
   * @returns An action recommendation
   *
   * @example
   * ```ts
   * const recommendation = predictor.predict(worldState);
   * console.log(recommendation.action, recommendation.confidence);
   * ```
   */
  predict(worldState: SintWorldState, _inferenceOutput?: Float32Array): SintActionRecommendation {
    const hasAnomalies = worldState.anomalyFlags.length > 0;
    const hasCollisionRisk = worldState.anomalyFlags.some(
      (flag) => flag.type === "collision_risk",
    );
    const isSafetyRelevant = hasAnomalies || worldState.humanPresent;

    // Compute average object confidence (default to 1.0 if no objects)
    let avgConfidence = 1.0;
    if (worldState.objects.length > 0) {
      const sum = worldState.objects.reduce((acc, obj) => acc + obj.confidence, 0);
      avgConfidence = sum / worldState.objects.length;
    }

    // Determine action based on world state
    let action: string;
    let resource: string;
    const params: Record<string, unknown> = {};

    if (hasCollisionRisk) {
      action = "emergency_stop";
      resource = "ros2:///cmd_vel";
      params["linear"] = { x: 0, y: 0, z: 0 };
      params["angular"] = { x: 0, y: 0, z: 0 };
    } else if (worldState.humanPresent && hasAnomalies) {
      action = "slow_down";
      resource = "ros2:///cmd_vel";
      params["speedFactor"] = 0.25;
    } else if (worldState.humanPresent) {
      action = "proceed_cautious";
      resource = "ros2:///cmd_vel";
      params["speedFactor"] = 0.5;
    } else {
      action = "proceed";
      resource = "ros2:///cmd_vel";
      params["speedFactor"] = 1.0;
    }

    const recommendation: SintActionRecommendation = {
      action,
      resource,
      params,
      confidence: avgConfidence,
      isSafetyRelevant,
    };

    // Emit event
    if (this.onEvent) {
      this.onEvent({
        eventType: "engine.system1.action_recommendation",
        payload: {
          action: recommendation.action,
          resource: recommendation.resource,
          confidence: recommendation.confidence,
          isSafetyRelevant: recommendation.isSafetyRelevant,
          objectCount: worldState.objects.length,
          anomalyCount: worldState.anomalyFlags.length,
        },
      });
    }

    return recommendation;
  }
}

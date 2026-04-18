/**
 * Avatar Bridge — connects SINT OS to the SINT Face (3D avatar).
 *
 * Bridges the SINT Protocol governance layer to the avatar's
 * Conversation Compiler + Widget HUD. Governance events generate
 * avatar reactions (expressions, animations, widgets).
 */

import type { AvatarConfig } from "./types.js";
import type { GovernanceResult, SintTier } from "@sint-ai/openclaw-adapter";

/** Widget command sent to the avatar. */
export interface AvatarWidget {
  type: string;
  data: Record<string, unknown>;
  position?: "left" | "right" | "bottom" | "fullscreen";
  duration?: number;
}

/** Compiled message for the avatar. */
export interface AvatarMessage {
  spoken: string;
  display: string;
  emotion: string;
  animation: string;
  widgets: AvatarWidget[];
}

/** Map governance tiers to avatar expressions. */
const TIER_EXPRESSIONS: Record<SintTier, string> = {
  T0: "default",
  T1: "default",
  T2: "thinking",
  T3: "surprised",
};

/** Map governance outcomes to avatar animations. */
const OUTCOME_ANIMATIONS: Record<string, string> = {
  approve: "Head-Nod-Yes",
  deny: "Thoughtful-Head-Shake",
  escalate: "Thinking",
};

/**
 * Bridge between SINT governance events and the Avatar face.
 */
export class AvatarBridge {
  private readonly config: AvatarConfig;
  private connected = false;

  constructor(config: AvatarConfig) {
    this.config = {
      enableCompiler: true,
      enableWidgets: true,
      ...config,
    };
  }

  /**
   * Check if the avatar server is reachable.
   */
  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.serverUrl}/api/health`, {
        signal: AbortSignal.timeout(3000),
      });
      this.connected = res.ok;
      return res.ok;
    } catch {
      this.connected = false;
      return false;
    }
  }

  /**
   * Send a chat message to the avatar.
   */
  async sendMessage(text: string): Promise<AvatarMessage | null> {
    try {
      const res = await fetch(`${this.config.serverUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      return (await res.json()) as AvatarMessage;
    } catch {
      return null;
    }
  }

  /**
   * Convert a governance result into an avatar reaction.
   *
   * Used to make the avatar visually react to SINT governance events:
   * - T0 approve → nod, default face
   * - T2 deny → head shake, thinking face
   * - T3 escalate → surprised, spawn approval widget
   */
  governanceToReaction(result: GovernanceResult): AvatarMessage {
    const expression = TIER_EXPRESSIONS[result.tier] ?? "default";
    const animation = OUTCOME_ANIMATIONS[result.outcome] ?? "Idle";
    const widgets: AvatarWidget[] = [];

    // Spawn a status widget for non-trivial governance events
    if (result.tier !== "T0") {
      widgets.push({
        type: "status",
        data: {
          label: `Governance: ${result.tier}`,
          status:
            result.outcome === "approve"
              ? "success"
              : result.outcome === "deny"
                ? "error"
                : "pending",
          detail: result.reason ?? result.outcome,
        },
        position: "right",
        duration: result.outcome === "approve" ? 3000 : 8000,
      });
    }

    // Spawn approval widget when escalated
    if (result.outcome === "escalate" && result.approvalId) {
      widgets.push({
        type: "action",
        data: {
          label: "Approval Required",
          description: result.reason ?? "Human approval needed for this action",
          prompt: `Approve action? (ID: ${result.approvalId})`,
          confirmText: "Approve",
          variant: "danger",
        },
        position: "right",
        duration: 30_000,
      });
    }

    // Spoken summary
    let spoken: string;
    switch (result.outcome) {
      case "approve":
        spoken =
          result.tier === "T0"
            ? ""
            : `Approved. ${result.reason ?? ""}`.trim();
        break;
      case "deny":
        spoken = `Blocked. ${result.reason ?? "Policy denied this action."}`;
        break;
      case "escalate":
        spoken = "This needs your approval before I can proceed.";
        break;
    }

    return {
      spoken,
      display: spoken,
      emotion: expression,
      animation,
      widgets,
    };
  }

  /** Whether the avatar is currently connected. */
  isConnected(): boolean {
    return this.connected;
  }

  /** Get the server URL. */
  getServerUrl(): string {
    return this.config.serverUrl;
  }
}

/**
 * SintOS — unified entrypoint for the SINT Operating System.
 *
 * Orchestrates all SINT OS components:
 * - OpenClaw Adapter (governance middleware)
 * - Avatar Bridge (3D face + Conversation Compiler)
 * - Evidence HUD (real-time ledger viewer)
 * - System State Tracker (cross-system policies)
 *
 * @example
 * ```typescript
 * import { SintOS } from "@sint/os-core";
 *
 * const os = new SintOS({
 *   gatewayUrl: "http://localhost:4100",
 *   agentId: "my-agent",
 *   openclawWsUrl: "ws://127.0.0.1:18789",
 *   avatar: {
 *     serverUrl: "http://localhost:3005",
 *   },
 *   evidenceHud: { enabled: true },
 * });
 *
 * await os.boot();
 * const status = os.status();
 * await os.shutdown();
 * ```
 */

import type { SintOSConfig, SintOSStatus } from "./types.js";
import {
  OpenClawAdapter,
  DEFAULT_PHYSICAL_POLICIES,
} from "@sint/openclaw-adapter";
import type { GovernanceResult } from "@sint/openclaw-adapter";
import { AvatarBridge } from "./avatar-bridge.js";
import { EvidenceHUD } from "./evidence-hud.js";
import type { EvidenceEntry } from "./evidence-hud.js";

export class SintOS {
  private readonly config: SintOSConfig;
  private readonly adapter: OpenClawAdapter;
  private readonly avatar: AvatarBridge | null;
  private readonly evidenceHud: EvidenceHUD | null;
  private running = false;

  /** Stats counters. */
  private stats = {
    totalIntercepts: 0,
    approved: 0,
    denied: 0,
    escalated: 0,
  };

  constructor(config: SintOSConfig) {
    this.config = {
      openclawWsUrl: "ws://127.0.0.1:18789",
      ...config,
    };

    // Initialize the OpenClaw adapter
    this.adapter = new OpenClawAdapter({
      gatewayUrl: config.gatewayUrl,
      agentId: config.agentId,
      token: config.token,
      apiKey: config.apiKey,
      crossSystemPolicies:
        config.crossSystemPolicies ?? DEFAULT_PHYSICAL_POLICIES,
      ...config.openclawAdapter,
    });

    // Initialize avatar bridge if configured
    this.avatar = config.avatar
      ? new AvatarBridge(config.avatar)
      : null;

    // Initialize evidence HUD if configured
    this.evidenceHud =
      config.evidenceHud?.enabled
        ? new EvidenceHUD(config.evidenceHud)
        : null;
  }

  /**
   * Boot SINT OS — connect all components and verify health.
   */
  async boot(): Promise<{
    success: boolean;
    components: Record<string, boolean>;
  }> {
    const components: Record<string, boolean> = {};

    // Check SINT gateway health
    try {
      const res = await fetch(`${this.config.gatewayUrl}/v1/health`, {
        signal: AbortSignal.timeout(5000),
      });
      components["gateway"] = res.ok;
    } catch {
      components["gateway"] = false;
    }

    // Check avatar health
    if (this.avatar) {
      components["avatar"] = await this.avatar.checkHealth();
    }

    // Evidence HUD starts immediately (no external connection needed initially)
    if (this.evidenceHud) {
      components["evidenceHud"] = true;
    }

    // OpenClaw adapter is always ready (connects on first call)
    components["openclawAdapter"] = true;

    this.running = true;

    return {
      success: Object.values(components).some((v) => v),
      components,
    };
  }

  /**
   * Shut down SINT OS.
   */
  async shutdown(): Promise<void> {
    this.running = false;
    // Clear state tracker
    this.adapter.getStateTracker().clear();
    // Clear evidence HUD
    this.evidenceHud?.clear();
  }

  /**
   * Get the OpenClaw adapter for governing tool calls.
   */
  getAdapter(): OpenClawAdapter {
    return this.adapter;
  }

  /**
   * Get the avatar bridge (if configured).
   */
  getAvatar(): AvatarBridge | null {
    return this.avatar;
  }

  /**
   * Get the evidence HUD (if configured).
   */
  getEvidenceHUD(): EvidenceHUD | null {
    return this.evidenceHud;
  }

  /**
   * Govern a tool call and optionally react via avatar.
   *
   * This is the main entry point for governed tool execution.
   * It intercepts the call, logs evidence, and triggers avatar reactions.
   */
  async govern(
    type: "tool" | "mcp" | "node",
    call: Record<string, unknown>,
  ): Promise<GovernanceResult> {
    let result: GovernanceResult;

    switch (type) {
      case "tool":
        result = await this.adapter.governToolCall(call as any);
        break;
      case "mcp":
        result = await this.adapter.governMCPCall(call as any);
        break;
      case "node":
        result = await this.adapter.governNodeAction(call as any);
        break;
    }

    // Track stats
    this.stats.totalIntercepts++;
    switch (result.outcome) {
      case "approve":
        this.stats.approved++;
        break;
      case "deny":
        this.stats.denied++;
        break;
      case "escalate":
        this.stats.escalated++;
        break;
    }

    // Log to evidence HUD
    if (this.evidenceHud && result.evidenceId) {
      this.evidenceHud.addEntry({
        id: result.evidenceId,
        timestamp: new Date().toISOString(),
        agentId: this.config.agentId,
        resource: (call as any).tool ?? (call as any).server ?? (call as any).nodeId ?? "unknown",
        action: (call as any).action ?? "execute",
        tier: result.tier,
        outcome: result.outcome,
        hash: result.evidenceId,
        reason: result.reason,
      });
    }

    // Trigger avatar reaction for non-T0 events
    if (this.avatar?.isConnected() && result.tier !== "T0") {
      // Fire-and-forget — don't block governance on avatar
      void this.avatar.sendMessage(
        this.avatar.governanceToReaction(result).spoken,
      );
    }

    return result;
  }

  /**
   * Get full SINT OS status.
   */
  status(): SintOSStatus {
    return {
      running: this.running,
      gateway: {
        connected: this.running, // simplified — real impl would track connection state
        version: undefined,
        url: this.config.gatewayUrl,
      },
      openclaw: {
        connected: this.running,
        wsUrl: this.config.openclawWsUrl ?? "ws://127.0.0.1:18789",
      },
      avatar: {
        connected: this.avatar?.isConnected() ?? false,
        serverUrl: this.avatar?.getServerUrl() ?? "",
        compilerEnabled: this.config.avatar?.enableCompiler ?? false,
        widgetCount: 0, // would need real-time tracking
      },
      evidenceHud: {
        enabled: this.evidenceHud !== null,
        entriesCount: this.evidenceHud?.count ?? 0,
        streamConnected: this.evidenceHud !== null,
      },
      activeStates: Array.from(
        this.adapter.getStateTracker().getActive(),
      ),
      stats: { ...this.stats },
    };
  }

  /**
   * Check if SINT OS is running.
   */
  isRunning(): boolean {
    return this.running;
  }
}

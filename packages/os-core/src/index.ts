/**
 * @sint/os-core — SINT OS Main Entrypoint.
 *
 * SINT OS = OpenClaw (agent runtime) + SINT Protocol (governance) + Avatar (face) + Multimodal (Jarvis bridge)
 *
 * This package provides:
 * 1. SintOS class — unified boot/shutdown lifecycle
 * 2. OpenClaw adapter — governance middleware for all OpenClaw operations
 * 3. Avatar bridge — connects 3D face + Conversation Compiler + Widget HUD
 * 4. Multimodal bridge — voice (Qwen3.5-Omni / ElevenLabs), gesture, holographic HUD
 * 5. Evidence HUD — real-time ledger viewer
 *
 * @module @sint/os-core
 */

export { SintOS } from "./sint-os.js";
export { AvatarBridge } from "./avatar-bridge.js";
export { EvidenceHUD } from "./evidence-hud.js";
export type { SintOSConfig, SintOSStatus, AvatarConfig, EvidenceHUDConfig } from "./types.js";

// Re-export OpenClaw adapter
export {
  OpenClawAdapter,
  SystemStateTracker,
  DEFAULT_PHYSICAL_POLICIES,
} from "@sint/openclaw-adapter";
export type {
  OpenClawToolCall,
  OpenClawMCPCall,
  OpenClawNodeAction,
  SintTier,
  GovernanceResult,
  OpenClawAdapterConfig,
  CrossSystemPolicy,
} from "@sint/openclaw-adapter";

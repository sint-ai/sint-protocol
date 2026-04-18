/**
 * Type definitions for SINT OS.
 */

import type { OpenClawAdapterConfig, CrossSystemPolicy } from "@sint-ai/openclaw-adapter";

/** Full SINT OS configuration. */
export interface SintOSConfig {
  /** SINT Protocol gateway URL. */
  gatewayUrl: string;

  /** Agent identifier (Ed25519 public key hex). */
  agentId: string;

  /** OpenClaw gateway WebSocket URL. Default: "ws://127.0.0.1:18789". */
  openclawWsUrl?: string;

  /** Capability token. */
  token?: string;

  /** Admin API key for the SINT gateway. */
  apiKey?: string;

  /** Avatar configuration (optional — SINT Face). */
  avatar?: AvatarConfig;

  /** Evidence HUD configuration (optional). */
  evidenceHud?: EvidenceHUDConfig;

  /** Cross-system policies for physical AI safety. */
  crossSystemPolicies?: CrossSystemPolicy[];

  /** OpenClaw adapter overrides. */
  openclawAdapter?: Partial<OpenClawAdapterConfig>;
}

/** Avatar (SINT Face) configuration. */
export interface AvatarConfig {
  /** Avatar server URL. Default: "http://localhost:3005". */
  serverUrl: string;

  /** Whether to enable the Conversation Compiler. Default: true. */
  enableCompiler?: boolean;

  /** Whether to enable Widget HUD. Default: true. */
  enableWidgets?: boolean;

  /** OpenAI API key for the Conversation Compiler (gpt-4.1-nano). */
  openaiApiKey?: string;

  /** ElevenLabs API key for TTS. */
  elevenlabsApiKey?: string;

  /** ElevenLabs voice ID. */
  voiceId?: string;
}

/** Evidence HUD configuration. */
export interface EvidenceHUDConfig {
  /** Whether to enable the real-time evidence HUD. Default: true. */
  enabled: boolean;

  /** Maximum entries to display. Default: 50. */
  maxEntries?: number;

  /** Filter: only show entries above this tier. */
  minTier?: string;

  /** SSE endpoint override. */
  sseUrl?: string;
}

/** SINT OS runtime status. */
export interface SintOSStatus {
  /** Whether the OS is running. */
  running: boolean;

  /** SINT gateway health. */
  gateway: {
    connected: boolean;
    version?: string;
    url: string;
  };

  /** OpenClaw connection status. */
  openclaw: {
    connected: boolean;
    wsUrl: string;
  };

  /** Avatar status. */
  avatar: {
    connected: boolean;
    serverUrl: string;
    compilerEnabled: boolean;
    widgetCount: number;
  };

  /** Evidence HUD status. */
  evidenceHud: {
    enabled: boolean;
    entriesCount: number;
    streamConnected: boolean;
  };

  /** Cross-system state. */
  activeStates: string[];

  /** Governance statistics. */
  stats: {
    totalIntercepts: number;
    approved: number;
    denied: number;
    escalated: number;
  };
}

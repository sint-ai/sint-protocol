export type InterfacePanelId = "approvals" | "audit" | "context" | "memory" | "status";
export type InterfaceMode = "hud" | "compact" | "voice-only" | "silent";
export type VoicePriority = "low" | "normal" | "urgent";

export interface InterfaceState {
  readonly mode: InterfaceMode;
  readonly isListening: boolean;
  readonly isSpeaking: boolean;
  readonly activePanels: readonly InterfacePanelId[];
  readonly memoryContextSize: number;
  readonly sessionId: string;
}

export interface HudPanelUpdate {
  readonly panel: InterfacePanelId;
  readonly data: unknown;
  readonly timestamp: string;
}

export interface VoiceOutput {
  readonly text: string;
  readonly priority: VoicePriority;
  readonly timestamp: string;
}

export interface OperatorNotification {
  readonly message: string;
  readonly action?: {
    readonly label: string;
    readonly tool: string;
    readonly args: unknown;
  };
  readonly timestamp: string;
}

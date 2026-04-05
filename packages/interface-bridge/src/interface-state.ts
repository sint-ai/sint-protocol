import type { InterfaceMode, InterfacePanelId, InterfaceState } from "./types.js";

export class InterfaceStateManager {
  private mode: InterfaceMode = "hud";
  private listening = false;
  private speaking = false;
  private panels: Set<InterfacePanelId> = new Set(["approvals", "context"]);
  private memorySize = 0;
  private readonly sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  getState(): InterfaceState {
    return {
      mode: this.mode,
      isListening: this.listening,
      isSpeaking: this.speaking,
      activePanels: Array.from(this.panels) as InterfacePanelId[],
      memoryContextSize: this.memorySize,
      sessionId: this.sessionId,
    };
  }

  setMode(mode: InterfaceMode): void {
    this.mode = mode;
  }

  setListening(value: boolean): void {
    this.listening = value;
  }

  setSpeaking(value: boolean): void {
    this.speaking = value;
  }

  setMemorySize(size: number): void {
    this.memorySize = size;
  }

  showPanel(panel: InterfacePanelId): void {
    this.panels.add(panel);
  }

  hidePanel(panel: InterfacePanelId): void {
    this.panels.delete(panel);
  }
}

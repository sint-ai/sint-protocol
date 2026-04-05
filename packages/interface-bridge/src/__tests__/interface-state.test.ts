import { describe, it, expect, beforeEach } from "vitest";
import { InterfaceStateManager } from "../interface-state.js";
import type { InterfaceMode, InterfacePanelId } from "../types.js";

describe("InterfaceStateManager", () => {
  let manager: InterfaceStateManager;

  beforeEach(() => {
    manager = new InterfaceStateManager("test-session-001");
  });

  // ── Initial defaults ──────────────────────────────────────────────────────

  it("initialises with mode = hud", () => {
    expect(manager.getState().mode).toBe("hud");
  });

  it("initialises with isListening = false", () => {
    expect(manager.getState().isListening).toBe(false);
  });

  it("initialises with isSpeaking = false", () => {
    expect(manager.getState().isSpeaking).toBe(false);
  });

  it("initialises with memoryContextSize = 0", () => {
    expect(manager.getState().memoryContextSize).toBe(0);
  });

  it("initialises with the provided sessionId", () => {
    expect(manager.getState().sessionId).toBe("test-session-001");
  });

  it("initialises with default activePanels containing approvals and context", () => {
    const { activePanels } = manager.getState();
    expect(activePanels).toContain("approvals");
    expect(activePanels).toContain("context");
  });

  it("getState returns a snapshot (not a live reference)", () => {
    const state1 = manager.getState();
    manager.setMode("silent");
    const state2 = manager.getState();
    expect(state1.mode).toBe("hud");
    expect(state2.mode).toBe("silent");
  });

  // ── setMode ───────────────────────────────────────────────────────────────

  it("setMode updates the mode to compact", () => {
    manager.setMode("compact");
    expect(manager.getState().mode).toBe("compact");
  });

  it("setMode updates the mode to voice-only", () => {
    manager.setMode("voice-only");
    expect(manager.getState().mode).toBe("voice-only");
  });

  it("setMode updates the mode to silent", () => {
    manager.setMode("silent");
    expect(manager.getState().mode).toBe("silent");
  });

  it("setMode can be called multiple times", () => {
    const modes: InterfaceMode[] = ["compact", "voice-only", "silent", "hud"];
    for (const mode of modes) {
      manager.setMode(mode);
      expect(manager.getState().mode).toBe(mode);
    }
  });

  // ── setListening / setSpeaking ────────────────────────────────────────────

  it("setListening(true) sets isListening to true", () => {
    manager.setListening(true);
    expect(manager.getState().isListening).toBe(true);
  });

  it("setListening(false) resets isListening to false", () => {
    manager.setListening(true);
    manager.setListening(false);
    expect(manager.getState().isListening).toBe(false);
  });

  it("setSpeaking(true) sets isSpeaking to true", () => {
    manager.setSpeaking(true);
    expect(manager.getState().isSpeaking).toBe(true);
  });

  it("setSpeaking(false) resets isSpeaking to false", () => {
    manager.setSpeaking(true);
    manager.setSpeaking(false);
    expect(manager.getState().isSpeaking).toBe(false);
  });

  it("listening and speaking states are independent", () => {
    manager.setListening(true);
    manager.setSpeaking(true);
    expect(manager.getState().isListening).toBe(true);
    expect(manager.getState().isSpeaking).toBe(true);

    manager.setListening(false);
    expect(manager.getState().isListening).toBe(false);
    expect(manager.getState().isSpeaking).toBe(true);
  });

  // ── setMemorySize ─────────────────────────────────────────────────────────

  it("setMemorySize updates memoryContextSize", () => {
    manager.setMemorySize(42);
    expect(manager.getState().memoryContextSize).toBe(42);
  });

  it("setMemorySize can be set to zero", () => {
    manager.setMemorySize(100);
    manager.setMemorySize(0);
    expect(manager.getState().memoryContextSize).toBe(0);
  });

  it("setMemorySize handles large values", () => {
    manager.setMemorySize(100_000);
    expect(manager.getState().memoryContextSize).toBe(100_000);
  });

  // ── showPanel / hidePanel ─────────────────────────────────────────────────

  it("showPanel adds a panel to activePanels", () => {
    manager.showPanel("audit");
    expect(manager.getState().activePanels).toContain("audit");
  });

  it("showPanel is idempotent (no duplicates)", () => {
    manager.showPanel("memory");
    manager.showPanel("memory");
    const count = manager.getState().activePanels.filter((p) => p === "memory").length;
    expect(count).toBe(1);
  });

  it("hidePanel removes a panel from activePanels", () => {
    manager.showPanel("status");
    manager.hidePanel("status");
    expect(manager.getState().activePanels).not.toContain("status");
  });

  it("hidePanel on an absent panel does nothing", () => {
    const before = manager.getState().activePanels.length;
    manager.hidePanel("audit");
    expect(manager.getState().activePanels.length).toBe(before);
  });

  it("can show and hide all panel types", () => {
    const panels: InterfacePanelId[] = ["approvals", "audit", "context", "memory", "status"];
    for (const panel of panels) {
      manager.showPanel(panel);
      expect(manager.getState().activePanels).toContain(panel);
      manager.hidePanel(panel);
      expect(manager.getState().activePanels).not.toContain(panel);
    }
  });

  it("activePanels is returned as a readonly array", () => {
    const { activePanels } = manager.getState();
    // Array.from the readonly array to verify it is enumerable
    expect(Array.isArray(activePanels)).toBe(true);
  });

  // ── getState snapshot ─────────────────────────────────────────────────────

  it("getState reflects multiple simultaneous state changes", () => {
    manager.setMode("compact");
    manager.setListening(true);
    manager.setMemorySize(7);
    manager.showPanel("audit");

    const state = manager.getState();
    expect(state.mode).toBe("compact");
    expect(state.isListening).toBe(true);
    expect(state.memoryContextSize).toBe(7);
    expect(state.activePanels).toContain("audit");
  });

  it("different sessions have independent state", () => {
    const m2 = new InterfaceStateManager("session-002");
    manager.setMode("silent");
    expect(m2.getState().mode).toBe("hud");
  });
});

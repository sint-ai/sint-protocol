/**
 * SINT Operator Interface — Component Tests.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StatusBar } from "../src/components/StatusBar.js";
import { VoiceBar } from "../src/components/VoiceBar.js";

// ---------------------------------------------------------------------------
// StatusBar
// ---------------------------------------------------------------------------

describe("StatusBar", () => {
  it("renders SINT OPERATOR title", () => {
    render(<StatusBar />);
    expect(screen.getByText("SINT OPERATOR")).toBeDefined();
  });

  it("shows em-dash when no agentId provided", () => {
    render(<StatusBar />);
    expect(screen.getByText("—")).toBeDefined();
  });

  it("truncates long agentId", () => {
    render(<StatusBar agentId="abcdefghijklmnopqrstuvwxyz1234567890" />);
    expect(screen.getByText("abcdefghijklmnopqrst...")).toBeDefined();
  });

  it("shows short agentId untruncated", () => {
    render(<StatusBar agentId="agent-short" />);
    expect(screen.getByText("agent-short")).toBeDefined();
  });

  it("renders tier badge when tier provided", () => {
    render(<StatusBar currentTier="T2" />);
    expect(screen.getByText("T2")).toBeDefined();
  });

  it("renders circuit breaker CLOSED by default", () => {
    render(<StatusBar />);
    expect(screen.getByText("○ CLOSED")).toBeDefined();
  });

  it("renders circuit breaker OPEN state", () => {
    render(<StatusBar circuitBreakerState="OPEN" />);
    expect(screen.getByText("● OPEN")).toBeDefined();
  });

  it("renders circuit breaker HALF-OPEN state", () => {
    render(<StatusBar circuitBreakerState="HALF_OPEN" />);
    expect(screen.getByText("◑ HALF-OPEN")).toBeDefined();
  });

  it("shows LIVE when connected", () => {
    render(<StatusBar connectionStatus="connected" />);
    expect(screen.getByText("● LIVE")).toBeDefined();
  });

  it("shows OFFLINE when disconnected", () => {
    render(<StatusBar connectionStatus="disconnected" />);
    expect(screen.getByText("● OFFLINE")).toBeDefined();
  });

  it("shows RECONNECTING status", () => {
    render(<StatusBar connectionStatus="reconnecting" />);
    expect(screen.getByText("● RECONNECTING")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// VoiceBar
// ---------------------------------------------------------------------------

describe("VoiceBar", () => {
  const defaultProps = {
    isListening: false,
    isSpeaking: false,
    isSupported: true,
    interimTranscript: "",
    lastCommand: "",
    error: null,
    onToggle: vi.fn(),
  };

  it("renders mic button", () => {
    render(<VoiceBar {...defaultProps} />);
    // Mic button exists (emoji inside)
    expect(screen.getByRole("button")).toBeDefined();
  });

  it("shows MIC OFF when not listening", () => {
    render(<VoiceBar {...defaultProps} isListening={false} />);
    expect(screen.getByText("MIC OFF")).toBeDefined();
  });

  it("shows MIC ON when listening", () => {
    render(<VoiceBar {...defaultProps} isListening={true} />);
    expect(screen.getByText("MIC ON")).toBeDefined();
  });

  it("shows TTS OFF when not speaking", () => {
    render(<VoiceBar {...defaultProps} isSpeaking={false} />);
    expect(screen.getByText("TTS OFF")).toBeDefined();
  });

  it("shows TTS ON when speaking", () => {
    render(<VoiceBar {...defaultProps} isSpeaking={true} />);
    expect(screen.getByText("TTS ON")).toBeDefined();
    expect(screen.getByText("Speaking...")).toBeDefined();
  });

  it("shows interim transcript when listening", () => {
    render(<VoiceBar {...defaultProps} isListening={true} interimTranscript="approve cmd vel" />);
    expect(screen.getByText("approve cmd vel")).toBeDefined();
  });

  it("shows last command when idle", () => {
    render(<VoiceBar {...defaultProps} lastCommand="status" />);
    expect(screen.getByText("status")).toBeDefined();
  });

  it("shows error message when error set", () => {
    render(<VoiceBar {...defaultProps} error="Microphone permission denied" />);
    expect(screen.getByText(/Microphone permission denied/)).toBeDefined();
  });

  it("shows prompt when supported but idle", () => {
    render(<VoiceBar {...defaultProps} />);
    expect(screen.getByText("Press mic to speak")).toBeDefined();
  });

  it("shows not supported message when unsupported", () => {
    render(<VoiceBar {...defaultProps} isSupported={false} />);
    expect(screen.getByText("Voice not supported")).toBeDefined();
  });

  it("calls onToggle when mic button clicked", () => {
    const onToggle = vi.fn();
    render(<VoiceBar {...defaultProps} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("disables mic button when not supported", () => {
    render(<VoiceBar {...defaultProps} isSupported={false} />);
    const btn = screen.getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

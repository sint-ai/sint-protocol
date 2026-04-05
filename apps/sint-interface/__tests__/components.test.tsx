/**
 * SINT Operator Interface — Component Tests.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StatusBar } from "../src/components/StatusBar.js";
import { ApprovalPanel } from "../src/components/ApprovalPanel.js";
import { ActionStream } from "../src/components/ActionStream.js";
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
// ApprovalPanel
// ---------------------------------------------------------------------------

const mockApproval = {
  requestId: "req-abc123",
  agentId: "agent-test-001",
  resource: "ros2:///cmd_vel",
  action: "publish",
  tier: "T2",
  reason: "Physical state change requires review",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

describe("ApprovalPanel", () => {
  it("shows empty state when no approvals", () => {
    render(<ApprovalPanel approvals={[]} onApprove={vi.fn()} onDeny={vi.fn()} />);
    expect(screen.getByText("No pending approvals")).toBeDefined();
  });

  it("renders panel header", () => {
    render(<ApprovalPanel approvals={[]} onApprove={vi.fn()} onDeny={vi.fn()} />);
    expect(screen.getByText("PENDING APPROVALS")).toBeDefined();
  });

  it("shows count badge when approvals exist", () => {
    render(<ApprovalPanel approvals={[mockApproval]} onApprove={vi.fn()} onDeny={vi.fn()} />);
    expect(screen.getByText("1")).toBeDefined();
  });

  it("renders resource and action", () => {
    render(<ApprovalPanel approvals={[mockApproval]} onApprove={vi.fn()} onDeny={vi.fn()} />);
    expect(screen.getByText("ros2:///cmd_vel")).toBeDefined();
    expect(screen.getByText("publish")).toBeDefined();
  });

  it("renders tier badge", () => {
    render(<ApprovalPanel approvals={[mockApproval]} onApprove={vi.fn()} onDeny={vi.fn()} />);
    expect(screen.getByText("T2")).toBeDefined();
  });

  it("renders reason text", () => {
    render(<ApprovalPanel approvals={[mockApproval]} onApprove={vi.fn()} onDeny={vi.fn()} />);
    expect(screen.getByText("Physical state change requires review")).toBeDefined();
  });

  it("renders approve and deny buttons", () => {
    render(<ApprovalPanel approvals={[mockApproval]} onApprove={vi.fn()} onDeny={vi.fn()} />);
    expect(screen.getByText("✓ APPROVE")).toBeDefined();
    expect(screen.getByText("✗ DENY")).toBeDefined();
  });

  it("calls onApprove with requestId when approve clicked", () => {
    const onApprove = vi.fn();
    render(<ApprovalPanel approvals={[mockApproval]} onApprove={onApprove} onDeny={vi.fn()} />);
    fireEvent.click(screen.getByText("✓ APPROVE"));
    expect(onApprove).toHaveBeenCalledWith("req-abc123");
  });

  it("calls onDeny with requestId when deny clicked", () => {
    const onDeny = vi.fn();
    render(<ApprovalPanel approvals={[mockApproval]} onApprove={vi.fn()} onDeny={onDeny} />);
    fireEvent.click(screen.getByText("✗ DENY"));
    expect(onDeny).toHaveBeenCalledWith("req-abc123");
  });

  it("truncates long agentId in approval card", () => {
    const longIdApproval = { ...mockApproval, agentId: "abcdefghijklmnop12345678" };
    render(<ApprovalPanel approvals={[longIdApproval]} onApprove={vi.fn()} onDeny={vi.fn()} />);
    expect(screen.getByText("abcdefgh...12345678")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// ActionStream
// ---------------------------------------------------------------------------

const mockEvents = [
  {
    id: "ev-1",
    timestamp: "2026-04-04T12:00:00Z",
    type: "DECISION" as const,
    agentId: "agent-abc",
    resource: "mcp://filesystem/readFile",
    action: "call",
    decision: "allow" as const,
    tier: "T0",
  },
  {
    id: "ev-2",
    timestamp: "2026-04-04T12:00:01Z",
    type: "APPROVAL_REQUIRED" as const,
    agentId: "agent-xyz",
    resource: "ros2:///cmd_vel",
    action: "publish",
    tier: "T2",
  },
  {
    id: "ev-3",
    timestamp: "2026-04-04T12:00:02Z",
    type: "DECISION" as const,
    agentId: "agent-abc",
    resource: "mcp://exec/run",
    action: "exec",
    decision: "deny" as const,
    tier: "T3",
  },
];

describe("ActionStream", () => {
  it("renders ACTION STREAM header", () => {
    render(<ActionStream events={[]} />);
    expect(screen.getByText("ACTION STREAM")).toBeDefined();
  });

  it("shows awaiting message when empty", () => {
    render(<ActionStream events={[]} />);
    expect(screen.getByText("Awaiting events...")).toBeDefined();
  });

  it("shows event count", () => {
    render(<ActionStream events={mockEvents} />);
    expect(screen.getByText("3 events")).toBeDefined();
  });

  it("renders ALLOW label for allow decision", () => {
    render(<ActionStream events={[mockEvents[0]!]} />);
    expect(screen.getByText("ALLOW")).toBeDefined();
  });

  it("renders ESCALATE label for APPROVAL_REQUIRED", () => {
    render(<ActionStream events={[mockEvents[1]!]} />);
    expect(screen.getByText("ESCALATE")).toBeDefined();
  });

  it("renders DENY label for deny decision", () => {
    render(<ActionStream events={[mockEvents[2]!]} />);
    expect(screen.getByText("DENY")).toBeDefined();
  });

  it("renders resource names", () => {
    render(<ActionStream events={mockEvents} />);
    expect(screen.getByText(/mcp:\/\/filesystem\/readFile/)).toBeDefined();
    expect(screen.getByText(/ros2:\/\/\/cmd_vel/)).toBeDefined();
  });

  it("renders tier labels", () => {
    render(<ActionStream events={mockEvents} />);
    expect(screen.getByText("T0")).toBeDefined();
    expect(screen.getByText("T2")).toBeDefined();
    expect(screen.getByText("T3")).toBeDefined();
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

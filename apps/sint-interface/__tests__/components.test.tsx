/**
 * SINT Operator Interface — Component Tests.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StatusBar } from "../src/components/StatusBar.js";
import { ApprovalPanel } from "../src/components/ApprovalPanel.js";
import { ActionStream } from "../src/components/ActionStream.js";
import { VoiceBar } from "../src/components/VoiceBar.js";
import { MemoryInspector } from "../src/components/MemoryInspector.js";
import { TransparencyFeed } from "../src/components/TransparencyFeed.js";
import type { TransparencyEvent } from "../src/components/TransparencyFeed.js";
import { ConstraintEditor } from "../src/components/ConstraintEditor.js";

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

// ---------------------------------------------------------------------------
// MemoryInspector
// ---------------------------------------------------------------------------

const mockMemoryEntries = [
  {
    key: "last_waypoint",
    value: { x: 1.2, y: 3.4 },
    tags: ["navigation", "position"],
    storedAt: "2026-04-05T10:22:00.000000Z",
    source: "working" as const,
  },
  {
    key: "operator_override",
    value: "allow_high_speed",
    tags: ["policy"],
    storedAt: "2026-04-05T09:11:00.000000Z",
    source: "operator" as const,
    ledgerEventId: "01900000-0000-7000-0000-000000000001",
  },
];

describe("MemoryInspector", () => {
  it("renders all entries", () => {
    render(<MemoryInspector entries={mockMemoryEntries} />);
    expect(screen.getByText("last_waypoint")).toBeDefined();
    expect(screen.getByText("operator_override")).toBeDefined();
  });

  it("shows empty state when no entries match filter", () => {
    render(<MemoryInspector entries={mockMemoryEntries} />);
    const input = screen.getByPlaceholderText("Filter memories...");
    fireEvent.change(input, { target: { value: "zzz_no_match" } });
    expect(screen.getByText("No entries")).toBeDefined();
  });

  it("filters entries by key keyword", () => {
    render(<MemoryInspector entries={mockMemoryEntries} />);
    const input = screen.getByPlaceholderText("Filter memories...");
    fireEvent.change(input, { target: { value: "waypoint" } });
    expect(screen.getByText("last_waypoint")).toBeDefined();
    expect(screen.queryByText("operator_override")).toBeNull();
  });

  it("filters entries by tag keyword", () => {
    render(<MemoryInspector entries={mockMemoryEntries} />);
    const input = screen.getByPlaceholderText("Filter memories...");
    fireEvent.change(input, { target: { value: "policy" } });
    expect(screen.getByText("operator_override")).toBeDefined();
    expect(screen.queryByText("last_waypoint")).toBeNull();
  });

  it("renders source label for each entry", () => {
    render(<MemoryInspector entries={mockMemoryEntries} />);
    expect(screen.getByText("working")).toBeDefined();
    expect(screen.getByText("operator")).toBeDefined();
  });

  it("renders tags for entries with tags", () => {
    render(<MemoryInspector entries={mockMemoryEntries} />);
    expect(screen.getByText("navigation")).toBeDefined();
    expect(screen.getByText("position")).toBeDefined();
    expect(screen.getByText("policy")).toBeDefined();
  });

  it("shows delete button when onDelete provided", () => {
    render(<MemoryInspector entries={mockMemoryEntries} onDelete={vi.fn()} />);
    const delButtons = screen.getAllByText("del");
    expect(delButtons.length).toBe(2);
  });

  it("shows confirm/cancel buttons after clicking del", () => {
    render(<MemoryInspector entries={mockMemoryEntries} onDelete={vi.fn()} />);
    const delButtons = screen.getAllByText("del");
    fireEvent.click(delButtons[0]!);
    expect(screen.getByText("confirm")).toBeDefined();
    expect(screen.getByText("cancel")).toBeDefined();
  });

  it("calls onDelete with key when confirm clicked", () => {
    const onDelete = vi.fn();
    render(<MemoryInspector entries={mockMemoryEntries} onDelete={onDelete} />);
    const delButtons = screen.getAllByText("del");
    fireEvent.click(delButtons[0]!);
    fireEvent.click(screen.getByText("confirm"));
    expect(onDelete).toHaveBeenCalledWith("last_waypoint");
  });

  it("hides confirm/cancel after cancel clicked", () => {
    render(<MemoryInspector entries={mockMemoryEntries} onDelete={vi.fn()} />);
    const delButtons = screen.getAllByText("del");
    fireEvent.click(delButtons[0]!);
    fireEvent.click(screen.getByText("cancel"));
    expect(screen.queryByText("confirm")).toBeNull();
    expect(screen.queryByText("cancel")).toBeNull();
  });

  it("does not show delete buttons when onDelete not provided", () => {
    render(<MemoryInspector entries={mockMemoryEntries} />);
    expect(screen.queryByText("del")).toBeNull();
  });

  it("shows empty state message when entries array is empty", () => {
    render(<MemoryInspector entries={[]} />);
    expect(screen.getByText("No entries")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TransparencyFeed
// ---------------------------------------------------------------------------

const mockTransparencyEvents: TransparencyEvent[] = [
  {
    id: "te-1",
    timestamp: "2026-04-05T10:22:05Z",
    agentIntent: "Move to docking station",
    gatewayDecision: "allow",
    tier: "T1",
    resource: "ros2:///cmd_vel",
    matched: true,
  },
  {
    id: "te-2",
    timestamp: "2026-04-05T10:21:50Z",
    agentIntent: "Execute shell command",
    gatewayDecision: "deny",
    tier: "T3",
    resource: "mcp://exec/run",
    matched: false,
  },
  {
    id: "te-3",
    timestamp: "2026-04-05T10:20:00Z",
    gatewayDecision: "escalate",
    tier: "T2",
    resource: "ros2:///gripper",
    matched: true,
  },
];

describe("TransparencyFeed", () => {
  it("shows empty state when no events", () => {
    render(<TransparencyFeed events={[]} />);
    expect(screen.getByText("No transparency events yet")).toBeDefined();
  });

  it("renders agent intent text", () => {
    render(<TransparencyFeed events={mockTransparencyEvents} />);
    expect(screen.getByText("Move to docking station")).toBeDefined();
    expect(screen.getByText("Execute shell command")).toBeDefined();
  });

  it("renders gateway decision labels in uppercase", () => {
    render(<TransparencyFeed events={mockTransparencyEvents} />);
    expect(screen.getByText("ALLOW")).toBeDefined();
    expect(screen.getByText("DENY")).toBeDefined();
    expect(screen.getByText("ESCALATE")).toBeDefined();
  });

  it("renders tier labels in brackets", () => {
    render(<TransparencyFeed events={mockTransparencyEvents} />);
    expect(screen.getByText("[T1]")).toBeDefined();
    expect(screen.getByText("[T3]")).toBeDefined();
    expect(screen.getByText("[T2]")).toBeDefined();
  });

  it("renders AGENT INTENT and GATEWAY column headers", () => {
    render(<TransparencyFeed events={[mockTransparencyEvents[0]!]} />);
    expect(screen.getByText("AGENT INTENT")).toBeDefined();
    expect(screen.getByText("GATEWAY")).toBeDefined();
  });

  it("renders multiple events", () => {
    render(<TransparencyFeed events={mockTransparencyEvents} />);
    const intentHeaders = screen.getAllByText("AGENT INTENT");
    expect(intentHeaders.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// ConstraintEditor
// ---------------------------------------------------------------------------

describe("ConstraintEditor", () => {
  const defaultConstraints = {
    maxCallsPerMinute: 30,
    maxPayloadBytes: 4096,
    deniedPatterns: ["/emergency_stop", "/cmd_vel"],
  };

  it("renders token id prefix", () => {
    render(
      <ConstraintEditor
        tokenId="01900000-0000-7000-0000-000000000042"
        constraints={defaultConstraints}
      />
    );
    // The rendered text is "token: 01900000-0000-70…" (16 chars sliced + ellipsis)
    expect(screen.getByText(/token:/)).toBeDefined();
    expect(screen.getByText(/01900000-0000-70/)).toBeDefined();
  });

  it("renders max calls per minute input with existing value", () => {
    render(
      <ConstraintEditor
        tokenId="tok-abc"
        constraints={defaultConstraints}
      />
    );
    // Both maxCpm and maxPayload inputs share placeholder "unlimited"; get all and check first
    const inputs = screen.getAllByPlaceholderText("unlimited") as HTMLInputElement[];
    expect(inputs[0]!.value).toBe("30");
  });

  it("renders denied patterns in textarea", () => {
    render(
      <ConstraintEditor
        tokenId="tok-abc"
        constraints={defaultConstraints}
      />
    );
    const textarea = screen.getByPlaceholderText(/\/cmd_vel/) as HTMLTextAreaElement;
    expect(textarea.value).toContain("/emergency_stop");
    expect(textarea.value).toContain("/cmd_vel");
  });

  it("does not show Apply button initially", () => {
    render(
      <ConstraintEditor
        tokenId="tok-abc"
        constraints={defaultConstraints}
      />
    );
    expect(screen.queryByText("Apply constraints")).toBeNull();
  });

  it("shows Apply button after changing a field", () => {
    render(
      <ConstraintEditor
        tokenId="tok-abc"
        constraints={defaultConstraints}
      />
    );
    const inputs = screen.getAllByPlaceholderText("unlimited");
    fireEvent.change(inputs[0]!, { target: { value: "60" } });
    expect(screen.getByText("Apply constraints")).toBeDefined();
  });

  it("calls onSave with tokenId and updated constraints when Apply clicked", () => {
    const onSave = vi.fn();
    render(
      <ConstraintEditor
        tokenId="tok-abc"
        constraints={defaultConstraints}
        onSave={onSave}
      />
    );
    const inputs = screen.getAllByPlaceholderText("unlimited");
    fireEvent.change(inputs[0]!, { target: { value: "60" } });
    fireEvent.click(screen.getByText("Apply constraints"));
    expect(onSave).toHaveBeenCalledOnce();
    const [calledTokenId, calledConstraints] = onSave.mock.calls[0] as [string, unknown];
    expect(calledTokenId).toBe("tok-abc");
    expect(calledConstraints).toBeTruthy();
  });

  it("hides Apply button after saving", () => {
    render(
      <ConstraintEditor
        tokenId="tok-abc"
        constraints={defaultConstraints}
        onSave={vi.fn()}
      />
    );
    const inputs = screen.getAllByPlaceholderText("unlimited");
    fireEvent.change(inputs[0]!, { target: { value: "60" } });
    fireEvent.click(screen.getByText("Apply constraints"));
    expect(screen.queryByText("Apply constraints")).toBeNull();
  });

  it("renders with empty constraints without crashing", () => {
    render(<ConstraintEditor tokenId="tok-empty" constraints={{}} />);
    expect(screen.getByText(/token:/)).toBeDefined();
  });

  it("renders field labels", () => {
    render(<ConstraintEditor tokenId="tok-abc" constraints={defaultConstraints} />);
    expect(screen.getByText("Max calls / min")).toBeDefined();
    expect(screen.getByText("Max payload bytes")).toBeDefined();
    expect(screen.getByText("Denied patterns (one per line)")).toBeDefined();
  });
});

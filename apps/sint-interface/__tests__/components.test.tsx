/**
 * SINT Operator Interface — Component Tests.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ApprovalRequest } from "../src/api/types.js";
import { ApprovalConductor } from "../src/components/ApprovalConductor.js";
import { StatusBar } from "../src/components/StatusBar.js";
import { VoiceBar } from "../src/components/VoiceBar.js";

const mockIndustrialApprovalRequest: ApprovalRequest = {
  requestId: "req-industrial-001",
  reason: "Robot motion requires human approval",
  requiredTier: "T2_ACT",
  resource: "ros2:///joint_commands",
  action: "publish",
  agentId: "agent-industrial-abcdef123456",
  params: {
    action_type: "robot.motion.pick_and_place",
    target_robot: "robot_abb_irb_1200_01",
    source_pose: "inspection_conveyor_exit",
    target_pose: "pallet_station_A",
    max_velocity_mps: 0.25,
    max_force_newtons: 80,
    tool_type: "vacuum_gripper",
    payload_kg: 2.4,
    requires_simulation_receipt: true,
    requires_human_approval: true,
    requires_safety_zone_clear: true,
    cell_id: "packaging_cell_001",
    simulation_receipt_id: "simr_packaging_001",
  },
  physicalContext: {
    currentVelocityMps: 0.25,
    currentForceNewtons: 80,
  },
  executionContext: {
    factoryReceiptChain: [
      {
        step: "factory_intent_compiled",
        eventType: "factory.intent.compiled",
        digest: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
        previousDigest: null,
      },
      {
        step: "cell_graph_planned",
        eventType: "factory.cell_graph.planned",
        digest: "sha256:5555555555555555555555555555555555555555555555555555555555555555",
        previousDigest: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
      },
      {
        step: "simulation_receipt_verified",
        eventType: "factory.simulation.verified",
        digest: "sha256:6666666666666666666666666666666666666666666666666666666666666666",
        previousDigest: "sha256:5555555555555555555555555555555555555555555555555555555555555555",
      },
      {
        step: "human_approval_granted",
        eventType: "factory.approval.granted",
        digest: "sha256:7777777777777777777777777777777777777777777777777777777777777777",
        previousDigest: "sha256:6666666666666666666666666666666666666666666666666666666666666666",
      },
      {
        step: "execution_receipt_emitted",
        eventType: "factory.execution.receipt",
        digest: "sha256:8888888888888888888888888888888888888888888888888888888888888888",
        previousDigest: "sha256:7777777777777777777777777777777777777777777777777777777777777777",
      },
    ],
  },
  approvalQuorum: {
    required: 2,
    authorized: ["op-alice", "op-bob"],
  },
  approvalCount: 1,
  createdAt: "2026-01-01T00:00:00Z",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

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

// ---------------------------------------------------------------------------
// ApprovalConductor
// ---------------------------------------------------------------------------

describe("ApprovalConductor", () => {
  it("renders industrial approval evidence for factory action requests", () => {
    render(
      <ApprovalConductor
        requests={[mockIndustrialApprovalRequest]}
        connected={true}
        error={null}
        onResolve={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Factory action approval evidence")).toBeDefined();
    expect(screen.getByText("Conductor approvals")).toBeDefined();
    expect(screen.getByText("Factory action")).toBeDefined();
    expect(screen.getByText("robot.motion.pick_and_place")).toBeDefined();
    expect(screen.getByText("packaging_cell_001")).toBeDefined();
    expect(screen.getByText("robot_abb_irb_1200_01")).toBeDefined();
    expect(screen.getByText("inspection_conveyor_exit -> pallet_station_A")).toBeDefined();
    expect(screen.getByText("simr_packaging_001")).toBeDefined();
    expect(screen.getByText("0.25 m/s / 80 N")).toBeDefined();
    expect(screen.getByText("Human approval 1/2")).toBeDefined();
    expect(screen.getByLabelText("Factory receipt chain")).toBeDefined();
    expect(screen.getByText("Receipt chain")).toBeDefined();
    expect(screen.getByText("5 linked")).toBeDefined();
    expect(screen.getByText("factory.intent.compiled")).toBeDefined();
    expect(screen.getByText("factory.execution.receipt")).toBeDefined();
  });

  it("resolves an approval from the conductor buttons", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(
      <ApprovalConductor
        requests={[mockIndustrialApprovalRequest]}
        connected={true}
        error={null}
        onResolve={onResolve}
      />,
    );

    fireEvent.click(screen.getByText("Approve"));

    await waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith("req-industrial-001", "approved");
    });
  });
});

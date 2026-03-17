/**
 * SINT Dashboard — Component Tests.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Header } from "../src/components/Header.js";
import { PendingApprovals } from "../src/components/PendingApprovals.js";
import { AuditLog } from "../src/components/AuditLog.js";
import { OverviewCards } from "../src/components/OverviewCards.js";
import { TierLegend } from "../src/components/TierLegend.js";
import type { ApprovalRequest, HealthResponse, LedgerResponse } from "../src/api/types.js";

const mockHealth: HealthResponse = {
  status: "ok",
  version: "0.1.0",
  protocol: "SINT Gate",
  tokens: 5,
  ledgerEvents: 120,
  revokedTokens: 2,
};

const mockApprovalRequest: ApprovalRequest = {
  requestId: "req-001",
  reason: "T3 exec requires human approval",
  requiredTier: "T3_COMMIT",
  resource: "mcp://exec/run",
  action: "exec.run",
  agentId: "agent-abcdef123456",
  createdAt: "2026-01-01T00:00:00Z",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

const mockLedger: LedgerResponse = {
  events: [
    {
      eventId: "ev-1",
      eventType: "request.received",
      agentId: "agent-abc",
      timestamp: "2026-01-01T12:00:00Z",
      sequenceNumber: "1",
      payload: { resource: "mcp://fs/readFile", action: "call", decision: "allow" },
    },
    {
      eventId: "ev-2",
      eventType: "approval.granted",
      agentId: "agent-xyz",
      timestamp: "2026-01-01T12:01:00Z",
      sequenceNumber: "2",
      payload: { requestId: "req-001" },
    },
  ],
  total: 42,
  chainIntegrity: true,
};

describe("Header", () => {
  it("renders logo and status", () => {
    render(<Header health={mockHealth} sseConnected={true} pendingCount={0} />);
    expect(screen.getByText("SINT")).toBeDefined();
    expect(screen.getByText("Approval Dashboard")).toBeDefined();
    expect(screen.getByText("Live")).toBeDefined();
  });

  it("shows pending badge when count > 0", () => {
    render(<Header health={mockHealth} sseConnected={true} pendingCount={3} />);
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("pending")).toBeDefined();
  });

  it("shows offline when disconnected", () => {
    render(<Header health={null} sseConnected={false} pendingCount={0} />);
    expect(screen.getByText("Offline")).toBeDefined();
  });
});

describe("PendingApprovals", () => {
  it("renders empty state when no requests", () => {
    render(<PendingApprovals requests={[]} onResolved={vi.fn()} />);
    expect(screen.getByText("No pending approvals")).toBeDefined();
  });

  it("renders approval card with details", () => {
    render(<PendingApprovals requests={[mockApprovalRequest]} onResolved={vi.fn()} />);
    expect(screen.getByText("T3_COMMIT")).toBeDefined();
    expect(screen.getByText("mcp://exec/run")).toBeDefined();
    expect(screen.getByText("exec.run")).toBeDefined();
    expect(screen.getByText("Approve")).toBeDefined();
    expect(screen.getByText("Deny")).toBeDefined();
  });

  it("calls resolveApproval on approve click", async () => {
    const mockResolve = vi.fn();

    // Mock the API call
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ requestId: "req-001", resolution: { status: "approved" } }),
    }));

    render(<PendingApprovals requests={[mockApprovalRequest]} onResolved={mockResolve} />);

    const approveButton = screen.getByText("Approve");
    fireEvent.click(approveButton);

    // Wait for async
    await new Promise((r) => setTimeout(r, 50));
    expect(mockResolve).toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});

describe("AuditLog", () => {
  it("renders loading state", () => {
    render(<AuditLog ledger={null} loading={true} />);
    expect(screen.getByText("Loading audit events...")).toBeDefined();
  });

  it("renders empty state", () => {
    render(
      <AuditLog
        ledger={{ events: [], total: 0, chainIntegrity: true }}
        loading={false}
      />,
    );
    expect(screen.getByText("No audit events yet.")).toBeDefined();
  });

  it("renders events with chain integrity", () => {
    render(<AuditLog ledger={mockLedger} loading={false} />);
    expect(screen.getByText("request.received")).toBeDefined();
    expect(screen.getByText("approval.granted")).toBeDefined();
    expect(screen.getByText(/Chain OK/)).toBeDefined();
    expect(screen.getByText(/Showing 2 of 42 events/)).toBeDefined();
  });
});

describe("OverviewCards", () => {
  it("renders all metric cards", () => {
    render(
      <OverviewCards
        health={mockHealth}
        ledger={mockLedger}
        pendingCount={1}
        sseConnected={true}
      />,
    );
    expect(screen.getByText("Pending Approvals")).toBeDefined();
    expect(screen.getByText("Active Tokens")).toBeDefined();
    expect(screen.getByText("Ledger Events")).toBeDefined();
    expect(screen.getByText("Chain Integrity")).toBeDefined();
    expect(screen.getByText("Connection")).toBeDefined();
    expect(screen.getByText("5")).toBeDefined(); // tokens
    expect(screen.getByText("120")).toBeDefined(); // ledger events
    expect(screen.getByText("Verified")).toBeDefined();
  });

  it("shows dash for missing health data", () => {
    render(
      <OverviewCards
        health={null}
        ledger={null}
        pendingCount={0}
        sseConnected={false}
      />,
    );
    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Offline")).toBeDefined();
  });
});

describe("TierLegend", () => {
  it("renders all four tiers", () => {
    render(<TierLegend />);
    expect(screen.getByText("OBSERVE")).toBeDefined();
    expect(screen.getByText("PREPARE")).toBeDefined();
    expect(screen.getByText("ACT")).toBeDefined();
    expect(screen.getByText("COMMIT")).toBeDefined();
  });

  it("shows Auto/Manual labels", () => {
    render(<TierLegend />);
    const autoLabels = screen.getAllByText("Auto");
    const manualLabels = screen.getAllByText("Manual");
    expect(autoLabels).toHaveLength(2); // T0 and T1
    expect(manualLabels).toHaveLength(2); // T2 and T3
  });
});

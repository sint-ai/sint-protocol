/**
 * SINT Dashboard — Main Application.
 *
 * Real-time approval management dashboard for the SINT Protocol.
 * Connects to the Gateway Server via REST + SSE.
 */

import { Header } from "./components/Header.js";
import { OverviewCards } from "./components/OverviewCards.js";
import { PendingApprovals } from "./components/PendingApprovals.js";
import { AuditLog } from "./components/AuditLog.js";
import { TierLegend } from "./components/TierLegend.js";
import { useApprovals } from "./hooks/useApprovals.js";
import { usePolling } from "./hooks/usePolling.js";
import { getHealth, getLedger } from "./api/client.js";

export function App() {
  const { pending, connected, error: sseError, refresh: refreshApprovals } = useApprovals();
  const { data: health } = usePolling(getHealth, 10_000);
  const {
    data: ledger,
    loading: ledgerLoading,
    refresh: refreshLedger,
  } = usePolling(() => getLedger({ limit: 50 }), 5_000);

  function handleApprovalResolved() {
    void refreshApprovals();
    void refreshLedger();
  }

  return (
    <>
      <Header
        health={health}
        sseConnected={connected}
        pendingCount={pending.length}
      />

      <main className="dashboard">
        {sseError && (
          <div className="error-banner">
            &#x26A0; {sseError}
          </div>
        )}

        <OverviewCards
          health={health}
          ledger={ledger}
          pendingCount={pending.length}
          sseConnected={connected}
        />

        <PendingApprovals
          requests={pending}
          onResolved={handleApprovalResolved}
        />

        <div className="dashboard-grid">
          <AuditLog ledger={ledger} loading={ledgerLoading} />
          <TierLegend />
        </div>
      </main>
    </>
  );
}

import { StatusBar } from "./StatusBar.js";
import { ApprovalPanel } from "./ApprovalPanel.js";
import { ActionStream } from "./ActionStream.js";
import { ContextPanel } from "./ContextPanel.js";
import { VoiceBar } from "./VoiceBar.js";
import { useApprovalStream } from "../hooks/useApprovalStream.js";
import { useVoiceInput } from "../hooks/useVoiceInput.js";
import { useTts } from "../hooks/useTts.js";
import { useState, useEffect } from "react";

export function HudLayout({ gatewayUrl, apiKey }: { gatewayUrl: string; apiKey: string }) {
  const { events } = useApprovalStream(gatewayUrl, apiKey);
  const [lastCommand, setLastCommand] = useState("");
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);

  const { speak, isSpeaking } = useTts();
  const voice = useVoiceInput({
    onFinal: (text) => {
      setLastCommand(text);
      handleVoiceCommand(text);
    },
  });

  function handleVoiceCommand(command: string) {
    const lower = command.toLowerCase();
    if (lower.includes("pending") || lower.includes("approval")) {
      speak(`You have ${pendingApprovals.length} pending approvals.`);
    } else if (lower.includes("status")) {
      speak("SINT Policy Gateway is online. All systems nominal.");
    } else {
      speak(`Command received: ${command}`);
    }
  }

  // Filter APPROVAL_REQUIRED events into pending list
  useEffect(() => {
    const pending = events
      .filter((e) => e.type === "APPROVAL_REQUIRED")
      .slice(-10);
    setPendingApprovals(pending);
  }, [events]);

  async function handleApprove(requestId: string) {
    try {
      await fetch(`/v1/approvals/${requestId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify({ action: "approve", approver: "operator-voice" }),
      });
    } catch { /* ignore */ }
  }

  async function handleDeny(requestId: string) {
    try {
      await fetch(`/v1/approvals/${requestId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify({ action: "deny", denier: "operator-voice", reason: "Denied via SINT interface" }),
      });
    } catch { /* ignore */ }
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateRows: "48px 1fr 72px",
      gridTemplateColumns: "280px 1fr 260px",
      height: "100vh",
      background: "#0a0e1a",
      color: "#e0e6f0",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      gap: "1px",
      overflow: "hidden",
    }}>
      {/* Status bar spans full width */}
      <div style={{ gridColumn: "1 / -1" }}>
        <StatusBar connectionStatus={voice.isListening ? "connected" : "disconnected"} />
      </div>

      {/* Left: Approvals */}
      <div style={{ background: "#0d1220", overflowY: "auto", padding: "12px" }}>
        <ApprovalPanel
          approvals={pendingApprovals.map(e => ({
            requestId: e.requestId ?? e.id ?? "",
            agentId: e.agentId ?? "unknown",
            resource: e.resource ?? "",
            action: e.action ?? "",
            tier: e.tier ?? "T1",
          }))}
          onApprove={handleApprove}
          onDeny={handleDeny}
        />
      </div>

      {/* Center: Action stream */}
      <div style={{ background: "#080c18", overflowY: "auto", padding: "12px" }}>
        <ActionStream events={events.map(e => ({
          id: e.requestId,
          timestamp: e.timestamp,
          type: e.type,
          agentId: e.agentId,
          resource: e.resource,
          action: e.action,
          tier: e.tier,
          decision: e.type === "DECISION" ? (e as { decision: string }).decision as "allow" | "deny" | "escalate" | "transform" : undefined,
        }))} />
      </div>

      {/* Right: Context */}
      <div style={{ background: "#0d1220", overflowY: "auto", padding: "12px" }}>
        <ContextPanel />
      </div>

      {/* Voice bar spans full width */}
      <div style={{ gridColumn: "1 / -1", background: "#0a1028", borderTop: "1px solid #1a2040" }}>
        <VoiceBar
          isListening={voice.isListening}
          isSpeaking={isSpeaking}
          isSupported={voice.isSupported}
          interimTranscript={voice.interimTranscript}
          lastCommand={lastCommand}
          error={voice.error}
          onToggle={voice.toggleListening}
        />
      </div>
    </div>
  );
}

import { useState } from "react";
import { StatusBar } from "./StatusBar.js";
import { VoiceBar } from "./VoiceBar.js";
import { ApprovalConductor } from "./ApprovalConductor.js";
import { useApprovals } from "../hooks/useApprovals.js";
import { useVoiceInput } from "../hooks/useVoiceInput.js";
import { useTts } from "../hooks/useTts.js";

interface HudLayoutProps {
  gatewayUrl: string;
}

export function HudLayout({ gatewayUrl }: HudLayoutProps) {
  const [lastCommand, setLastCommand] = useState("");
  const { speak, isSpeaking } = useTts();
  const approvals = useApprovals(gatewayUrl);
  const voice = useVoiceInput({
    onFinal: (text) => {
      setLastCommand(text);
      speak(`Command received: ${text}`);
    },
  });

  async function handleResolve(requestId: string, status: "approved" | "denied") {
    await approvals.resolve(requestId, {
      status,
      by: "operator-hud",
    });
    speak(`Approval ${status}`);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "relative",
        background: "transparent",
        color: "#fff",
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      }}
    >
      <StatusBar
        agentId="did:key:z6MkOperator"
        currentTier="T1"
        circuitBreakerState="CLOSED"
        connectionStatus="connected"
      />
      {/* Transparent pass-through area — Console runs behind */}
      <div style={{ flex: 1 }} />
      <ApprovalConductor
        requests={approvals.pending}
        connected={approvals.connected}
        error={approvals.error}
        onResolve={handleResolve}
      />
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
  );
}

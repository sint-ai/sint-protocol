import { useState } from "react";
import { StatusBar } from "./StatusBar.js";
import { VoiceBar } from "./VoiceBar.js";
import { useVoiceInput } from "../hooks/useVoiceInput.js";
import { useTts } from "../hooks/useTts.js";

interface HudLayoutProps {
  gatewayUrl: string;
}

export function HudLayout({ gatewayUrl: _gatewayUrl }: HudLayoutProps) {
  const [lastCommand, setLastCommand] = useState("");
  const { speak, isSpeaking } = useTts();
  const voice = useVoiceInput({
    onFinal: (text) => {
      setLastCommand(text);
      speak(`Command received: ${text}`);
    },
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
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

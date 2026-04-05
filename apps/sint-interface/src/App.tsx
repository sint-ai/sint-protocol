import { HudLayout } from "./components/HudLayout.js";
import { useInterfaceState } from "./hooks/useInterfaceState.js";
import { useState } from "react";

export function App() {
  const { state, setApiKey } = useInterfaceState();
  const [showSetup, setShowSetup] = useState(!state.apiKey);

  if (showSetup) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0a0e1a", color: "#e0e6f0", fontFamily: "monospace" }}>
        <h1 style={{ color: "#00d4ff", fontSize: "1.5rem", marginBottom: "8px" }}>SINT OPERATOR INTERFACE</h1>
        <p style={{ color: "#8896b0", marginBottom: "24px", fontSize: "0.85rem" }}>Enter your SINT Gateway API key to connect</p>
        <input
          type="password"
          placeholder="API Key (or leave blank for open gateway)"
          style={{ background: "#0d1220", border: "1px solid #1a3060", color: "#e0e6f0", padding: "10px 16px", borderRadius: "4px", fontFamily: "monospace", width: "320px", marginBottom: "12px" }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setApiKey((e.target as HTMLInputElement).value);
              setShowSetup(false);
            }
          }}
        />
        <button
          style={{ background: "#00d4ff20", border: "1px solid #00d4ff", color: "#00d4ff", padding: "8px 24px", borderRadius: "4px", cursor: "pointer", fontFamily: "monospace" }}
          onClick={() => setShowSetup(false)}
        >
          Connect &rarr;
        </button>
      </div>
    );
  }

  return <HudLayout gatewayUrl={state.gatewayUrl} apiKey={state.apiKey} />;
}

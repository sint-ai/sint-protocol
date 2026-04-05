interface VoiceBarProps {
  isListening: boolean;
  isSpeaking: boolean;
  isSupported: boolean;
  interimTranscript: string;
  lastCommand: string;
  error: string | null;
  onToggle: () => void;
}

export function VoiceBar({
  isListening,
  isSpeaking,
  isSupported,
  interimTranscript,
  lastCommand,
  error,
  onToggle,
}: VoiceBarProps) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      height: "72px",
      padding: "0 16px",
      gap: "16px",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    }}>
      {/* Mic toggle button */}
      <button
        onClick={onToggle}
        disabled={!isSupported}
        title={isSupported ? (isListening ? "Stop listening" : "Start listening") : "Not supported"}
        style={{
          width: "44px",
          height: "44px",
          borderRadius: "50%",
          border: isListening ? "2px solid #00d4ff" : "2px solid #1a3060",
          background: isListening ? "#00d4ff22" : "#0a1028",
          color: isListening ? "#00d4ff" : "#4a5670",
          cursor: isSupported ? "pointer" : "not-allowed",
          fontSize: "1.2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          animation: isListening ? "micPulse 1.5s ease-in-out infinite" : undefined,
          transition: "border-color 0.2s, background 0.2s",
        }}
      >
        🎙️
      </button>

      {/* Transcripts */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {interimTranscript ? (
          <div style={{
            color: "#c0cce0",
            fontSize: "0.82rem",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            <span style={{ color: "#00d4ff" }}>▶ </span>
            {interimTranscript}
            <span style={{ color: "#4a5670", animation: "blink 1s step-end infinite" }}>|</span>
          </div>
        ) : lastCommand ? (
          <div style={{
            color: "#4a5670",
            fontSize: "0.78rem",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            <span style={{ color: "#2a3850" }}>last: </span>
            {lastCommand}
          </div>
        ) : (
          <div style={{ color: "#2a3850", fontSize: "0.75rem" }}>
            {isListening ? "Listening..." : isSupported ? "Press mic to speak" : "Voice not supported"}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ color: "#ff4444", fontSize: "0.68rem", marginTop: "2px" }}>
            ⚠ {error}
          </div>
        )}
      </div>

      {/* TTS indicator */}
      {isSpeaking && (
        <div style={{
          color: "#00cc66",
          fontSize: "0.72rem",
          display: "flex",
          alignItems: "center",
          gap: "4px",
          animation: "pulse 1s ease-in-out infinite",
        }}>
          <span>◀◀</span> Speaking...
        </div>
      )}

      {/* Status pills */}
      <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
        <span style={{
          fontSize: "0.65rem",
          padding: "2px 6px",
          borderRadius: "3px",
          background: isListening ? "#00d4ff22" : "#1a2040",
          border: isListening ? "1px solid #00d4ff" : "1px solid #2a3050",
          color: isListening ? "#00d4ff" : "#4a5670",
        }}>
          MIC {isListening ? "ON" : "OFF"}
        </span>
        <span style={{
          fontSize: "0.65rem",
          padding: "2px 6px",
          borderRadius: "3px",
          background: isSpeaking ? "#00cc6622" : "#1a2040",
          border: isSpeaking ? "1px solid #00cc66" : "1px solid #2a3050",
          color: isSpeaking ? "#00cc66" : "#4a5670",
        }}>
          TTS {isSpeaking ? "ON" : "OFF"}
        </span>
      </div>

      <style>{`
        @keyframes micPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(0, 212, 255, 0.4); }
          50% { box-shadow: 0 0 0 8px rgba(0, 212, 255, 0); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

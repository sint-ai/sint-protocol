import { useState, useCallback } from "react";

export type InterfaceMode = "hud" | "compact" | "voice-only" | "silent";

export interface InterfaceState {
  mode: InterfaceMode;
  voiceEnabled: boolean;
  ttsEnabled: boolean;
  gatewayUrl: string;
  apiKey: string;
}

export function useInterfaceState() {
  const [state, setState] = useState<InterfaceState>({
    mode: "hud",
    voiceEnabled: true,
    ttsEnabled: true,
    gatewayUrl: import.meta.env.VITE_GATEWAY_URL ?? "",
    apiKey: localStorage.getItem("sint_api_key") ?? "",
  });

  const setMode = useCallback((mode: InterfaceMode) => {
    setState((s) => ({ ...s, mode }));
  }, []);

  const setApiKey = useCallback((key: string) => {
    localStorage.setItem("sint_api_key", key);
    setState((s) => ({ ...s, apiKey: key }));
  }, []);

  const toggleVoice = useCallback(() => {
    setState((s) => ({ ...s, voiceEnabled: !s.voiceEnabled }));
  }, []);

  const toggleTts = useCallback(() => {
    setState((s) => ({ ...s, ttsEnabled: !s.ttsEnabled }));
  }, []);

  return { state, setMode, setApiKey, toggleVoice, toggleTts };
}

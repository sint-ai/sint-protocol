import { HudLayout } from "./components/HudLayout.js";

const GATEWAY_URL = import.meta.env["VITE_GATEWAY_URL"] ?? "http://localhost:3100";

export function App() {
  return <HudLayout gatewayUrl={GATEWAY_URL} />;
}

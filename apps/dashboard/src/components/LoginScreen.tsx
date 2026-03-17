/**
 * SINT Dashboard — Operator Login Screen.
 *
 * Collects operator name and API key before granting
 * access to the approval dashboard.
 */

import { useState, type FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext.js";

export function LoginScreen() {
  const { login, loading, error } = useAuth();
  const [operatorName, setOperatorName] = useState("");
  const [apiKey, setApiKey] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!operatorName.trim() || !apiKey.trim()) return;
    await login(operatorName, apiKey);
  }

  return (
    <div className="login-backdrop">
      <form className="login-card" onSubmit={(e) => void handleSubmit(e)}>
        <div className="login-header">
          <span className="login-icon">&#x1F6E1;</span>
          <h1 className="login-title">SINT Dashboard</h1>
          <p className="login-subtitle">Operator Authentication</p>
        </div>

        {error && (
          <div className="login-error">
            &#x26A0; {error}
          </div>
        )}

        <div className="login-field">
          <label htmlFor="operator-name" className="login-label">
            Operator Name
          </label>
          <input
            id="operator-name"
            type="text"
            className="login-input"
            placeholder="e.g. alice, ops-lead-1"
            value={operatorName}
            onChange={(e) => setOperatorName(e.target.value)}
            autoFocus
            required
            disabled={loading}
          />
          <span className="login-hint">
            Your identity will be recorded in the audit ledger for every approval action.
          </span>
        </div>

        <div className="login-field">
          <label htmlFor="api-key" className="login-label">
            API Key
          </label>
          <input
            id="api-key"
            type="password"
            className="login-input"
            placeholder="SINT gateway API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            required
            disabled={loading}
          />
          <span className="login-hint">
            Set via SINT_API_KEY environment variable on the gateway server.
          </span>
        </div>

        <button
          type="submit"
          className="btn login-btn"
          disabled={loading || !operatorName.trim() || !apiKey.trim()}
        >
          {loading ? "Authenticating..." : "Sign In"}
        </button>

        <div className="login-footer">
          <span className="login-protocol">SINT Gate Protocol v0.1</span>
        </div>
      </form>
    </div>
  );
}

/**
 * SINT Dashboard — Authentication Context.
 *
 * Stores the authenticated operator's identity (name + API key).
 * Persists to sessionStorage so refreshes don't require re-login.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

/** Authenticated operator session. */
export interface OperatorSession {
  /** Human-readable operator name (e.g. "alice", "ops-lead-1"). */
  readonly operatorName: string;
  /** Gateway API key for authenticated requests. */
  readonly apiKey: string;
}

interface AuthContextValue {
  /** Current session, or null if not authenticated. */
  session: OperatorSession | null;
  /** Log in with operator credentials. Returns true if valid. */
  login: (operatorName: string, apiKey: string) => Promise<boolean>;
  /** Clear session and return to login screen. */
  logout: () => void;
  /** Whether a login attempt is in progress. */
  loading: boolean;
  /** Last login error, if any. */
  error: string | null;
}

const STORAGE_KEY = "sint_operator_session";

const AuthContext = createContext<AuthContextValue | null>(null);

function loadSession(): OperatorSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OperatorSession;
    if (parsed.operatorName && parsed.apiKey) return parsed;
    return null;
  } catch {
    return null;
  }
}

function saveSession(session: OperatorSession | null): void {
  if (session) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<OperatorSession | null>(loadSession);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (operatorName: string, apiKey: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      // Validate credentials by hitting the health endpoint with the API key.
      // If the gateway has auth enabled, unauthenticated requests to /v1/approvals
      // will fail, so we test with a protected endpoint.
      const res = await fetch("/v1/approvals/pending", {
        headers: { "X-API-Key": apiKey },
      });

      if (!res.ok) {
        const body = await res.text();
        if (res.status === 401 || res.status === 403) {
          setError("Invalid API key. Check your credentials.");
        } else {
          setError(`Gateway error ${res.status}: ${body}`);
        }
        return false;
      }

      const newSession: OperatorSession = { operatorName: operatorName.trim(), apiKey };
      setSession(newSession);
      saveSession(newSession);
      return true;
    } catch (err) {
      setError(
        err instanceof Error
          ? `Connection failed: ${err.message}`
          : "Failed to connect to gateway",
      );
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setSession(null);
    saveSession(null);
    setError(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, login, logout, loading, error }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Access the auth context. Throws if used outside AuthProvider. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

/**
 * SINT Dashboard — Authentication Tests.
 *
 * Tests the operator login flow, auth context, and
 * API key propagation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "../src/contexts/AuthContext.js";
import { LoginScreen } from "../src/components/LoginScreen.js";
import { configureAuth } from "../src/api/client.js";

// Mock sessionStorage
const sessionStore: Record<string, string> = {};
vi.stubGlobal("sessionStorage", {
  getItem: (key: string) => sessionStore[key] ?? null,
  setItem: (key: string, val: string) => { sessionStore[key] = val; },
  removeItem: (key: string) => { delete sessionStore[key]; },
});

/**
 * Test probe that renders auth state as visible text.
 * This allows assertions on rendered output after React re-renders.
 */
function AuthProbe() {
  const { session, error } = useAuth();
  return (
    <div>
      <span data-testid="session-name">{session?.operatorName ?? "none"}</span>
      <span data-testid="session-key">{session?.apiKey ?? "none"}</span>
      <span data-testid="auth-error">{error ?? "no-error"}</span>
    </div>
  );
}

/** Probe with login/logout controls for testing. */
function AuthControls() {
  const { session, login, logout, error } = useAuth();

  return (
    <div>
      <span data-testid="session-name">{session?.operatorName ?? "none"}</span>
      <span data-testid="auth-error">{error ?? "no-error"}</span>
      <button
        data-testid="login-btn"
        onClick={() => void login("alice", "test-key")}
      >
        Login
      </button>
      <button
        data-testid="bad-login-btn"
        onClick={() => void login("bob", "bad-key")}
      >
        BadLogin
      </button>
      <button data-testid="logout-btn" onClick={logout}>
        Logout
      </button>
    </div>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    for (const key of Object.keys(sessionStore)) {
      delete sessionStore[key];
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts unauthenticated", () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    expect(screen.getByTestId("session-name").textContent).toBe("none");
  });

  it("login validates against gateway and sets session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ count: 0, requests: [] }),
    }));

    render(
      <AuthProvider>
        <AuthControls />
      </AuthProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("login-btn"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("session-name").textContent).toBe("alice");
    });
  });

  it("login fails on 401 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    }));

    render(
      <AuthProvider>
        <AuthControls />
      </AuthProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("bad-login-btn"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-error").textContent).toContain("Invalid API key");
    });
    expect(screen.getByTestId("session-name").textContent).toBe("none");
  });

  it("logout clears session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ count: 0, requests: [] }),
    }));

    render(
      <AuthProvider>
        <AuthControls />
      </AuthProvider>,
    );

    // Login first
    await act(async () => {
      fireEvent.click(screen.getByTestId("login-btn"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("session-name").textContent).toBe("alice");
    });

    // Now logout
    await act(async () => {
      fireEvent.click(screen.getByTestId("logout-btn"));
    });

    expect(screen.getByTestId("session-name").textContent).toBe("none");
  });

  it("persists session to sessionStorage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ count: 0, requests: [] }),
    }));

    render(
      <AuthProvider>
        <AuthControls />
      </AuthProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("login-btn"));
    });

    await waitFor(() => {
      expect(sessionStore["sint_operator_session"]).toBeDefined();
    });

    const stored = JSON.parse(sessionStore["sint_operator_session"]!);
    expect(stored.operatorName).toBe("alice");
    expect(stored.apiKey).toBe("test-key");
  });
});

describe("LoginScreen", () => {
  beforeEach(() => {
    for (const key of Object.keys(sessionStore)) {
      delete sessionStore[key];
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders login form with all fields", () => {
    render(
      <AuthProvider>
        <LoginScreen />
      </AuthProvider>,
    );

    expect(screen.getByText("SINT Dashboard")).toBeDefined();
    expect(screen.getByText("Operator Authentication")).toBeDefined();
    expect(screen.getByLabelText("Operator Name")).toBeDefined();
    expect(screen.getByLabelText("API Key")).toBeDefined();
    expect(screen.getByText("Sign In")).toBeDefined();
  });

  it("disables sign in button when fields are empty", () => {
    render(
      <AuthProvider>
        <LoginScreen />
      </AuthProvider>,
    );

    const signIn = screen.getByText("Sign In") as HTMLButtonElement;
    expect(signIn.disabled).toBe(true);
  });

  it("shows error on failed login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "Forbidden",
    }));

    render(
      <AuthProvider>
        <LoginScreen />
      </AuthProvider>,
    );

    const nameInput = screen.getByLabelText("Operator Name");
    const keyInput = screen.getByLabelText("API Key");

    fireEvent.change(nameInput, { target: { value: "bob" } });
    fireEvent.change(keyInput, { target: { value: "bad-key" } });

    await act(async () => {
      fireEvent.click(screen.getByText("Sign In"));
    });

    await waitFor(() => {
      expect(screen.getByText(/Invalid API key/)).toBeDefined();
    });
  });
});

describe("configureAuth", () => {
  afterEach(() => {
    configureAuth(null);
    vi.restoreAllMocks();
  });

  it("sets API key header for subsequent requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    configureAuth("my-secret-key");

    const { getHealth } = await import("../src/api/client.js");
    await getHealth();

    expect(mockFetch).toHaveBeenCalledWith(
      "/v1/health",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-API-Key": "my-secret-key",
        }),
      }),
    );
  });

  it("clears API key header when passed null", async () => {
    configureAuth("key-1");
    configureAuth(null);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { getHealth } = await import("../src/api/client.js");
    await getHealth();

    const headers = mockFetch.mock.calls[0]![1]?.headers as Record<string, string>;
    expect(headers["X-API-Key"]).toBeUndefined();
  });
});

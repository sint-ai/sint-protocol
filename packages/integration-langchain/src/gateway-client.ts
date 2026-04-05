/**
 * Lightweight HTTP client for the SINT Policy Gateway.
 *
 * Uses native fetch — no external dependencies beyond @sint/client types.
 */

import type { SintGovernanceConfig, SintInterceptResult } from "./types.js";

interface InterceptRequest {
  agentId: string;
  resource: string;
  action: string;
  context?: Record<string, unknown>;
  token?: string;
}

/**
 * Send an intercept request to the SINT Policy Gateway.
 */
export async function intercept(
  config: SintGovernanceConfig,
  request: InterceptRequest
): Promise<SintInterceptResult> {
  const url = `${config.gatewayUrl}/v1/intercept`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.apiKey) {
    headers["X-API-Key"] = config.apiKey;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.timeoutMs ?? 5000
  );

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        agentId: request.agentId,
        resource: request.resource,
        action: request.action,
        context: request.context ?? {},
        token: request.token ?? config.token,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        approved: false,
        outcome: "deny",
        reason: `Gateway returned ${res.status}: ${await res.text()}`,
      };
    }

    const data = (await res.json()) as Record<string, unknown>;

    const outcome = (data.outcome as string) ?? "deny";
    return {
      approved: outcome === "approve",
      outcome: outcome as "approve" | "deny" | "escalate",
      reason: data.reason as string | undefined,
      tier: data.tier as number | undefined,
      evidenceId: data.evidenceId as string | undefined,
      raw: data,
    };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return {
        approved: false,
        outcome: "deny",
        reason: `Gateway request timed out after ${config.timeoutMs ?? 5000}ms`,
      };
    }
    return {
      approved: false,
      outcome: "deny",
      reason: `Gateway request failed: ${(err as Error).message}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check gateway health.
 */
export async function checkHealth(
  gatewayUrl: string
): Promise<{ ok: boolean; version?: string }> {
  try {
    const res = await fetch(`${gatewayUrl}/v1/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as Record<string, unknown>;
    return { ok: true, version: data.version as string | undefined };
  } catch {
    return { ok: false };
  }
}

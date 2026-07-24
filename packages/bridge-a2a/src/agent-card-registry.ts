/**
 * SINT Bridge A2A — Agent Card Registry.
 *
 * Maintains a registry of known A2A agents (their Agent Cards).
 * Used by the A2AInterceptor to resolve agent capabilities and
 * build SINT resource URIs.
 *
 * In production, Agent Cards are fetched from
 *   GET <agentUrl>/.well-known/agent.json
 * and cached here.  This module provides the in-memory cache
 * plus a fetch helper for production use.
 *
 * @module @sint/bridge-a2a/agent-card-registry
 */

import type { A2AAgentCard, A2AExternalEvidenceReference } from "./types.js";

/**
 * In-memory registry of A2A Agent Cards.
 *
 * @example
 * ```ts
 * const registry = new AgentCardRegistry();
 * registry.register(fleetManagerCard);
 *
 * const card = registry.get("https://agents.example.com/fleet-manager");
 * ```
 */
export class AgentCardRegistry {
  private readonly cards = new Map<string, A2AAgentCard>();

  /**
   * Register an Agent Card (or update an existing one).
   * The card is keyed by its `url` field.
   */
  register(card: A2AAgentCard): void {
    this.cards.set(card.url, card);
  }

  /**
   * Retrieve an Agent Card by the agent's URL.
   * Returns `undefined` if not registered.
   */
  get(agentUrl: string): A2AAgentCard | undefined {
    return this.cards.get(agentUrl);
  }

  /**
   * Check whether an agent is registered.
   */
  has(agentUrl: string): boolean {
    return this.cards.has(agentUrl);
  }

  /**
   * Remove an agent card.
   */
  remove(agentUrl: string): boolean {
    return this.cards.delete(agentUrl);
  }

  /**
   * List all registered agent URLs.
   */
  list(): readonly string[] {
    return Array.from(this.cards.keys());
  }

  /** Number of registered agents. */
  get size(): number {
    return this.cards.size;
  }
}

/**
 * Fetch an Agent Card from a remote agent's well-known endpoint.
 *
 * @param agentUrl - Base URL of the target agent
 * @param timeoutMs - Fetch timeout in milliseconds (default 5000)
 * @throws {Error} if fetch fails or card is malformed
 */
export async function fetchAgentCard(
  agentUrl: string,
  timeoutMs = 5_000,
): Promise<A2AAgentCard> {
  const wellKnownUrl = agentUrl.replace(/\/$/, "") + "/.well-known/agent.json";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(wellKnownUrl, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch Agent Card from ${wellKnownUrl}: HTTP ${res.status}`);
    }

    const card = await res.json() as A2AAgentCard;
    if (!card.url || !card.name || !Array.isArray(card.skills)) {
      throw new Error(`Malformed Agent Card from ${wellKnownUrl}: missing required fields`);
    }

    return card;
  } finally {
    clearTimeout(timer);
  }
}

/** Filter Agent Card evidence references without treating them as card identity. */
export function getExternalEvidenceReferences(
  card: A2AAgentCard,
  options?: {
    readonly type?: A2AExternalEvidenceReference["type"];
    readonly subject?: string;
    readonly now?: Date;
    readonly includeExpired?: boolean;
  },
): readonly A2AExternalEvidenceReference[] {
  const now = options?.now ?? new Date();
  return (card.externalEvidence ?? []).filter((evidence) => {
    if (options?.type && evidence.type !== options.type) return false;
    if (options?.subject && evidence.subject !== options.subject) return false;
    if (!options?.includeExpired && !isExternalEvidenceFresh(evidence, now)) return false;
    return true;
  });
}

/** Freshness check for evidence that rides alongside an Agent Card. */
export function isExternalEvidenceFresh(
  evidence: A2AExternalEvidenceReference,
  now = new Date(),
): boolean {
  if (!evidence.freshUntil) return true;
  const deadline = Date.parse(evidence.freshUntil);
  return Number.isFinite(deadline) && deadline >= now.getTime();
}

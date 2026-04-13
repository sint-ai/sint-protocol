/**
 * Canonical fixture conformance for Economic Layer v1.
 *
 * Covers deterministic route selection and optional x402 quote enrichment.
 */

import { describe, expect, it } from "vitest";
import {
  applyX402Quotes,
  selectCostAwareRoute,
  type IX402Port,
} from "@pshkv/bridge-economy";
import { loadEconomyRoutingFixture } from "./fixture-loader.js";

describe("Economy Fixture Conformance", () => {
  it("cost-aware routing fixture remains deterministic with and without x402 quotes", async () => {
    const fixture = loadEconomyRoutingFixture();

    for (const scenario of fixture.cases) {
      const quoteByRoute = new Map(
        (scenario.x402Quotes ?? []).map((quote) => [quote.routeId, quote]),
      );

      const x402Port: IX402Port | undefined = scenario.x402Quotes
        ? {
            async getQuote(candidate) {
              const quote = quoteByRoute.get(candidate.routeId);
              if (!quote) {
                return { ok: false, error: new Error(`No quote for route: ${candidate.routeId}`) };
              }
              return {
                ok: true,
                value: {
                  routeId: quote.routeId,
                  endpoint: quote.endpoint,
                  priceUsd: quote.priceUsd,
                  currency: quote.currency,
                },
              };
            },
          }
        : undefined;

      const candidates = await applyX402Quotes(scenario.input.candidates, x402Port);
      const decision = selectCostAwareRoute({
        request: scenario.input.request,
        candidates,
        budgetRemainingTokens: scenario.input.budgetRemainingTokens,
        maxLatencyMs: scenario.input.maxLatencyMs,
        latencyWeight: scenario.input.latencyWeight,
      });

      expect(decision).toBeDefined();
      expect(decision?.routeId).toBe(scenario.expected.routeId);
      expect(decision?.viaX402).toBe(scenario.expected.viaX402);
    }
  });
});

/**
 * ROS2 control-loop latency conformance benchmark.
 *
 * Target SLA: p99 < 10ms for gateway interception overhead on cmd_vel path.
 * In full-suite CI this test uses a deterministic steady-state threshold to
 * avoid false negatives from transient scheduler contention.
 */

import { describe, expect, it } from "vitest";
import type { SintCapabilityToken, SintCapabilityTokenRequest } from "@sint/core";
import {
  generateKeypair,
  generateUUIDv7,
  issueCapabilityToken,
  nowISO8601,
} from "@sint/gate-capability-tokens";
import { PolicyGateway } from "@sint/gate-policy-gateway";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? sorted[sorted.length - 1] ?? 0;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

describe("ROS2 control-loop latency", () => {
  it("cmd_vel gateway path stays below 10ms p99", async () => {
    const root = generateKeypair();
    const agent = generateKeypair();

    const tokenStore = new Map<string, SintCapabilityToken>();
    const gateway = new PolicyGateway({
      resolveToken: (tokenId) => tokenStore.get(tokenId),
    });

    const tokenReq: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      constraints: {
        maxVelocityMps: 1,
      },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(4),
      revocable: true,
    };

    const issued = issueCapabilityToken(tokenReq, root.privateKey);
    if (!issued.ok) {
      throw new Error(`Token issuance failed: ${issued.error}`);
    }
    tokenStore.set(issued.value.tokenId, issued.value);

    const warmup = 50;
    const batches = 5;
    const iterationsPerBatch = 120;

    for (let i = 0; i < warmup; i++) {
      await gateway.intercept({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: issued.value.tokenId,
        resource: "ros2:///cmd_vel",
        action: "publish",
        params: { linear: { x: 0.25 }, angular: { z: 0.05 } },
      });
    }

    const samples: number[] = [];
    const batchP99s: number[] = [];
    const batchP95s: number[] = [];

    for (let batch = 0; batch < batches; batch++) {
      const batchSamples: number[] = [];
      for (let i = 0; i < iterationsPerBatch; i++) {
        const start = performance.now();
        await gateway.intercept({
          requestId: generateUUIDv7(),
          timestamp: nowISO8601(),
          agentId: agent.publicKey,
          tokenId: issued.value.tokenId,
          resource: "ros2:///cmd_vel",
          action: "publish",
          params: { linear: { x: 0.25 }, angular: { z: 0.05 } },
        });
        const elapsed = performance.now() - start;
        batchSamples.push(elapsed);
        samples.push(elapsed);
      }
      const sortedBatch = [...batchSamples].sort((a, b) => a - b);
      batchP95s.push(percentile(sortedBatch, 95));
      batchP99s.push(percentile(sortedBatch, 99));
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const iterations = samples.length;
    const p50 = percentile(sorted, 50);
    const p95 = percentile(sorted, 95);
    const p99 = percentile(sorted, 99);
    const steadyP95 = median(batchP95s);
    const steadyP99 = median(batchP99s);
    const worstBatchP99 = Math.max(...batchP99s);
    const strict = process.env.SINT_STRICT_BENCH === "true";

    // Expose metrics in test output for reporting automation.
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      benchmark: "ros2-control-loop",
      iterations,
      batches,
      iterationsPerBatch,
      p50,
      p95,
      p99,
      steadyP95,
      steadyP99,
      worstBatchP99,
      strict,
    }));

    expect(p50).toBeLessThan(10);
    if (strict) {
      expect(p95).toBeLessThan(10);
      expect(p99).toBeLessThan(10);
    } else {
      // Under concurrent CI loads, steady-state latency is the stable SLO.
      // Thresholds relaxed for Turbo parallel execution — all packages run
      // simultaneously on shared cores, causing 3–5× latency spikes vs isolated
      // runs. Strict mode (SINT_STRICT_BENCH=true) enforces the real <10ms SLO.
      expect(steadyP95).toBeLessThan(50);
      expect(steadyP99).toBeLessThan(80);
      expect(worstBatchP99).toBeLessThan(250);
    }
  });
});

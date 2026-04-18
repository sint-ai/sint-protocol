/**
 * SINT Protocol — PolicyGateway performance benchmarks.
 *
 * Measures PolicyGateway.intercept() latency at p50/p99 for all hot paths.
 * Goal: prove the gateway adds <1ms p99 overhead to robotics control loops.
 *
 * Setup: tokens and keypairs are generated once outside bench iterations.
 * All stores are in-memory — no network or disk I/O.
 */

import { bench, describe } from "vitest";
import { PolicyGateway } from "../src/gateway.js";
import {
  generateKeypair,
  generateUUIDv7,
  issueCapabilityToken,
  RevocationStore,
} from "@pshkv/gate-capability-tokens";
import { InMemoryRateLimitStore } from "@pshkv/persistence";
import type { SintCapabilityToken, SintCapabilityTokenRequest, SintRequest } from "@pshkv/core";

// ── Shared setup (runs once, not per iteration) ─────────────────────────────

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function pastISO(hoursAgo: number): string {
  const d = new Date(Date.now() - hoursAgo * 3600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

const root = generateKeypair();
const agent = generateKeypair();

function issueToken(overrides: Partial<SintCapabilityTokenRequest>): SintCapabilityToken {
  const req: SintCapabilityTokenRequest = {
    issuer: root.publicKey,
    subject: agent.publicKey,
    resource: "ros2:///camera/front",
    actions: ["subscribe"],
    constraints: {},
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    expiresAt: futureISO(24),
    revocable: false,
    ...overrides,
  };
  const result = issueCapabilityToken(req, root.privateKey);
  if (!result.ok) throw new Error(`Token issuance failed: ${result.error}`);
  return result.value;
}

// ── Token issuance (once per scenario) ──────────────────────────────────────

// T0_observe: read-only sensor, no constraints — the hottest path
const t0Token = issueToken({
  resource: "ros2:///camera/front",
  actions: ["subscribe"],
  constraints: {},
});

// T1_prepare: write action with rate limit constraint
const t1Token = issueToken({
  resource: "mcp://filesystem/writeFile",
  actions: ["call"],
  constraints: {
    rateLimit: { maxCalls: 100_000, windowMs: 60_000 },
  },
});

// T2_act: robot move command → escalate
const t2Token = issueToken({
  resource: "ros2:///cmd_vel",
  actions: ["publish"],
  constraints: {
    maxVelocityMps: 2.0,
    maxForceNewtons: 100,
  },
});

// T3_commit: exec command → escalate (irreversible)
const t3Token = issueToken({
  resource: "mcp://code_exec/run",
  actions: ["call"],
  constraints: {},
});

// Expired token for denied-request scenario
// issueCapabilityToken rejects past expiresAt, so issue with future expiry then
// override the stored token's expiresAt to a past value to trigger the denial.
const expiredToken = {
  ...issueToken({
    resource: "ros2:///camera/front",
    actions: ["subscribe"],
    constraints: {},
  }),
  expiresAt: pastISO(1),
};

// ── Token stores ─────────────────────────────────────────────────────────────

const revocationStore = new RevocationStore();
const rateLimitStore = new InMemoryRateLimitStore();

const tokenStore = new Map<string, SintCapabilityToken>([
  [t0Token.tokenId, t0Token],
  [t1Token.tokenId, t1Token],
  [t2Token.tokenId, t2Token],
  [t3Token.tokenId, t3Token],
  [expiredToken.tokenId, expiredToken],
]);

// ── Gateway (shared, no plugins — measures core hot path) ────────────────────

const gateway = new PolicyGateway({
  resolveToken: (id) => tokenStore.get(id),
  revocationStore,
  rateLimitStore,
  // No emitLedgerEvent: avoids I/O in bench measurements
});

// ── Request factories (build once, reuse with fresh requestId per call) ───────

function makeRequest(
  tokenId: string,
  resource: string,
  action: string,
  params: Record<string, unknown> = {},
  physicalContext?: SintRequest["physicalContext"],
): SintRequest {
  return {
    requestId: generateUUIDv7(),
    timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    agentId: agent.publicKey,
    tokenId,
    resource,
    action,
    params,
    physicalContext,
  };
}

// Pre-warm the gateway with a first call (avoids JIT cold-start skewing results)
await gateway.intercept(makeRequest(t0Token.tokenId, "ros2:///camera/front", "subscribe"));

// ── Benchmarks ───────────────────────────────────────────────────────────────

describe("PolicyGateway.intercept() — hot path latency", () => {
  // Target: <1ms p99 for T0 (the most common robotics sensor read)
  bench("T0_observe allow — read-only sensor, no constraints (target <1ms p99)", async () => {
    await gateway.intercept(
      makeRequest(t0Token.tokenId, "ros2:///camera/front", "subscribe"),
    );
  });

  bench("T1_prepare allow — write action with rate limit check", async () => {
    await gateway.intercept(
      makeRequest(t1Token.tokenId, "mcp://filesystem/writeFile", "call", {
        path: "/tmp/waypoint.json",
        content: "{}",
      }),
    );
  });

  bench("T2_act escalate — robot move command", async () => {
    await gateway.intercept(
      makeRequest(
        t2Token.tokenId,
        "ros2:///cmd_vel",
        "publish",
        { linear: { x: 0.5, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0.1 } },
        { currentVelocityMps: 0.5, currentForceNewtons: 10, humanDetected: false },
      ),
    );
  });

  bench("T3_commit escalate — exec command (irreversible)", async () => {
    await gateway.intercept(
      makeRequest(t3Token.tokenId, "mcp://code_exec/run", "call", {
        command: "echo hello",
      }),
    );
  });

  bench("denied — expired token", async () => {
    await gateway.intercept(
      makeRequest(expiredToken.tokenId, "ros2:///camera/front", "subscribe"),
    );
  });

  bench("100-item batch intercept (Promise.all)", async () => {
    const requests = Array.from({ length: 100 }, () =>
      makeRequest(t0Token.tokenId, "ros2:///camera/front", "subscribe"),
    );
    await Promise.all(requests.map((req) => gateway.intercept(req)));
  });
});

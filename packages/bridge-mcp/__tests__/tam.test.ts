/**
 * Tool Auth Manifest (TAM) validation tests.
 * Reference implementation for MCP SEP-2385.
 */

import { describe, it, expect } from "vitest";
import {
  TamRegistry,
  validateAgainstTam,
  DEFAULT_MANIFESTS,
} from "../src/tam.js";
import type { ToolAuthManifest } from "../src/tam.js";
import { ApprovalTier } from "@sint/core";
import {
  generateKeypair,
  issueCapabilityToken,
} from "@sint/gate-capability-tokens";

function futureISO(h = 1): string {
  return new Date(Date.now() + h * 3_600_000).toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

const root = generateKeypair();
const agent = generateKeypair();

function makeToken(overrides: {
  resource?: string;
  actions?: string[];
  maxVelocityMps?: number;
  maxForceNewtons?: number;
}) {
  const result = issueCapabilityToken({
    issuer: root.publicKey,
    subject: agent.publicKey,
    resource: overrides.resource ?? "mcp://filesystem/*",
    actions: overrides.actions ?? ["call"],
    constraints: {
      maxVelocityMps: overrides.maxVelocityMps,
      maxForceNewtons: overrides.maxForceNewtons,
    },
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    expiresAt: futureISO(),
    revocable: false,
  }, root.privateKey);
  if (!result.ok) throw new Error("Token issuance failed");
  return result.value;
}

const WRITE_MANIFEST: ToolAuthManifest = {
  toolName: "writeFile",
  serverName: "filesystem",
  minApprovalTier: ApprovalTier.T1_PREPARE,
  requiresCapabilityToken: true,
  resourcePattern: "mcp://filesystem/*",
  requiredActions: ["call"],
};

const ROBOT_MANIFEST: ToolAuthManifest = {
  toolName: "setVelocity",
  serverName: "ros2",
  minApprovalTier: ApprovalTier.T2_ACT,
  requiresCapabilityToken: true,
  resourcePattern: "ros2:///cmd_vel",
  requiredActions: ["publish"],
  maxPhysicalConstraints: {
    maxVelocityMps: 0.5,
    maxForceNewtons: 50,
  },
};

describe("validateAgainstTam", () => {
  it("valid token passes all checks", () => {
    const token = makeToken({});
    const result = validateAgainstTam(token, WRITE_MANIFEST, ApprovalTier.T1_PREPARE);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("fails when assigned tier is below TAM minimum", () => {
    const token = makeToken({});
    const result = validateAgainstTam(token, WRITE_MANIFEST, ApprovalTier.T0_OBSERVE);
    expect(result.valid).toBe(false);
    expect(result.violations[0]).toContain(ApprovalTier.T1_PREPARE);
  });

  it("passes when assigned tier exceeds TAM minimum", () => {
    const token = makeToken({});
    const result = validateAgainstTam(token, WRITE_MANIFEST, ApprovalTier.T3_COMMIT);
    // T3 > T1 — still valid (higher tier = more scrutiny, not less)
    expect(result.valid).toBe(true);
  });

  it("fails when token resource does not match pattern", () => {
    const token = makeToken({ resource: "mcp://github/*" });
    const result = validateAgainstTam(token, WRITE_MANIFEST, ApprovalTier.T1_PREPARE);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("pattern"))).toBe(true);
  });

  it("fails when token is missing required action", () => {
    const token = makeToken({ actions: ["subscribe"] }); // has subscribe, not call
    const result = validateAgainstTam(token, WRITE_MANIFEST, ApprovalTier.T1_PREPARE);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("action"))).toBe(true);
  });

  it("enforces maxVelocityMps — token must be at least as restrictive", () => {
    const token = makeToken({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      maxVelocityMps: 1.5, // too fast — TAM requires ≤ 0.5
    });
    const result = validateAgainstTam(token, ROBOT_MANIFEST, ApprovalTier.T2_ACT);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("maxVelocityMps"))).toBe(true);
  });

  it("passes when token velocity is exactly at limit", () => {
    const token = makeToken({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      maxVelocityMps: 0.5,
      maxForceNewtons: 50,
    });
    const result = validateAgainstTam(token, ROBOT_MANIFEST, ApprovalTier.T2_ACT);
    expect(result.valid).toBe(true);
  });

  it("passes when token velocity is tighter than limit", () => {
    const token = makeToken({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      maxVelocityMps: 0.3, // stricter than 0.5 required
      maxForceNewtons: 40, // stricter than 50 required
    });
    const result = validateAgainstTam(token, ROBOT_MANIFEST, ApprovalTier.T2_ACT);
    expect(result.valid).toBe(true);
  });

  it("fails when token has no velocity limit but TAM requires one", () => {
    const token = makeToken({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      // no maxVelocityMps
    });
    const result = validateAgainstTam(token, ROBOT_MANIFEST, ApprovalTier.T2_ACT);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("unlimited"))).toBe(true);
  });

  it("manifest is included in result", () => {
    const token = makeToken({});
    const result = validateAgainstTam(token, WRITE_MANIFEST, ApprovalTier.T1_PREPARE);
    expect(result.manifest).toBe(WRITE_MANIFEST);
  });
});

describe("TamRegistry", () => {
  it("register and lookup by serverName+toolName", () => {
    const reg = new TamRegistry();
    reg.register(WRITE_MANIFEST);
    expect(reg.lookup("filesystem", "writeFile")).toEqual(WRITE_MANIFEST);
  });

  it("returns undefined for unregistered tool", () => {
    const reg = new TamRegistry();
    expect(reg.lookup("filesystem", "deleteFile")).toBeUndefined();
  });

  it("has() reflects registration state", () => {
    const reg = new TamRegistry();
    expect(reg.has("filesystem", "writeFile")).toBe(false);
    reg.register(WRITE_MANIFEST);
    expect(reg.has("filesystem", "writeFile")).toBe(true);
  });

  it("remove() deregisters a manifest", () => {
    const reg = new TamRegistry();
    reg.register(WRITE_MANIFEST);
    reg.remove("filesystem", "writeFile");
    expect(reg.has("filesystem", "writeFile")).toBe(false);
  });

  it("registerMany loads multiple manifests", () => {
    const reg = new TamRegistry();
    reg.registerMany([WRITE_MANIFEST, ROBOT_MANIFEST]);
    expect(reg.size).toBe(2);
  });

  it("list() returns all registered manifests", () => {
    const reg = new TamRegistry();
    reg.registerMany([WRITE_MANIFEST, ROBOT_MANIFEST]);
    const listed = reg.list();
    expect(listed).toHaveLength(2);
    expect(listed.some((m) => m.toolName === "writeFile")).toBe(true);
    expect(listed.some((m) => m.toolName === "setVelocity")).toBe(true);
  });
});

describe("DEFAULT_MANIFESTS", () => {
  it("covers expected high-risk tools", () => {
    const tools = DEFAULT_MANIFESTS.map((m) => `${m.serverName}:${m.toolName}`);
    expect(tools).toContain("filesystem:write_file");
    expect(tools).toContain("github:push_files");
    expect(tools).toContain("shell:run_command");
  });

  it("push_files requires T2_act (prompt injection risk)", () => {
    const manifest = DEFAULT_MANIFESTS.find(
      (m) => m.serverName === "github" && m.toolName === "push_files"
    );
    expect(manifest?.minApprovalTier).toBe(ApprovalTier.T2_ACT);
  });

  it("shell commands require T3_commit", () => {
    const shellManifests = DEFAULT_MANIFESTS.filter((m) => m.serverName === "shell");
    for (const m of shellManifests) {
      expect(m.minApprovalTier).toBe(ApprovalTier.T3_COMMIT);
    }
  });

  it("read_file is T0_observe (lowest tier)", () => {
    const manifest = DEFAULT_MANIFESTS.find(
      (m) => m.serverName === "filesystem" && m.toolName === "read_file"
    );
    expect(manifest?.minApprovalTier).toBe(ApprovalTier.T0_OBSERVE);
  });
});

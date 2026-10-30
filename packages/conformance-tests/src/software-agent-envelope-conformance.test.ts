import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ApprovalTier,
  KINETIC_CAPACITY_EXCEEDED,
  kineticEnvelopeResultSchema,
  kineticReceiptSchema,
  sintRequestSchema,
  type KineticEnvelopeResult,
  type SintRequest,
  type SupervisionLevel,
} from "@pshkv/core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE_PATH = resolve(
  ROOT,
  "spec/kinetic-envelope/conformance/software-agent-reference-v0.1.json",
);

// Mirrors spec/kinetic-envelope/README.md "Software/MCP reference profile v0.1".
// Illustrative and non-normative, like the ROS2 profile.
const PROFILE = {
  ceilings: {
    privilege: 0.5,
    reachability: 0.8,
    irreversibility: 0.7,
    credentialReach: 0.4,
    configurationReach: 0.5,
  },
  toolVerbs: [
    { match: /(^|_)(exec|execute|shell|bash|run_command|command|eval|subprocess|powershell|cmd|sh|system)(_|$)/, irreversibility: 1.0 },
    { match: /(^|_)(delete|remove|unlink|purge|drop|truncate|destroy|wipe)(_|$)/, irreversibility: 1.0 },
    { match: /(^|_)(rename|move)(_|$)/, irreversibility: 0.55 },
    { match: /(^|_)(write|create|insert|update|put|set|append|patch|upload|send|post|publish|register|transfer|trade)(_|$)/, irreversibility: 0.4 },
    { match: /(^|_)(read|get|list|query|search|fetch|describe|info|stat|stats|check|discover|balance|history)(_|$)/, irreversibility: 0.0 },
  ],
  unknownToolIrreversibility: 0.5,
  argumentTargets: ["path", "file", "filePath", "filename", "source", "destination", "target", "uri", "url", "directory", "dir"],
  targetPatterns: [
    { match: /(^|\/)\.(aws|ssh|gnupg)\//i, credentialReach: 1.0 },
    { match: /(secret|credential|token|apikey|api_key|keychain)/i, credentialReach: 1.0 },
    { match: /(^|\/)(etc|LaunchAgents|LaunchDaemons|systemd)\//i, configurationReach: 0.8 },
    { match: /(^|\/)\.(claude|cursor|config)\//i, configurationReach: 0.9 },
    { match: /(^|\/)(CLAUDE|AGENTS)\.md$/i, configurationReach: 0.9 },
  ],
  reachabilityByScheme: { file: 0.1, ipc: 0.2, mcp: 0.4, ros2: 0.5, http: 0.8, https: 0.8 } as Record<string, number>,
  urlReadReachabilityFactor: 0.75, // a read over a URL extends only its request
  mcpDefaultReachability: 0.4, // unknown server, no URL argument (the mcp scheme value)
  loopbackHost: /^(127\.|localhost(:|$)|\[?::1\]?(:|$))/,
  loopbackReachability: 0.2,
  serverReachability: {
    filesystem: 0.1, database: 0.2, memory: 0.1,
    github: 0.6, slack: 0.6, email: 0.6, browser: 0.6, fetch: 0.6,
  } as Record<string, number>,
  capacity: {
    eBase: 1.0,
    humanAuthorityMissing: 0.75,
    humanAuthorityStaleOrRevoked: 0.5,
    productionSite: 0.6,
    novelExecutor: 0.6,
  },
  humanAuthority: { maxProofAgeMs: 900_000, accepted: ["delegation", "contextual_binding"] },
  mAllow: 0.5,
  metacognitiveFloor: 0.33,
  assistedFloor: 0.15,
} as const;

type DecisionAction = "allow" | "deny" | "escalate";
type MarginBand = "safe" | "approaching" | "over";

interface SoftwareVector {
  readonly id: string;
  readonly note: string;
  readonly request: SintRequest;
  /** Provider-resolved from the token named by request.tokenId. Not part of the request. */
  readonly tokenFacts: { readonly heldPrivilege: number };
  readonly expect: {
    readonly referenceMargin: number;
    readonly marginBand: MarginBand;
    readonly supervision: SupervisionLevel;
    readonly decision: DecisionAction;
    readonly policyCode?: typeof KINETIC_CAPACITY_EXCEEDED;
    readonly capacityKnown: boolean;
    readonly tightenedAtMost: Record<string, never>;
  };
}

interface SoftwareFixture {
  readonly profile: "software-agent-reference-v0.1";
  readonly note: string;
  readonly vectors: readonly SoftwareVector[];
}

// All vectors are evaluated at the fixture's fixed clock so proof freshness reproduces.
const NOW = Date.parse("2026-09-29T12:00:00.000Z");

function loadFixture(): SoftwareFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as SoftwareFixture;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function supervisionForMargin(margin: number, capacityKnown: boolean): SupervisionLevel {
  let supervision: SupervisionLevel;
  if (margin <= 0) supervision = "silent_veto";
  else if (margin >= PROFILE.mAllow) supervision = "stable";
  else if (margin >= PROFILE.metacognitiveFloor) supervision = "metacognitive";
  else if (margin >= PROFILE.assistedFloor) supervision = "assisted";
  else supervision = "regulated";

  if (!capacityKnown && (supervision === "stable" || supervision === "metacognitive")) {
    return "assisted";
  }
  return supervision;
}

function decisionForSupervision(supervision: SupervisionLevel): DecisionAction {
  if (supervision === "stable") return "allow";
  if (supervision === "silent_veto") return "deny";
  return "escalate";
}

function marginBandFor(margin: number): MarginBand {
  if (margin <= 0) return "over";
  if (margin >= PROFILE.mAllow) return "safe";
  return "approaching";
}

/** Tool name → whole-token form: camelCase split, "-" "." whitespace → "_", lowercased. */
function normalizeToolName(tool: string): string {
  return tool.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[-.\s]+/g, "_").toLowerCase();
}

function schemeReachability(uri: string): number {
  const scheme = (uri.match(/^([a-z0-9+.-]+):/i)?.[1] ?? "").toLowerCase();
  const host = uri.match(/^[a-z0-9+.-]+:\/\/([^/]*)/i)?.[1] ?? "";
  if (host && PROFILE.loopbackHost.test(host)) return PROFILE.loopbackReachability;
  return PROFILE.reachabilityByScheme[scheme] ?? PROFILE.ceilings.reachability;
}

/**
 * Reference provider. Derives every magnitude from the request: the tool
 * name in `resource`, allowlisted target arguments in `params`, and
 * `executionContext`. No other `params` key is read.
 */
function computeReferenceEnvelope(vector: SoftwareVector): KineticEnvelopeResult {
  const req = vector.request;
  const rationale: string[] = [vector.note];
  const [, server = "", tool = ""] = req.resource.match(/^mcp:\/\/([^/]+)\/(.+)$/i) ?? [];

  // Targets: allowlisted keys, string values only. Present-but-unassessable → maximum stress.
  const targets: string[] = [];
  let unassessable = false;
  for (const key of PROFILE.argumentTargets) {
    if (!(key in req.params)) continue;
    const value = req.params[key];
    if (typeof value === "string" && value.length > 0) targets.push(value);
    else unassessable = true;
  }

  const normalizedTool = normalizeToolName(tool);
  const verb = PROFILE.toolVerbs.find((v) => v.match.test(normalizedTool));
  const irreversibility = verb?.irreversibility ?? PROFILE.unknownToolIrreversibility;
  const isRead = verb?.irreversibility === 0;
  const url = targets.find((t) => /^[a-z][a-z0-9+.-]*:\/\//i.test(t));
  const reachability = url
    ? schemeReachability(url) * (isRead ? PROFILE.urlReadReachabilityFactor : 1)
    : PROFILE.serverReachability[server.toLowerCase()] ?? PROFILE.mcpDefaultReachability;

  let credentialReach = 0;
  let configurationReach = 0;
  for (const subject of [req.resource, ...targets]) {
    for (const p of PROFILE.targetPatterns) {
      if (!p.match.test(subject)) continue;
      if ("credentialReach" in p) credentialReach = Math.max(credentialReach, p.credentialReach);
      if ("configurationReach" in p) configurationReach = Math.max(configurationReach, p.configurationReach);
    }
  }
  if (unassessable) {
    credentialReach = Math.max(credentialReach, PROFILE.ceilings.credentialReach);
    configurationReach = Math.max(configurationReach, PROFILE.ceilings.configurationReach);
  }

  const autonomyDemand = Math.max(
    vector.tokenFacts.heldPrivilege / PROFILE.ceilings.privilege,
    reachability / PROFILE.ceilings.reachability,
    irreversibility / PROFILE.ceilings.irreversibility,
    credentialReach / PROFILE.ceilings.credentialReach,
    configurationReach / PROFILE.ceilings.configurationReach,
  );

  // Capacity from executionContext.
  const ec = req.executionContext;
  const ha = ec?.humanAuthority;
  let environmentalCapacity: number = PROFILE.capacity.eBase;
  let capacityKnown = true;
  if (!ha) {
    environmentalCapacity *= PROFILE.capacity.humanAuthorityMissing;
  } else if (ha.revokedAt) {
    environmentalCapacity *= PROFILE.capacity.humanAuthorityStaleOrRevoked;
  } else if (!ha.observedAt) {
    environmentalCapacity *= PROFILE.capacity.humanAuthorityStaleOrRevoked;
    capacityKnown = false;
  } else if (NOW - Date.parse(ha.observedAt) > PROFILE.humanAuthority.maxProofAgeMs) {
    environmentalCapacity *= PROFILE.capacity.humanAuthorityStaleOrRevoked;
  } else if (!(PROFILE.humanAuthority.accepted as readonly string[]).includes(ha.assuranceLevel)) {
    environmentalCapacity *= PROFILE.capacity.humanAuthorityMissing;
  }
  if (ec?.deploymentProfile === "production" || /prod/i.test(ec?.siteId ?? "")) {
    environmentalCapacity *= PROFILE.capacity.productionSite;
  }
  if (ec?.executor?.runtimeId === undefined) {
    capacityKnown = false;
  } else if (!req.recentActions?.length) {
    environmentalCapacity *= PROFILE.capacity.novelExecutor;
    capacityKnown = false;
  }

  const margin =
    environmentalCapacity > 0 ? 1 - autonomyDemand / environmentalCapacity : Number.NEGATIVE_INFINITY;

  return {
    autonomyDemand: round3(autonomyDemand),
    environmentalCapacity: round3(environmentalCapacity),
    margin: round3(margin),
    capacityKnown,
    // No TightenedConstraints field can express a software restriction.
    tightenedConstraints: {},
    supervision: supervisionForMargin(margin, capacityKnown),
    rationale,
  };
}

const TARGET_KEYS: readonly string[] = PROFILE.argumentTargets;
const withoutScoreClaims = (params: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(params).filter(([k]) => TARGET_KEYS.includes(k) || k === "content" || k === "command"));

describe("Kinetic envelope conformance vectors — software/MCP profile", () => {
  const fixture = loadFixture();

  it("loads the software reference fixture", () => {
    expect(fixture.profile).toBe("software-agent-reference-v0.1");
    expect(fixture.vectors.map((v) => v.id)).toEqual([
      "S1-read-scratch-safe",
      "S2-write-scratch-self-check",
      "S3-write-no-human-authority",
      "S4-write-production-site",
      "S5-write-ssh-authorized-keys",
      "S6-write-agent-configuration",
      "S7-shell-command",
      "S8-read-no-execution-context",
      "S9-argument-claims-ignored",
    ]);
  });

  it("covers every supervision level", () => {
    const levels = new Set(fixture.vectors.map((v) => v.expect.supervision));
    expect([...levels].sort()).toEqual(
      ["assisted", "metacognitive", "regulated", "silent_veto", "stable"],
    );
  });

  for (const vector of fixture.vectors) {
    it(`${vector.id}: request is a valid SintRequest`, () => {
      expect(() => sintRequestSchema.parse(vector.request)).not.toThrow();
    });

    it(`${vector.id}: produces the expected decision surface`, () => {
      const result = computeReferenceEnvelope(vector);
      const parsed = kineticEnvelopeResultSchema.parse(result);
      const decision = decisionForSupervision(parsed.supervision);
      const policyCode =
        parsed.supervision === "silent_veto" ? KINETIC_CAPACITY_EXCEEDED : undefined;

      expect(parsed.margin).toBeCloseTo(vector.expect.referenceMargin, 3);
      expect(marginBandFor(parsed.margin)).toBe(vector.expect.marginBand);
      expect(parsed.supervision).toBe(vector.expect.supervision);
      expect(decision).toBe(vector.expect.decision);
      expect(policyCode).toBe(vector.expect.policyCode);
      expect(parsed.capacityKnown).toBe(vector.expect.capacityKnown);
      expect(parsed.tightenedConstraints).toEqual({});

      const receipt = kineticReceiptSchema.parse({
        requestId: vector.request.requestId,
        autonomyDemand: parsed.autonomyDemand,
        environmentalCapacity: parsed.environmentalCapacity,
        margin: parsed.margin,
        capacityKnown: parsed.capacityKnown,
        supervision: parsed.supervision,
        finalTier: decision === "allow" ? ApprovalTier.T1_PREPARE : ApprovalTier.T2_ACT,
        deautomated: decision === "escalate",
        vetoed: decision === "deny",
        policyCode,
        rationale: parsed.rationale,
      });
      expect(receipt.vetoed).toBe(vector.expect.decision === "deny");
    });
  }

  it("S9: score-shaped arguments do not move the result", () => {
    const s9 = fixture.vectors.find((v) => v.id === "S9-argument-claims-ignored")!;
    const stripped: SoftwareVector = {
      ...s9,
      request: { ...s9.request, params: withoutScoreClaims(s9.request.params) },
    };
    const a = computeReferenceEnvelope(s9);
    const b = computeReferenceEnvelope(stripped);
    expect(a.margin).toBe(b.margin);
    expect(a.supervision).toBe(b.supervision);
    // The arguments themselves differ, so a decision binding to them would too.
    const digest = (p: unknown) => createHash("sha256").update(JSON.stringify(p)).digest("hex");
    expect(digest(s9.request.params)).not.toBe(digest(stripped.request.params));
  });
});

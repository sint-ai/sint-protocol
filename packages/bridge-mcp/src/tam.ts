/**
 * SINT Protocol — Tool Auth Manifest (TAM) validation.
 *
 * Implements the enforcement side of MCP SEP-2385 (Tool Authorization Manifest).
 * SEP-2385 proposes that MCP servers declare per-tool authorization requirements
 * as machine-readable metadata. SINT's capability tokens are the *proof* that
 * a calling agent satisfies those requirements.
 *
 * The TAM declares: "to call tool X, you need at least tier T2 and a token
 * covering resource Y."
 * The capability token proves: "I have been authorized for resource Y at tier T2."
 *
 * Ref: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2385
 *
 * @module @sint/bridge-mcp/tam
 */

import { ApprovalTier } from "@sint-ai/core";
import type {
  SintCapabilityToken,
  SintPhysicalConstraints,
} from "@sint-ai/core";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Machine-readable authorization manifest for a single MCP tool.
 * Implements the MCP SEP-2385 "Tool Authorization Manifest" proposal.
 *
 * This is declared by the MCP server to express what capabilities a
 * calling agent must hold to invoke this tool.
 */
export interface ToolAuthManifest {
  /** The MCP tool this manifest applies to (e.g. "writeFile"). */
  readonly toolName: string;

  /** MCP server name (e.g. "filesystem"). */
  readonly serverName: string;

  /**
   * Minimum SINT approval tier required to call this tool.
   * The calling agent's capability token must authorize this tier or higher.
   */
  readonly minApprovalTier: ApprovalTier;

  /**
   * Whether the caller must present a SINT capability token.
   * If false, the tool is open to any authenticated MCP client.
   */
  readonly requiresCapabilityToken: boolean;

  /**
   * Required resource URI pattern the capability token must cover.
   * Supports glob-style wildcards: "mcp://filesystem/*"
   * If omitted, only the tier requirement is enforced.
   */
  readonly resourcePattern?: string;

  /**
   * Required action verbs the token must include.
   * E.g. ["call"] for a standard tool invocation.
   */
  readonly requiredActions?: readonly string[];

  /**
   * Physical constraint requirements — the token's constraints must be
   * AT LEAST this restrictive (i.e., token values must be ≤ these limits).
   * Relevant when the tool has physical side effects.
   */
  readonly maxPhysicalConstraints?: Pick<
    SintPhysicalConstraints,
    "maxForceNewtons" | "maxVelocityMps"
  >;

  /**
   * Human-readable description of why this authorization is required.
   * Shown to operators in the approval dashboard.
   */
  readonly rationale?: string;
}

/**
 * Result of validating a tool call against a TAM entry.
 */
export interface TamValidationResult {
  /** True if all TAM requirements are satisfied by the presented token. */
  readonly valid: boolean;
  /** List of specific violations if not valid. */
  readonly violations: readonly string[];
  /** The TAM entry used for validation. */
  readonly manifest: ToolAuthManifest;
}

// ─── Tier ordering ────────────────────────────────────────────────────────────

const TIER_ORDER: Record<ApprovalTier, number> = {
  [ApprovalTier.T0_OBSERVE]: 0,
  [ApprovalTier.T1_PREPARE]: 1,
  [ApprovalTier.T2_ACT]: 2,
  [ApprovalTier.T3_COMMIT]: 3,
};

function tierSatisfies(tokenTier: ApprovalTier, required: ApprovalTier): boolean {
  return TIER_ORDER[tokenTier] >= TIER_ORDER[required];
}

// ─── Resource pattern matching ────────────────────────────────────────────────

function matchesPattern(resource: string, pattern: string): boolean {
  // Convert glob pattern to regex
  // "mcp://filesystem/*" → matches "mcp://filesystem/readFile"
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .replace(/\*\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(resource);
}

// ─── Core validation ──────────────────────────────────────────────────────────

/**
 * Validate a capability token against a Tool Auth Manifest entry.
 *
 * This is called at intercept time, after token authentication but before
 * forwarding the tool call. It enforces the TAM-declared requirements
 * against the token's actual capabilities.
 *
 * @param token - The capability token presented by the calling agent
 * @param manifest - The TAM entry for the tool being called
 * @param assignedTier - The tier PolicyGateway assigned to this request
 * @returns Validation result with specific violations if any
 *
 * @example
 * ```ts
 * const result = validateAgainstTam(token, manifest, "T2_act");
 * if (!result.valid) {
 *   return deny(result.violations.join("; "));
 * }
 * ```
 */
export function validateAgainstTam(
  token: SintCapabilityToken,
  manifest: ToolAuthManifest,
  assignedTier: ApprovalTier,
): TamValidationResult {
  const violations: string[] = [];

  // 1. Tier check: assigned tier must meet or exceed TAM minimum
  if (!tierSatisfies(assignedTier, manifest.minApprovalTier)) {
    violations.push(
      `Tool '${manifest.toolName}' requires tier ${manifest.minApprovalTier} ` +
      `but request was assigned ${assignedTier}`
    );
  }

  // 2. Resource pattern check
  if (manifest.resourcePattern) {
    if (!matchesPattern(token.resource, manifest.resourcePattern)) {
      violations.push(
        `Token resource '${token.resource}' does not match required pattern ` +
        `'${manifest.resourcePattern}'`
      );
    }
  }

  // 3. Required actions check
  if (manifest.requiredActions && manifest.requiredActions.length > 0) {
    const tokenActions = new Set(token.actions);
    for (const action of manifest.requiredActions) {
      if (!tokenActions.has(action)) {
        violations.push(
          `Token does not include required action '${action}' for tool '${manifest.toolName}'`
        );
      }
    }
  }

  // 4. Physical constraint enforcement — token must be AT LEAST as restrictive
  if (manifest.maxPhysicalConstraints) {
    const { maxForceNewtons, maxVelocityMps } = manifest.maxPhysicalConstraints;
    if (
      maxForceNewtons !== undefined &&
      (token.constraints.maxForceNewtons === undefined ||
        token.constraints.maxForceNewtons > maxForceNewtons)
    ) {
      violations.push(
        `Tool '${manifest.toolName}' requires maxForceNewtons ≤ ${maxForceNewtons}N ` +
        `but token has ${token.constraints.maxForceNewtons ?? "unlimited"}`
      );
    }
    if (
      maxVelocityMps !== undefined &&
      (token.constraints.maxVelocityMps === undefined ||
        token.constraints.maxVelocityMps > maxVelocityMps)
    ) {
      violations.push(
        `Tool '${manifest.toolName}' requires maxVelocityMps ≤ ${maxVelocityMps} m/s ` +
        `but token has ${token.constraints.maxVelocityMps ?? "unlimited"}`
      );
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    manifest,
  };
}

// ─── TAM Registry ─────────────────────────────────────────────────────────────

/**
 * Registry for Tool Auth Manifests.
 *
 * Stores TAM entries keyed by serverName + toolName and provides fast
 * lookup at intercept time.
 *
 * @example
 * ```ts
 * const registry = new TamRegistry();
 * registry.register({
 *   toolName: "writeFile",
 *   serverName: "filesystem",
 *   minApprovalTier: ApprovalTier.T1_PREPARE,
 *   requiresCapabilityToken: true,
 *   resourcePattern: "mcp://filesystem/*",
 *   requiredActions: ["call"],
 * });
 *
 * const manifest = registry.lookup("filesystem", "writeFile");
 * ```
 */
export class TamRegistry {
  private readonly entries = new Map<string, ToolAuthManifest>();

  private static key(serverName: string, toolName: string): string {
    return `${serverName}:${toolName}`;
  }

  register(manifest: ToolAuthManifest): void {
    this.entries.set(TamRegistry.key(manifest.serverName, manifest.toolName), manifest);
  }

  registerMany(manifests: readonly ToolAuthManifest[]): void {
    for (const m of manifests) this.register(m);
  }

  lookup(serverName: string, toolName: string): ToolAuthManifest | undefined {
    return this.entries.get(TamRegistry.key(serverName, toolName));
  }

  has(serverName: string, toolName: string): boolean {
    return this.entries.has(TamRegistry.key(serverName, toolName));
  }

  remove(serverName: string, toolName: string): void {
    this.entries.delete(TamRegistry.key(serverName, toolName));
  }

  get size(): number {
    return this.entries.size;
  }

  list(): readonly ToolAuthManifest[] {
    return [...this.entries.values()];
  }
}

// ─── Built-in manifests for common MCP servers ────────────────────────────────

/**
 * Default TAM entries for the official MCP server set.
 * Based on the security audit finding (modelcontextprotocol/servers#3537)
 * that all 7 official servers lack parameter constraints.
 *
 * These provide sensible security defaults when a server doesn't publish
 * its own TAM entries.
 */
export const DEFAULT_MANIFESTS: readonly ToolAuthManifest[] = [
  // Filesystem server
  {
    toolName: "read_file",
    serverName: "filesystem",
    minApprovalTier: ApprovalTier.T0_OBSERVE,
    requiresCapabilityToken: true,
    resourcePattern: "mcp://filesystem/*",
    requiredActions: ["call"],
    rationale: "Read-only file access — observe tier, logged.",
  },
  {
    toolName: "write_file",
    serverName: "filesystem",
    minApprovalTier: ApprovalTier.T1_PREPARE,
    requiresCapabilityToken: true,
    resourcePattern: "mcp://filesystem/*",
    requiredActions: ["call"],
    rationale: "File write — prepare tier, audited.",
  },
  {
    toolName: "create_directory",
    serverName: "filesystem",
    minApprovalTier: ApprovalTier.T1_PREPARE,
    requiresCapabilityToken: true,
    resourcePattern: "mcp://filesystem/*",
    requiredActions: ["call"],
    rationale: "Directory creation — prepare tier.",
  },
  // GitHub server — prompt injection → arbitrary repo write is the key risk
  {
    toolName: "push_files",
    serverName: "github",
    minApprovalTier: ApprovalTier.T2_ACT,
    requiresCapabilityToken: true,
    resourcePattern: "mcp://github/*",
    requiredActions: ["call"],
    rationale: "Repo write — act tier required; prompt injection risk (servers#3751).",
  },
  {
    toolName: "create_repository",
    serverName: "github",
    minApprovalTier: ApprovalTier.T2_ACT,
    requiresCapabilityToken: true,
    resourcePattern: "mcp://github/*",
    requiredActions: ["call"],
    rationale: "Repository creation — act tier.",
  },
  // Shell/exec tools — highest risk
  {
    toolName: "run_command",
    serverName: "shell",
    minApprovalTier: ApprovalTier.T3_COMMIT,
    requiresCapabilityToken: true,
    resourcePattern: "mcp://shell/*",
    requiredActions: ["call"],
    rationale: "Shell execution — commit tier, irreversible side effects.",
  },
  {
    toolName: "execute_script",
    serverName: "shell",
    minApprovalTier: ApprovalTier.T3_COMMIT,
    requiresCapabilityToken: true,
    resourcePattern: "mcp://shell/*",
    requiredActions: ["call"],
    rationale: "Script execution — commit tier.",
  },
];

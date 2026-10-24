/** Shared MCP semantics used by the gateway, bridges, and scanner. */
import { DEFAULT_TIER_RULES } from "./tiers.js";
import { selectTierRule } from "./tier-rule-matcher.js";
import { ApprovalTier } from "../types/policy.js";

export interface McpAnnotations {
  readonly readOnlyHint?: boolean;
  readonly destructiveHint?: boolean;
  readonly openWorldHint?: boolean;
  readonly idempotentHint?: boolean;
}
export interface McpRiskClassification {
  readonly suggestedTier: ApprovalTier;
  readonly action: string;
  readonly hasPhysicalEffect: boolean;
  readonly escalateOnHumanPresence: boolean;
}
export interface McpToolIdentity {
  readonly serverName: string;
  readonly toolName: string;
  readonly annotations?: McpAnnotations;
}
const ORDER = [ApprovalTier.T0_OBSERVE, ApprovalTier.T1_PREPARE, ApprovalTier.T2_ACT, ApprovalTier.T3_COMMIT];

/** Conflicting hints resolve to the highest consequence. Hints never lower policy. */
export function mcpTierFromAnnotations(a: McpAnnotations): ApprovalTier | undefined {
  if (a.destructiveHint === true) return ApprovalTier.T3_COMMIT;
  if (a.openWorldHint === true) return ApprovalTier.T1_PREPARE;
  if (a.readOnlyHint === true) return ApprovalTier.T0_OBSERVE;
  return undefined;
}

const TOOL_RISK_MAP: ReadonlyMap<string, McpRiskClassification> = new Map([
  // Read-only tools — T0
  ["filesystem.readFile", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["filesystem.readDirectory", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["filesystem.getFileInfo", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["database.query", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],

  // Write tools — T1
  ["filesystem.writeFile", {
    suggestedTier: ApprovalTier.T1_PREPARE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["filesystem.createDirectory", {
    suggestedTier: ApprovalTier.T1_PREPARE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["database.insert", {
    suggestedTier: ApprovalTier.T1_PREPARE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],

  // Destructive / mutation tools — T2
  ["filesystem.deleteFile", {
    suggestedTier: ApprovalTier.T2_ACT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["database.delete", {
    suggestedTier: ApprovalTier.T2_ACT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["database.update", {
    suggestedTier: ApprovalTier.T2_ACT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],

  // Execution / credential tools — T3
  ["exec.run", {
    suggestedTier: ApprovalTier.T3_COMMIT,
    action: "exec.run",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["exec.shell", {
    suggestedTier: ApprovalTier.T3_COMMIT,
    action: "exec.run",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["credential.read", {
    suggestedTier: ApprovalTier.T3_COMMIT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["credential.write", {
    suggestedTier: ApprovalTier.T3_COMMIT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],

  // ── Conway Terminal / Cloud Sandbox tools ──

  // Sandbox observation — T0 (read-only)
  ["conway.sandbox_list", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.sandbox_read_file", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.sandbox_get_url", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.sandbox_pty_list", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.sandbox_pty_read", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.credits_balance", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.credits_history", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_list", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_info", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_dns_list", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_search", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_check", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_pricing", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.credits_pricing", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.wallet_info", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.wallet_networks", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.x402_discover", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.x402_check", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],

  // Sandbox write / mutate — T1 (safe writes)
  ["conway.sandbox_write_file", {
    suggestedTier: ApprovalTier.T1_PREPARE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.sandbox_pty_write", {
    suggestedTier: ApprovalTier.T1_PREPARE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.sandbox_pty_create", {
    suggestedTier: ApprovalTier.T1_PREPARE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.sandbox_pty_close", {
    suggestedTier: ApprovalTier.T1_PREPARE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_dns_add", {
    suggestedTier: ApprovalTier.T1_PREPARE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_dns_update", {
    suggestedTier: ApprovalTier.T1_PREPARE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.chat_completions", {
    suggestedTier: ApprovalTier.T1_PREPARE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],

  // Sandbox infra changes — T2 (state-changing, reviewable)
  ["conway.sandbox_create", {
    suggestedTier: ApprovalTier.T2_ACT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.sandbox_expose_port", {
    suggestedTier: ApprovalTier.T2_ACT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_dns_delete", {
    suggestedTier: ApprovalTier.T2_ACT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_privacy", {
    suggestedTier: ApprovalTier.T2_ACT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_nameservers", {
    suggestedTier: ApprovalTier.T2_ACT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],

  // Irreversible / financial — T3 (human approval required)
  ["conway.sandbox_exec", {
    suggestedTier: ApprovalTier.T3_COMMIT,
    action: "exec.run",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.sandbox_delete", {
    suggestedTier: ApprovalTier.T3_COMMIT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_register", {
    suggestedTier: ApprovalTier.T3_COMMIT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_renew", {
    suggestedTier: ApprovalTier.T3_COMMIT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.x402_fetch", {
    suggestedTier: ApprovalTier.T3_COMMIT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
]);
const NORMALIZED_TOOL_RISK_MAP = new Map([...TOOL_RISK_MAP].map(([id, hint]) => [id.toLowerCase(), hint]));
const SHELL_WORDS = new Set(["execute", "exec", "shell", "bash", "sh", "cmd", "powershell", "system", "eval", "subprocess"]);
const SHELL_SERVERS = new Set(["shell", "terminal", "bash", "exec"]);

function words(name: string): string[] {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().split(/[^a-z0-9]+/);
}
export function isMcpShellExecTool(tool: McpToolIdentity): boolean {
  return words(tool.toolName).some(word => SHELL_WORDS.has(word))
    || /(?:^|_)run_command(?:_|$)/.test(words(tool.toolName).join("_"))
    || words(tool.serverName).some(word => SHELL_SERVERS.has(word))
    || tool.serverName.toLowerCase().includes("code-interpreter");
}

/** Annotation risk is additive; capability action comes only from tool identity. */
export function classifyMcpTool(tool: McpToolIdentity): McpRiskClassification {
  const known = NORMALIZED_TOOL_RISK_MAP.get(`${tool.serverName}.${tool.toolName}`.toLowerCase());
  const shell = isMcpShellExecTool(tool);
  const baseline = known ?? {
    suggestedTier: shell ? ApprovalTier.T3_COMMIT : ApprovalTier.T1_PREPARE,
    action: "call", hasPhysicalEffect: false, escalateOnHumanPresence: false,
  };
  const annotation = tool.annotations && mcpTierFromAnnotations(tool.annotations);
  return annotation && ORDER.indexOf(annotation) > ORDER.indexOf(baseline.suggestedTier)
    ? { ...baseline, suggestedTier: annotation } : baseline;
}

/** Parse the same MCP resource identity on direct and bridged gateway requests. */
export function parseMcpResource(resource: string): McpToolIdentity | undefined {
  const match = /^mcp:\/\/([^/]+)\/(.+)$/i.exec(resource);
  if (!match) return undefined;
  try {
    return { serverName: decodeURIComponent(match[1]!), toolName: decodeURIComponent(match[2]!) };
  } catch {
    return undefined;
  }
}

/** Canonical vocabulary for forbidden combinations, independent of wire action. */
export function normalizeComboAction(action: string, resource?: string): string {
  const tool = resource ? parseMcpResource(resource) : undefined;
  const id = tool ? `${tool.serverName}.${tool.toolName}` : action;
  const lower = id.toLowerCase();
  // These are existing non-MCP combo vocabularies, not MCP server.tool ids.
  if (!tool && /^(ros2|engine|capsule)\./.test(lower)) return id;
  if (/^filesystem\.(writefile|write)$/.test(lower) || lower === "conway.sandbox_write_file") return "filesystem.write";
  if (/^filesystem\.(chmod|chmodfile)$/.test(lower)) return "filesystem.chmod";
  if (lower === "credential.read") return "credential.read";
  if (lower === "network.connect") return "network.connect";
  const parts = id.split(".");
  const identity = { serverName: parts[0]!, toolName: parts.slice(1).join(".") };
  if (action === "exec.run" || (parts.length >= 2 && isMcpShellExecTool(identity))) return "exec.run";
  return id;
}

/** Static default-policy tier, without runtime trust, context, or sequence history. */
export function classifyMcpPolicy(tool: McpToolIdentity): McpRiskClassification {
  const hint = classifyMcpTool(tool);
  const rule = selectTierRule(`mcp://${tool.serverName}/${tool.toolName}`, hint.action, DEFAULT_TIER_RULES);
  const ruleTier = rule?.baseTier ?? ApprovalTier.T1_PREPARE;
  return ORDER.indexOf(ruleTier) > ORDER.indexOf(hint.suggestedTier)
    ? { ...hint, suggestedTier: ruleTier } : hint;
}

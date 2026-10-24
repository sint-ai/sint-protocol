/** Shared resource rule matching for policy enforcement and static MCP scans. */
import type { TierAssignmentRule } from "../types/policy.js";

/**
 * Simple glob matching for resource patterns.
 * Supports:
 * - Exact match: "ros2:///cmd_vel"
 * - Prefix wildcard: "ros2:///camera/*"
 * - Double wildcard: "mcp://*"
 */
function matchesPattern(pattern: string, resource: string): boolean {
  if (pattern === resource) return true;

  // Simple trailing wildcard — only when no earlier wildcards exist
  const firstStar = pattern.indexOf("*");
  if (firstStar >= 0 && firstStar === pattern.length - 1) {
    // Single trailing * — prefix match
    const prefix = pattern.slice(0, -1);
    return resource.startsWith(prefix);
  }

  if (pattern.endsWith("/*") && !pattern.slice(0, -2).includes("*")) {
    // Single trailing /* — prefix match
    const prefix = pattern.slice(0, -1);
    return resource.startsWith(prefix);
  }

  // General glob with wildcards — use regex
  if (pattern.includes("*")) {
    const regex = new RegExp(
      "^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
    );
    return regex.test(resource);
  }

  return false;
}

/**
 * Decode URI path fragments when resources are percent-encoded by bridges.
 *
 * Example:
 *   opcua://plc-1/ns%3D2%3Bs%3DLine1%2FSafety%2FInterlock
 * becomes:
 *   opcua://plc-1/ns=2;s=Line1/Safety/Interlock
 */
function decodeResource(resource: string): string {
  const schemeIdx = resource.indexOf("://");
  if (schemeIdx < 0) {
    return resource;
  }

  const prefix = resource.slice(0, schemeIdx + 3);
  const remainder = resource.slice(schemeIdx + 3);

  try {
    return `${prefix}${decodeURIComponent(remainder)}`;
  } catch {
    return resource;
  }
}

/** Match a resource against a rule using raw + decoded + case-insensitive forms. */
function matchesRuleResource(pattern: string, resource: string): boolean {
  if (matchesPattern(pattern, resource)) {
    return true;
  }

  const decoded = decodeResource(resource);
  if (decoded !== resource && matchesPattern(pattern, decoded)) {
    return true;
  }

  const loweredPattern = pattern.toLowerCase();
  const loweredResource = resource.toLowerCase();
  if (matchesPattern(loweredPattern, loweredResource)) {
    return true;
  }

  const loweredDecoded = decoded.toLowerCase();
  if (loweredDecoded !== loweredResource && matchesPattern(loweredPattern, loweredDecoded)) {
    return true;
  }

  return false;
}

/** Most specific matching resource/action rule; earlier equal matches win. */
export function selectTierRule(resource: string, action: string, rules: readonly TierAssignmentRule[]): TierAssignmentRule | undefined {
  let bestRule: TierAssignmentRule | undefined;
  let bestSpecificity = -1;
  for (const rule of rules) {
    if (matchesRuleResource(rule.resourcePattern, resource) && rule.actions.includes(action)) {
      const specificity = rule.resourcePattern.replace(/\*/g, "").length;
      if (specificity > bestSpecificity) {
        bestSpecificity = specificity;
        bestRule = rule;
      }
    }
  }
  return bestRule;
}

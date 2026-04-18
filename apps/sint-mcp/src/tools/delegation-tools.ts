/**
 * SINT MCP — Multi-Agent Delegation Tools.
 *
 * Provides sint__delegate_to_agent, sint__list_delegations, and
 * sint__revoke_delegation_tree for hierarchical multi-agent orchestration.
 *
 * All tokens are issued with depth = parent.depth + 1 (attenuation only).
 * Max depth: 3. Cascade revocation via RevocationStore.
 */

import { issueCapabilityToken, type RevocationStore } from "@pshkv/gate-capability-tokens";
import type { SintCapabilityToken } from "@pshkv/core";
import type { LedgerWriter } from "@pshkv/gate-evidence-ledger";
import { DelegationTree } from "@pshkv/interface-bridge";

export interface DelegationToolContext {
  readonly agentPublicKey: string;
  readonly agentPrivateKey: string;
  readonly tokenId: string;           // current operator's root token ID
  readonly tokenStore: Map<string, SintCapabilityToken>;
  readonly revocationStore: RevocationStore;
  readonly ledger: LedgerWriter;
  readonly delegationTree: DelegationTree;
}

const MAX_DELEGATION_DEPTH = 3;

export function getDelegationToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}> {
  return [
    {
      name: "sint__delegate_to_agent",
      description:
        "Issue a delegated capability token to a sub-agent with narrower scope than the current token. Use this when one agent should perform a bounded sub-task without inheriting full access. The delegated token is always attenuated (depth = parent.depth + 1; max depth 3). Returns a JSON object containing the new token ID, delegated scope, depth, and expiry.",
      inputSchema: {
        type: "object",
        properties: {
          subagentId: {
            title: "Sub-agent ID",
            type: "string",
            description: "Public key or stable identifier of the sub-agent receiving the delegated token",
            minLength: 1,
            examples: ["agent:reviewer-01", "ed25519:def456..."],
          },
          toolScope: {
            title: "Tool scope",
            type: "array",
            items: { type: "string" },
            description: "Resource URI patterns the sub-agent may access; must be a subset of the caller's scope",
            minItems: 1,
            examples: [["mcp://filesystem/reports/*"], ["mcp://github/repos/sint-ai/sint-protocol/issues/*"]],
          },
          expiresInHours: {
            title: "Expiry (hours)",
            type: "number",
            description: "Delegated token lifetime in hours; defaults to 4",
            minimum: 1,
            default: 4,
            examples: [1, 4, 24],
          },
          maxCallsPerMinute: {
            title: "Rate limit (calls/minute)",
            type: "number",
            description: "Optional per-minute rate limit applied to the delegated token",
            minimum: 1,
            examples: [10, 60],
          },
        },
        required: ["subagentId", "toolScope"],
        additionalProperties: false,
        examples: [{
          subagentId: "agent:reviewer-01",
          toolScope: ["mcp://filesystem/reports/*"],
          expiresInHours: 4,
          maxCallsPerMinute: 10,
        }],
      },
      annotations: { title: "Delegate To Agent", destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "sint__list_delegations",
      description:
        "List the active delegation tree rooted at the current token. Use this to audit which sub-agents currently hold delegated access, how deep the tree is, and what scope has been passed down. This tool is read-only and returns a JSON array of delegation nodes.",
      inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false, examples: [{}] },
      annotations: { title: "List Delegations", readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "sint__revoke_delegation_tree",
      description:
        "Cascade-revoke a delegated token and all of its descendants. Use this for incident response or cleanup when an entire delegated execution branch should stop immediately. Returns a JSON summary describing how many tokens were revoked and why.",
      inputSchema: {
        type: "object",
        properties: {
          rootTokenId: {
            title: "Root token ID",
            type: "string",
            description: "Root delegated token ID whose entire subtree should be revoked",
            minLength: 1,
            examples: ["tok_01hxyz..."],
          },
          reason: {
            title: "Reason",
            type: "string",
            description: "Reason recorded for the cascade revocation",
            examples: ["Sub-agent exceeded its brief", "Incident response containment"],
          },
        },
        required: ["rootTokenId"],
        additionalProperties: false,
        examples: [{ rootTokenId: "tok_01hxyz...", reason: "Incident response containment" }],
      },
      annotations: { title: "Revoke Delegation Tree", destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
  ];
}

export function isDelegationTool(name: string): boolean {
  return (
    name === "sint__delegate_to_agent" ||
    name === "sint__list_delegations" ||
    name === "sint__revoke_delegation_tree"
  );
}

export async function handleDelegationTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: DelegationToolContext,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  switch (toolName) {
    case "sint__delegate_to_agent":
      return handleDelegate(args, ctx);
    case "sint__list_delegations":
      return handleListDelegations(ctx);
    case "sint__revoke_delegation_tree":
      return handleRevokeTree(args, ctx);
    default:
      return text(`Unknown delegation tool: ${toolName}`);
  }
}

function text(content: string): { content: Array<{ type: string; text: string }> } {
  return { content: [{ type: "text", text: content }] };
}

function handleDelegate(args: Record<string, unknown>, ctx: DelegationToolContext) {
  const subagentId = args["subagentId"] as string | undefined;
  const toolScope = args["toolScope"] as string[] | undefined;
  const expiresInHours = (args["expiresInHours"] as number | undefined) ?? 4;
  const maxCallsPerMinute = args["maxCallsPerMinute"] as number | undefined;

  if (!subagentId || !toolScope || toolScope.length === 0) {
    return text("Error: subagentId and toolScope are required");
  }

  // Get parent token to check current depth
  const parentToken = ctx.tokenStore.get(ctx.tokenId);
  const parentDepth = parentToken?.delegationChain?.depth ?? 0;
  const newDepth = parentDepth + 1;

  if (newDepth > MAX_DELEGATION_DEPTH) {
    return text(`Error: Delegation depth ${newDepth} exceeds maximum of ${MAX_DELEGATION_DEPTH}`);
  }

  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");

  const issuedAt = new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");

  // Issue a single token with the first resource and record all scopes in payload
  const primaryResource = toolScope[0]!;

  const result = issueCapabilityToken(
    {
      issuer: ctx.agentPublicKey,
      subject: subagentId,
      resource: primaryResource,
      actions: ["call"],
      constraints: {},
      ...(maxCallsPerMinute !== undefined
        ? { behavioralConstraints: { maxCallsPerMinute } }
        : {}),
      delegationChain: {
        parentTokenId: ctx.tokenId,
        depth: newDepth,
        attenuated: true,
      },
      expiresAt,
      revocable: true,
    },
    ctx.agentPrivateKey,
  );

  if (!result.ok) {
    return text(`Error issuing delegation token: ${result.error}`);
  }

  const newToken = result.value;
  ctx.tokenStore.set(newToken.tokenId, newToken);

  // Register in delegation tree
  ctx.delegationTree.add({
    tokenId: newToken.tokenId,
    subagentId,
    toolScope,
    parentTokenId: ctx.tokenId,
    depth: newDepth,
    issuedAt,
    expiresAt,
    revoked: false,
  });

  // Ledger event
  ctx.ledger.append({
    eventType: "token.issued" as any,
    agentId: ctx.agentPublicKey,
    tokenId: newToken.tokenId,
    payload: {
      subagentId,
      toolScope,
      parentTokenId: ctx.tokenId,
      depth: newDepth,
      expiresAt,
      maxCallsPerMinute,
    },
  });

  return text(JSON.stringify({
    tokenId: newToken.tokenId,
    subagentId,
    toolScope,
    depth: newDepth,
    expiresAt,
  }, null, 2));
}

function handleListDelegations(ctx: DelegationToolContext) {
  const nodes = ctx.delegationTree.toArray();
  if (nodes.length === 0) {
    return text("No active delegations.");
  }
  return text(JSON.stringify(nodes, null, 2));
}

function handleRevokeTree(args: Record<string, unknown>, ctx: DelegationToolContext) {
  const rootTokenId = args["rootTokenId"] as string | undefined;
  const reason = (args["reason"] as string | undefined) ?? "Revoked via sint__revoke_delegation_tree";

  if (!rootTokenId) {
    return text("Error: rootTokenId is required");
  }

  // Verify the root node exists in the delegation tree before proceeding
  if (!ctx.delegationTree.get(rootTokenId)) {
    return text(`Error: No delegation node found with tokenId "${rootTokenId}"`);
  }

  // Get all IDs in the subtree (DFS)
  const subtreeIds = ctx.delegationTree.getSubtreeIds(rootTokenId);

  // Cascade revoke all
  for (const tokenId of subtreeIds) {
    ctx.revocationStore.revoke(tokenId, reason, ctx.agentPublicKey.slice(0, 16));
    ctx.tokenStore.delete(tokenId);
    ctx.delegationTree.markRevoked(tokenId);
  }

  // Ledger event
  ctx.ledger.append({
    eventType: "token.revoked" as any,
    agentId: ctx.agentPublicKey,
    tokenId: rootTokenId,
    payload: {
      reason,
      cascadeCount: subtreeIds.length,
      revokedTokenIds: subtreeIds,
    },
  });

  return text(JSON.stringify({
    revoked: true,
    rootTokenId,
    cascadeCount: subtreeIds.length,
    revokedTokenIds: subtreeIds,
    reason,
  }, null, 2));
}

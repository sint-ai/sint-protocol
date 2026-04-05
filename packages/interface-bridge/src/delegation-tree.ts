/**
 * SINT — Delegation tree tracker.
 *
 * Tracks the active multi-agent delegation hierarchy:
 * root operator token → sub-agent tokens (attenuation only).
 *
 * Each DelegationNode represents one issued child token. The tree is
 * in-memory; token issuance/revocation also writes ledger events via
 * the sint__delegate_to_agent and sint__revoke_delegation_tree tools.
 *
 * Max depth: 3 hops (enforced at issuance).
 */

export interface DelegationNode {
  readonly tokenId: string;
  readonly subagentId: string;      // public key of the sub-agent
  readonly toolScope: string[];     // resource patterns this token covers
  readonly parentTokenId: string | null;
  readonly depth: number;           // 0 = root, 1 = first child, etc.
  readonly issuedAt: string;        // ISO8601
  readonly expiresAt: string;       // ISO8601
  readonly revoked: boolean;
}

export class DelegationTree {
  private readonly nodes = new Map<string, DelegationNode>();

  /** Add a node (called on successful delegation). */
  add(node: DelegationNode): void { this.nodes.set(node.tokenId, node); }

  /** Get a node by tokenId. */
  get(tokenId: string): DelegationNode | undefined { return this.nodes.get(tokenId); }

  /** Get all active (non-revoked) nodes. */
  getActive(): DelegationNode[] {
    return [...this.nodes.values()].filter(n => !n.revoked);
  }

  /** Get all children of a parent tokenId. */
  getChildren(parentTokenId: string): DelegationNode[] {
    return [...this.nodes.values()].filter(n => n.parentTokenId === parentTokenId && !n.revoked);
  }

  /** Mark a node revoked (tombstone). Does NOT cascade — cascade is done by RevocationStore. */
  markRevoked(tokenId: string): boolean {
    const node = this.nodes.get(tokenId);
    if (!node) return false;
    this.nodes.set(tokenId, { ...node, revoked: true });
    return true;
  }

  /** Get a flattened list of all tokenIds in a subtree rooted at parentTokenId (DFS). */
  getSubtreeIds(rootTokenId: string): string[] {
    const result: string[] = [];
    const stack = [rootTokenId];
    while (stack.length > 0) {
      const id = stack.pop()!;
      result.push(id);
      const children = [...this.nodes.values()].filter(n => n.parentTokenId === id);
      stack.push(...children.map(n => n.tokenId));
    }
    return result;
  }

  /** Return tree as JSON-serialisable array (for HUD display). */
  toArray(): DelegationNode[] {
    return [...this.nodes.values()];
  }
}

/**
 * SINT Protocol — Human Approval Cryptographic Proofs.
 *
 * Cryptographic verification of human approval decisions.
 * Follows the evidence-gated-envelope pattern for Ed25519-signed approvals.
 *
 * An approval resolution must carry:
 * - Body: requestId, decision action, approvedAt timestamp, principalRef (operator ID)
 * - Proof: Ed25519 signature over canonical signing payload
 *
 * The verifier checks:
 * - Signature validity against the provided signer public key
 * - Signer's public key matches an authorized key in quorum.authorized
 *
 * @module @pshkv/gate-policy-gateway/human-proof-verifier
 */

import type { Result } from "@pshkv/core";
import { canonicalJsonStringify, err, ok } from "@pshkv/core";
import { hashSha256, verify } from "@pshkv/gate-capability-tokens";

/** Body of a human approval (the signed payload). */
export interface HumanApprovalBody {
  /** Request being approved. */
  readonly requestId: string;
  /** Decision action being approved (e.g. "allow", "escalate"). */
  readonly decision: string;
  /** ISO 8601 timestamp when the approval was issued. */
  readonly approvedAt: string;
  /** Principal reference identifying the approver (e.g. operator email or ID). */
  readonly principalRef: string;
}

/** Proof material attached to a human approval. */
export interface HumanApprovalProof {
  /** Proof scheme identifier. The reference verifier accepts only "ed25519". */
  readonly type: string;
  /** Hex Ed25519 public key of the approver. */
  readonly signerPublicKey: string;
  /** Hex Ed25519 signature over `humanApprovalSigningPayload()`. */
  readonly signature: string;
}

/** A human approval with cryptographic proof. */
export interface HumanApprovalResolution extends HumanApprovalBody {
  readonly proof: HumanApprovalProof;
}

/**
 * Verifier interface for human approval proofs.
 * Production deployments inject an Ed25519HumanProofVerifier instance.
 */
export interface HumanProofVerifierPlugin {
  verify(
    approval: HumanApprovalResolution,
    authorizedPublicKeys: readonly string[],
  ): Promise<Result<true, string>>;
}

/** Canonical signing payload: the approval body. */
export function humanApprovalSigningPayload(body: HumanApprovalBody): string {
  return canonicalJsonStringify({
    requestId: body.requestId,
    decision: body.decision,
    approvedAt: body.approvedAt,
    principalRef: body.principalRef,
  });
}

/** Content digest of the full approval (body + proof). */
export function humanApprovalDigest(approval: HumanApprovalResolution): string {
  return hashSha256(canonicalJsonStringify(approval));
}

/** Reference Ed25519 verifier for human approval proofs. */
export class Ed25519HumanProofVerifier implements HumanProofVerifierPlugin {
  async verify(
    approval: HumanApprovalResolution,
    authorizedPublicKeys: readonly string[],
  ): Promise<Result<true, string>> {
    const proof = approval.proof;

    if (!proof || proof.type !== "ed25519") {
      return err(`unsupported proof type: ${String(proof?.type)}`);
    }

    if (!proof.signerPublicKey || !proof.signature) {
      return err("proof is missing signerPublicKey or signature");
    }

    if (!authorizedPublicKeys.includes(proof.signerPublicKey)) {
      return err("approval signer public key is not in authorized list");
    }

    const valid = verify(
      proof.signerPublicKey,
      proof.signature,
      humanApprovalSigningPayload(approval),
    );

    return valid ? ok(true) : err("signature verification failed");
  }
}

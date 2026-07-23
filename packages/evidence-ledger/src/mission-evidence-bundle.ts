import {
  canonicalJsonStringify,
  type Ed25519PublicKey,
  type MissionEvidenceBundle,
  type SHA256,
} from "@pshkv/core";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";

export type MissionEvidenceBundleInput = Omit<
  MissionEvidenceBundle,
  "bundleHash" | "signature" | "signerPublicKey"
>;

function hashJson(value: unknown): SHA256 {
  return bytesToHex(
    sha256(new TextEncoder().encode(canonicalJsonStringify(value))),
  );
}
export function buildMissionEvidenceBundle(params: {
  readonly bundle: MissionEvidenceBundleInput;
  readonly signerPublicKey: Ed25519PublicKey;
  readonly signFn: (data: string) => string;
}): MissionEvidenceBundle {
  const bundleHash = hashJson(params.bundle);
  const unsigned = {
    ...params.bundle,
    bundleHash,
    signerPublicKey: params.signerPublicKey,
  };
  return {
    ...unsigned,
    signature: params.signFn(canonicalJsonStringify(unsigned)),
  };
}

export function verifyMissionEvidenceBundle(
  bundle: MissionEvidenceBundle,
  verifySignatureFn: (
    publicKey: string,
    signature: string,
    data: string,
  ) => boolean,
): boolean {
  const {
    bundleHash,
    signature,
    signerPublicKey,
    ...bundleInput
  } = bundle;
  if (hashJson(bundleInput) !== bundleHash) return false;

  return verifySignatureFn(
    signerPublicKey,
    signature,
    canonicalJsonStringify({
      ...bundleInput,
      bundleHash,
      signerPublicKey,
    }),
  );
}

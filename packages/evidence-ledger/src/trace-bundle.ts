import {
  canonicalJsonStringify,
  type Ed25519PublicKey,
  type SHA256,
  type TraceBundleBase,
} from "@pshkv/core";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";

export type TraceBundleInput = Omit<
  TraceBundleBase,
  "bundleHash" | "signerPublicKey" | "signature"
>;

function hashJson(value: unknown): SHA256 {
  return bytesToHex(
    sha256(new TextEncoder().encode(canonicalJsonStringify(value))),
  );
}

export function computeTraceBundleHash(bundle: TraceBundleInput): SHA256 {
  return hashJson(bundle);
}

export function buildTraceBundle(params: {
  readonly bundle: TraceBundleInput;
  readonly signerPublicKey: Ed25519PublicKey;
  readonly signFn: (data: string) => string;
}): TraceBundleBase {
  const bundleHash = computeTraceBundleHash(params.bundle);
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

export function verifyTraceBundle(
  bundle: TraceBundleBase,
  verifySignatureFn: (
    publicKey: string,
    signature: string,
    data: string,
  ) => boolean,
): boolean {
  const { bundleHash, signature, signerPublicKey, ...bundleInput } = bundle;
  if (computeTraceBundleHash(bundleInput) !== bundleHash) return false;

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


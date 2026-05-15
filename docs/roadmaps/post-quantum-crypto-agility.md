# Post-Quantum Crypto Agility Roadmap

SINT is not quantum-resistant today. The current production profile uses
Ed25519 signatures and SHA-256 hash chains. That is strong classical crypto,
but Ed25519 is not secure against a cryptographically relevant quantum
computer.

This roadmap defines the migration path without overstating current guarantees.

## Current State

Implemented today:

- Ed25519 capability-token signatures
- Ed25519 request signing for gateway authentication
- Ed25519 proof receipts
- SHA-256 hash-chained EvidenceLedger entries
- explicit token-level `cryptoProfile` metadata
- token-level `postQuantumSignatures` metadata for future hybrid/PQ profiles
- fail-closed validation for mandatory non-classic token profiles until a real
  PQ verifier is wired

The current compatible profile is:

```text
classic-ed25519
```

The following profiles are reserved and mandatory once selected:

```text
hybrid-ed25519-mldsa65
pq-mldsa65
pq-slh-dsa
```

Until SINT ships an audited verifier for those profiles, issuance and validation
fail closed with `UNSUPPORTED_CRYPTO_PROFILE`.

## Target Standards

SINT should align with the NIST post-quantum standards:

- ML-KEM for key establishment
- ML-DSA for general-purpose post-quantum signatures
- SLH-DSA as a conservative hash-based signature option for long-lived evidence

The first production migration should be hybrid, not PQ-only:

```text
Ed25519 + ML-DSA-65
```

Hybrid mode keeps compatibility with existing SINT identities while adding
post-quantum signature evidence for long-lived authorization records.

## Migration Gates

### Gate 1. Crypto-Agile Token Contract

Status: started.

Exit criteria:

- tokens carry `cryptoProfile`
- tokens can carry provider-specific PQ signature metadata
- signing payload includes crypto-profile fields
- persistence preserves crypto-profile fields
- unsupported mandatory profiles fail closed

### Gate 2. PQ Verification Provider

Exit criteria:

- verifier interface accepts canonical payload, algorithm, public-key reference,
  and signature bytes
- ML-DSA-65 verifier implementation is wired behind the interface
- verifier dependencies and supply-chain posture are documented
- test vectors cover valid, invalid, missing, and mismatched PQ signatures

Candidate implementation paths:

- Open Quantum Safe for test infrastructure and OpenSSL provider experiments
- Cloudflare CIRCL for Go-side interop and reference vectors
- RustCrypto / audited ML-DSA crates when the Rust SDK needs native support

### Gate 3. Hybrid Token Issuance

Exit criteria:

- issuer can mint `hybrid-ed25519-mldsa65`
- validator requires both Ed25519 and ML-DSA-65 to verify
- delegation preserves hybrid requirements without attenuation escape
- revocation and persistence preserve both signature families

### Gate 4. Evidence Ledger Hash Agility

Exit criteria:

- ledger events carry `hashAlgorithm`
- supported algorithms include `sha256` and at least one stronger long-term
  profile such as `sha384` or `sha512`
- proof receipts bind the hash algorithm into the signed payload
- mixed-profile migration is documented for existing ledgers

### Gate 5. Gateway Transport Hardening

Exit criteria:

- deployment docs explain hybrid/PQ TLS experiments separately from application
  token signatures
- OQS/OpenSSL provider test path is documented
- production docs avoid claiming PQ TLS unless the deployment has verified it

## Non-Goals For The First Slice

- PQ-only identity migration
- replacing all Ed25519 keys at once
- claiming GDPR, safety, or regulatory compliance solely from PQ crypto
- custom cryptographic implementations

## Operating Rule

SINT should become quantum-migration-ready before it claims to be
quantum-resistant. Hybrid evidence for long-lived physical-AI authorization is
the first credible milestone.

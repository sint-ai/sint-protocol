# SINT Edge Authority

Deterministic, offline evaluator for the SINT Mission Authority protocol.

The crate has no HTTP client and performs no network access on the execution
path. Deployments supply:

- a `ManifestVerifier` backed by their Ed25519, TPM, HSM, or secure-element trust
  implementation;
- synchronized revocation state in each `ActionProposal`;
- rollback-resistant `AuthorityHead` state for rejecting superseded manifests;
- a `HardwareSigner` implementation when signing evidence digests.

Disconnected deployments should call `evaluate_with_authority_head` and persist
the accepted platform head in TPM-backed or otherwise anti-rollback storage.
The edge runtime accepts only the exact signed manifest identified by that
high-water mark.

SINT evaluates externally proposed actions. It does not select targets, generate
effects, or recommend engagements.

```bash
cargo test -p sint-edge-authority
```

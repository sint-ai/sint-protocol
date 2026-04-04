# SINT Protocol — Open Agent Trust Registry (OATR) Domain Verification

## Status

- Registry entry: `/tmp/open-agent-trust-registry/registry/issuers/sint-protocol.json` (PR #24 submitted)
- Domain verification endpoint: `GET /.well-known/agent-trust.json` (implemented in gateway-server)
- **Pending**: Live deployment at `https://sint.ai/.well-known/agent-trust.json`

## Verification Flow

1. OATR registry reads `https://sint.ai/.well-known/agent-trust.json`
2. Downloads our Ed25519 public key (`kid: sint-registry-2026-04`)
3. Verifies signature over canonical message `oatr-proof-v1:sint-protocol`
4. Marks entry as `domain_verified: true`

## TODO (this branch)

- [ ] Deploy gateway-server to production at `sint.ai`
- [ ] Point DNS `sint.ai` → gateway-server deployment
- [ ] Verify `/.well-known/agent-trust.json` returns correct JSON
- [ ] Ping OATR maintainers to re-check PR #24 after deployment
- [ ] Add `oatr_verified` badge to README

## Current `.well-known/agent-trust.json` Response

```json
{
  "issuer_id": "sint-protocol",
  "protocol": "SINT",
  "version": "0.2.0",
  "supervision_model": "tiered",
  "tiers": ["T0_observe", "T1_prepare", "T2_act", "T3_commit"],
  "immutable_audit": true,
  "attestation_format": "sint-token-v1",
  "public_key": {
    "kid": "sint-registry-2026-04",
    "algorithm": "Ed25519",
    "key": "Yq-yYyx7sLaMHE_jmTkgYPQoSJVJMDRfdAcInJxnV0E"
  },
  "compliance": {
    "OWASP_ASI_coverage": "ASI01-ASI10",
    "eu_ai_act_articles": ["Art.14(4)(e)", "Art.22"],
    "nist_rmf": "GOVERN-1.1"
  },
  "links": {
    "spec": "https://github.com/sint-ai/sint-protocol/blob/master/docs/SINT_v0.2_SPEC.md",
    "conformance": "https://github.com/sint-ai/sint-protocol/blob/master/docs/CONFORMANCE_CERTIFICATION_MATRIX_v0.2.md"
  }
}
```

# A2A Agent Card External Evidence

SINT treats an A2A Agent Card as a stable identity and capability descriptor.
The card can prove that a subject published a specific card, but it should not
also become the mutable place for live authority, behavioral trust, or
counterparty safety state.

The A2A bridge therefore supports optional `externalEvidence` references on
`A2AAgentCard`. These records compose alongside card identity:

- `authority-receipt` for action-time authorization, approval, or restraint
  evidence.
- `tool-surface-scan` for freshness-bounded scan results over exposed skills,
  tools, or endpoints.
- `signed-tool-definition` for canonical tool definition signatures that detect
  drift or poisoning.
- `counterparty-safety` for verifier-issued safety findings.
- `verification-state` for offline-verifiable state or verdict records.

Each reference carries a subject, issuer, canonical evidence digest, optional
URI, optional signature, and optional freshness window. SINT consumers can
filter these records by type, subject, and freshness, then decide under local
policy whether the evidence is admissible for the requested interaction.

This preserves the failure boundaries:

- If the Agent Card signature or identity proof fails, the card is not trusted.
- If authority evidence is stale or missing, the action should fail closed, but
  the underlying Agent Card identity may still be valid.
- If tool-surface evidence is stale or mismatched, the runtime should refuse to
  connect to that surface, but it should not rewrite the card identity.

In SINT, this model connects the A2A bridge to existing evidence-producing
surfaces such as the MCP scanner, signed MCP tool-definition registry, policy
gateway decision receipts, and evidence ledger.

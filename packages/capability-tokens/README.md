# @sint/gate-capability-tokens

Ed25519-signed capability tokens with delegation chains for AI agent authorization.

## Install

```bash
npm install @sint/gate-capability-tokens
```

## Usage

```typescript
import {
  generateKeypair,
  issueCapabilityToken,
  validateCapabilityToken,
  delegateCapabilityToken,
  keyToDid,
} from "@pshkv/gate-capability-tokens";

// Generate keys
const issuer = await generateKeypair();
const agent = await generateKeypair();

// Issue a scoped token
const token = await issueCapabilityToken({
  issuerPrivateKey: issuer.privateKey,
  issuerDid: keyToDid(issuer.publicKey),
  subjectDid: keyToDid(agent.publicKey),
  permissions: {
    resources: ["file:///workspace/**"],
    actions: ["read", "write"],
    maxTier: 1,
  },
  ttlSeconds: 3600,
});

// Validate
const result = await validateCapabilityToken(token, issuer.publicKey);
console.log(result.valid); // true

// Delegate to sub-agent (attenuation only — never escalate)
const subAgent = await generateKeypair();
const delegated = await delegateCapabilityToken({
  parentToken: token,
  delegatorPrivateKey: agent.privateKey,
  delegateeDid: keyToDid(subAgent.publicKey),
  permissions: { resources: ["file:///workspace/output/**"], actions: ["read"], maxTier: 0 },
  ttlSeconds: 600,
});
```

## Features

- **Ed25519 signatures** — fast, compact, modern cryptography
- **Scoped permissions** — resource patterns, action restrictions, tier ceilings
- **Delegation chains** — max 3 hops, attenuation only
- **Time-limited** — TTL-based expiry
- **Instant revocation** — revocation store with async propagation
- **W3C DID** — `did:key` identifiers for interoperability

## Part of SINT Protocol

📖 [Full documentation](https://github.com/sint-ai/sint-protocol) · 🚀 [Getting Started](https://github.com/sint-ai/sint-protocol/blob/master/docs/getting-started.md)

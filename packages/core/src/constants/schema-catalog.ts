/**
 * SINT Protocol — Public schema catalog.
 *
 * Machine-readable JSON Schema documents for public artifacts.
 *
 * @module @sint/core/constants/schema-catalog
 */

export type JsonSchemaDoc = Record<string, unknown>;

const CAPABILITY_TOKEN_SCHEMA: JsonSchemaDoc = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.sint.ai/capability-token.schema.json",
  title: "SINT CapabilityToken",
  type: "object",
  required: [
    "tokenId",
    "issuer",
    "subject",
    "resource",
    "actions",
    "constraints",
    "delegationChain",
    "issuedAt",
    "expiresAt",
    "revocable",
    "signature",
  ],
  properties: {
    tokenId: { type: "string" },
    issuer: { type: "string" },
    subject: { type: "string" },
    resource: { type: "string" },
    actions: { type: "array", items: { type: "string" } },
    constraints: { type: "object" },
    modelConstraints: { type: "object" },
    attestationRequirements: { type: "object" },
    executionEnvelope: { type: "object" },
    delegationChain: { type: "object" },
    issuedAt: { type: "string", format: "date-time" },
    expiresAt: { type: "string", format: "date-time" },
    revocable: { type: "boolean" },
    revocationEndpoint: { type: "string" },
    signature: { type: "string" },
  },
  additionalProperties: false,
};

const REQUEST_SCHEMA: JsonSchemaDoc = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.sint.ai/request.schema.json",
  title: "SINT Request",
  type: "object",
  required: ["requestId", "timestamp", "agentId", "tokenId", "resource", "action", "params"],
  properties: {
    requestId: { type: "string" },
    timestamp: { type: "string", format: "date-time" },
    agentId: { type: "string" },
    tokenId: { type: "string" },
    resource: { type: "string" },
    action: { type: "string" },
    params: { type: "object" },
    physicalContext: { type: "object" },
    recentActions: { type: "array", items: { type: "string" } },
    executionContext: { type: "object" },
  },
  additionalProperties: false,
};

const POLICY_DECISION_SCHEMA: JsonSchemaDoc = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.sint.ai/policy-decision.schema.json",
  title: "SINT PolicyDecision",
  type: "object",
  required: ["requestId", "timestamp", "action", "assignedTier", "assignedRisk"],
  properties: {
    requestId: { type: "string" },
    timestamp: { type: "string", format: "date-time" },
    action: { type: "string", enum: ["allow", "deny", "escalate", "transform"] },
    escalation: { type: "object" },
    denial: { type: "object" },
    transformations: { type: "object" },
    assignedTier: { type: "string" },
    assignedRisk: { type: "string" },
  },
  additionalProperties: false,
};

const EVIDENCE_EVENT_SCHEMA: JsonSchemaDoc = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.sint.ai/evidence-event.schema.json",
  title: "SINT EvidenceEvent",
  type: "object",
  required: [
    "eventId",
    "sequenceNumber",
    "timestamp",
    "eventType",
    "agentId",
    "payload",
    "previousHash",
    "hash",
  ],
  properties: {
    eventId: { type: "string" },
    sequenceNumber: { type: "string" },
    timestamp: { type: "string", format: "date-time" },
    eventType: { type: "string" },
    agentId: { type: "string" },
    tokenId: { type: "string" },
    payload: { type: "object" },
    previousHash: { type: "string" },
    hash: { type: "string" },
  },
  additionalProperties: false,
};

const APPROVAL_RESOLUTION_SCHEMA: JsonSchemaDoc = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.sint.ai/approval-resolution.schema.json",
  title: "SINT ApprovalResolution",
  type: "object",
  required: ["status", "by"],
  properties: {
    status: { type: "string", enum: ["approved", "denied"] },
    by: { type: "string" },
    reason: { type: "string" },
  },
  additionalProperties: false,
};

const BRIDGE_PROFILE_SCHEMA: JsonSchemaDoc = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.sint.ai/bridge-profile.schema.json",
  title: "SINT BridgeProfile",
  type: "object",
  required: ["bridgeId", "protocol", "version", "resourcePattern", "defaultTierByAction"],
  properties: {
    bridgeId: { type: "string" },
    protocol: { type: "string" },
    version: { type: "string" },
    resourcePattern: { type: "string" },
    defaultTierByAction: { type: "object" },
    notes: { type: "string" },
  },
  additionalProperties: false,
};

export const SINT_SCHEMA_CATALOG: Readonly<Record<string, JsonSchemaDoc>> = {
  "capability-token": CAPABILITY_TOKEN_SCHEMA,
  request: REQUEST_SCHEMA,
  "policy-decision": POLICY_DECISION_SCHEMA,
  "evidence-event": EVIDENCE_EVENT_SCHEMA,
  "approval-resolution": APPROVAL_RESOLUTION_SCHEMA,
  "bridge-profile": BRIDGE_PROFILE_SCHEMA,
} as const;

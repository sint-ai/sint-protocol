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
    verifiableComputeRequirements: { type: "object" },
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
    executionContext: {
      type: "object",
      properties: {
        deploymentProfile: { type: "string" },
        siteId: { type: "string" },
        bridgeId: { type: "string" },
        bridgeProtocol: { type: "string" },
        executor: {
          type: "object",
          properties: {
            runtimeId: { type: "string" },
            nodeId: { type: "string" },
            did: { type: "string" },
            host: { type: "string" },
          },
          additionalProperties: false,
        },
        model: {
          type: "object",
          properties: {
            modelId: { type: "string" },
            modelVersion: { type: "string" },
            modelFingerprintHash: { type: "string" },
          },
          additionalProperties: false,
        },
        attestation: {
          type: "object",
          properties: {
            grade: { type: "integer", minimum: 0, maximum: 3 },
            teeBackend: {
              type: "string",
              enum: ["intel-sgx", "arm-trustzone", "amd-sev", "tpm2", "none"],
            },
            quoteRef: { type: "string" },
          },
          additionalProperties: false,
        },
        verifiableCompute: {
          type: "object",
          properties: {
            proofType: {
              type: "string",
              enum: ["risc0-groth16", "sp1-groth16", "snark", "stark", "tee-attested"],
            },
            proofRef: { type: "string" },
            proofHash: { type: "string" },
            publicInputsHash: { type: "string" },
            generatedAt: { type: "string", format: "date-time" },
            verifierRef: { type: "string" },
          },
          additionalProperties: false,
        },
        hardwareSafety: {
          type: "object",
          properties: {
            permitState: { type: "string", enum: ["granted", "denied", "unknown", "stale"] },
            interlockState: { type: "string", enum: ["closed", "open", "fault", "unknown"] },
            estopState: { type: "string", enum: ["clear", "triggered", "unknown"] },
            observedAt: { type: "string", format: "date-time" },
            controllerId: { type: "string" },
          },
          additionalProperties: false,
        },
        preapprovedCorridor: {
          type: "object",
          properties: {
            corridorId: { type: "string" },
            expiresAt: { type: "string", format: "date-time" },
            maxDeviationMeters: { type: "number", minimum: 0 },
            maxHeadingDeviationDeg: { type: "number", minimum: 0, maximum: 180 },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
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
    escalation: {
      type: "object",
      properties: {
        requiredTier: { type: "string" },
        reason: { type: "string" },
        timeoutMs: { type: "number" },
        fallbackAction: { type: "string", enum: ["deny", "safe-stop"] },
        approvalQuorum: { $ref: "#/definitions/ApprovalQuorum" },
      },
      additionalProperties: true,
    },
    denial: { type: "object" },
    transformations: { type: "object" },
    assignedTier: { type: "string" },
    assignedRisk: { type: "string" },
  },
  additionalProperties: false,
  definitions: {
    ApprovalQuorum: {
      type: "object",
      required: ["required", "authorized"],
      properties: {
        required: { type: "integer", minimum: 1 },
        authorized: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
  },
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

const CONSTRAINT_ENVELOPE_SCHEMA: JsonSchemaDoc = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.sint.ai/constraint-envelope.schema.json",
  title: "SINT ConstraintEnvelope",
  type: "object",
  properties: {
    corridorId: { type: "string" },
    expiresAt: { type: "string", format: "date-time" },
    maxDeviationMeters: { type: "number", minimum: 0 },
    maxHeadingDeviationDeg: { type: "number", minimum: 0, maximum: 180 },
    maxVelocityMps: { type: "number", minimum: 0 },
    maxForceNewtons: { type: "number", minimum: 0 },
  },
  additionalProperties: true,
};

const SITE_PROFILE_SCHEMA: JsonSchemaDoc = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.sint.ai/site-profile.schema.json",
  title: "SINT SiteProfile",
  type: "object",
  required: ["siteId", "deploymentProfile", "bridges"],
  properties: {
    siteId: { type: "string" },
    deploymentProfile: { type: "string" },
    bridges: { type: "array", items: { type: "string" } },
    defaultEscalationTheta: { type: "number", minimum: 0 },
    notes: { type: "string" },
  },
  additionalProperties: false,
};

const APPROVAL_QUORUM_SCHEMA: JsonSchemaDoc = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.sint.ai/approval-quorum.schema.json",
  title: "SINT ApprovalQuorum",
  type: "object",
  required: ["required", "authorized"],
  properties: {
    required: { type: "integer", minimum: 1 },
    authorized: { type: "array", items: { type: "string" } },
  },
  additionalProperties: false,
};

const REVOCATION_SCHEMA: JsonSchemaDoc = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.sint.ai/revocation.schema.json",
  title: "SINT Revocation",
  type: "object",
  required: ["tokenId", "reason", "revokedBy", "timestamp"],
  properties: {
    tokenId: { type: "string" },
    reason: { type: "string" },
    revokedBy: { type: "string" },
    timestamp: { type: "string", format: "date-time" },
  },
  additionalProperties: false,
};

const TIER_COMPLIANCE_CROSSWALK_SCHEMA: JsonSchemaDoc = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.sint.ai/tier-compliance-crosswalk.schema.json",
  title: "SINT Tier Compliance Crosswalk",
  type: "object",
  required: ["tier", "consequenceClass", "mappings"],
  properties: {
    tier: { type: "string", enum: ["T0_observe", "T1_prepare", "T2_act", "T3_commit"] },
    consequenceClass: {
      type: "string",
      enum: ["monitoring", "bounded-write", "physical-state-change", "irreversible-commit"],
    },
    mappings: {
      type: "array",
      items: {
        type: "object",
        required: ["framework", "reference", "requirement", "sintEnforcement"],
        properties: {
          framework: {
            type: "string",
            enum: ["nist-ai-rmf-1.0", "iso-iec-42001-2023", "eu-ai-act-2024-1689"],
          },
          reference: { type: "string" },
          requirement: { type: "string" },
          sintEnforcement: { type: "string" },
        },
        additionalProperties: false,
      },
      minItems: 1,
    },
  },
  additionalProperties: false,
};

export const SINT_SCHEMA_CATALOG: Readonly<Record<string, JsonSchemaDoc>> = {
  "capability-token": CAPABILITY_TOKEN_SCHEMA,
  request: REQUEST_SCHEMA,
  "policy-decision": POLICY_DECISION_SCHEMA,
  "evidence-event": EVIDENCE_EVENT_SCHEMA,
  "constraint-envelope": CONSTRAINT_ENVELOPE_SCHEMA,
  "approval-resolution": APPROVAL_RESOLUTION_SCHEMA,
  "approval-quorum": APPROVAL_QUORUM_SCHEMA,
  "bridge-profile": BRIDGE_PROFILE_SCHEMA,
  "site-profile": SITE_PROFILE_SCHEMA,
  revocation: REVOCATION_SCHEMA,
  "tier-compliance-crosswalk": TIER_COMPLIANCE_CROSSWALK_SCHEMA,
} as const;

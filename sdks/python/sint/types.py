"""
SINT Protocol — Pydantic models mirroring TypeScript types.

Covers:
  - ApprovalTier / RiskTier enums
  - SintRequest  (policy.ts → SintRequest)
  - PolicyDecision (policy.ts → PolicyDecision)
  - LedgerEvent  (evidence.ts → SintLedgerEvent)
  - GatewayConfig (SDK configuration)
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class ApprovalTier(str, Enum):
    """Graduated authorization tiers mapped to physical consequence severity.

    T0 — Read-only, auto-approved, logged.
    T1 — Idempotent writes / staging, auto-approved with audit.
    T2 — Stateful mutations with physical consequences, requires review.
    T3 — Irreversible actions, requires explicit human approval.
    """

    T0_OBSERVE = "T0_observe"
    T1_PREPARE = "T1_prepare"
    T2_ACT = "T2_act"
    T3_COMMIT = "T3_commit"


class RiskTier(str, Enum):
    """Risk tiers classifying resource sensitivity."""

    T0_READ = "T0_read"
    T1_WRITE_LOW = "T1_write_low"
    T2_STATEFUL = "T2_stateful"
    T3_IRREVERSIBLE = "T3_irreversible"


# ---------------------------------------------------------------------------
# Physical-context sub-models
# ---------------------------------------------------------------------------


class PhysicalPosition(BaseModel):
    x: float
    y: float
    z: float


class PhysicalContext(BaseModel):
    human_detected: bool | None = Field(None, alias="humanDetected")
    current_force_newtons: float | None = Field(None, alias="currentForceNewtons")
    current_velocity_mps: float | None = Field(None, alias="currentVelocityMps")
    current_position: PhysicalPosition | None = Field(None, alias="currentPosition")

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# ExecutionContext sub-models (optional, kept flat for SDK ergonomics)
# ---------------------------------------------------------------------------


class ExecutorIdentity(BaseModel):
    runtime_id: str | None = Field(None, alias="runtimeId")
    node_id: str | None = Field(None, alias="nodeId")
    did: str | None = None
    host: str | None = None

    model_config = {"populate_by_name": True}


class AttestationContext(BaseModel):
    grade: int | None = None
    tee_backend: str | None = Field(None, alias="teeBackend")
    quote_ref: str | None = Field(None, alias="quoteRef")

    model_config = {"populate_by_name": True}


class HardwareSafetyContext(BaseModel):
    permit_state: str | None = Field(None, alias="permitState")
    interlock_state: str | None = Field(None, alias="interlockState")
    estop_state: str | None = Field(None, alias="estopState")
    observed_at: str | None = Field(None, alias="observedAt")
    controller_id: str | None = Field(None, alias="controllerId")

    model_config = {"populate_by_name": True}


class ExecutionContext(BaseModel):
    deployment_profile: str | None = Field(None, alias="deploymentProfile")
    site_id: str | None = Field(None, alias="siteId")
    bridge_id: str | None = Field(None, alias="bridgeId")
    bridge_protocol: str | None = Field(None, alias="bridgeProtocol")
    executor: ExecutorIdentity | None = None
    attestation: AttestationContext | None = None
    hardware_safety: HardwareSafetyContext | None = Field(None, alias="hardwareSafety")

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# SintRequest
# ---------------------------------------------------------------------------


class SintRequest(BaseModel):
    """A request entering the Policy Gateway for evaluation.

    Maps to the TypeScript ``SintRequest`` interface in
    ``packages/core/src/types/policy.ts``.
    """

    request_id: str = Field(..., alias="requestId")
    timestamp: str
    agent_id: str = Field(..., alias="agentId")
    token_id: str = Field(..., alias="tokenId")
    resource: str
    action: str
    params: dict[str, Any] = Field(default_factory=dict)
    physical_context: PhysicalContext | None = Field(None, alias="physicalContext")
    recent_actions: list[str] | None = Field(None, alias="recentActions")
    execution_context: ExecutionContext | None = Field(None, alias="executionContext")

    model_config = {"populate_by_name": True}

    def to_gateway_dict(self) -> dict[str, Any]:
        """Serialize to camelCase dict suitable for the gateway REST API."""
        return self.model_dump(by_alias=True, exclude_none=True)


# ---------------------------------------------------------------------------
# PolicyDecision
# ---------------------------------------------------------------------------


class DenialInfo(BaseModel):
    reason: str
    policy_violated: str = Field(..., alias="policyViolated")
    suggested_alternative: str | None = Field(None, alias="suggestedAlternative")

    model_config = {"populate_by_name": True}


class EscalationInfo(BaseModel):
    required_tier: ApprovalTier = Field(..., alias="requiredTier")
    reason: str
    timeout_ms: int = Field(..., alias="timeoutMs")
    fallback_action: str = Field(..., alias="fallbackAction")

    model_config = {"populate_by_name": True}


class PolicyDecision(BaseModel):
    """The Policy Gateway's decision on a request.

    Maps to the TypeScript ``PolicyDecision`` interface in
    ``packages/core/src/types/policy.ts``.
    """

    request_id: str = Field(..., alias="requestId")
    timestamp: str
    action: str  # "allow" | "deny" | "escalate" | "transform"
    assigned_tier: ApprovalTier = Field(..., alias="assignedTier")
    assigned_risk: RiskTier = Field(..., alias="assignedRisk")
    approval_request_id: str | None = Field(None, alias="approvalRequestId")
    denial: DenialInfo | None = None
    escalation: EscalationInfo | None = None
    transformations: dict[str, Any] | None = None

    model_config = {"populate_by_name": True}

    @property
    def allowed(self) -> bool:
        return self.action == "allow"

    @property
    def denied(self) -> bool:
        return self.action == "deny"

    @property
    def needs_escalation(self) -> bool:
        return self.action == "escalate"


# ---------------------------------------------------------------------------
# LedgerEvent
# ---------------------------------------------------------------------------


class LedgerEvent(BaseModel):
    """A single immutable event in the Evidence Ledger.

    Maps to the TypeScript ``SintLedgerEvent`` interface in
    ``packages/core/src/types/evidence.ts``.

    Note: ``sequence_number`` is serialised as a string from the gateway
    because JavaScript BigInt is not native JSON.
    """

    event_id: str = Field(..., alias="eventId")
    sequence_number: str = Field(..., alias="sequenceNumber")
    timestamp: str
    event_type: str = Field(..., alias="eventType")
    agent_id: str = Field(..., alias="agentId")
    token_id: str | None = Field(None, alias="tokenId")
    payload: dict[str, Any] = Field(default_factory=dict)
    previous_hash: str = Field(..., alias="previousHash")
    hash: str
    rosclaw_audit_ref: str | None = Field(None, alias="rosclaw_audit_ref")
    rosclaw_failure_mode: str | None = Field(None, alias="rosclaw_failure_mode")
    foundation_model_id: str | None = Field(None, alias="foundation_model_id")

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# GatewayConfig
# ---------------------------------------------------------------------------


class GatewayConfig(BaseModel):
    """Configuration for GatewayClient."""

    base_url: str = Field(..., description="Base URL of the SINT Policy Gateway, e.g. http://localhost:3000")
    token: str | None = Field(None, description="Bearer token / API key for gateway authentication")
    timeout: float = Field(30.0, description="HTTP request timeout in seconds")
    max_retries: int = Field(2, description="Retries for transient gateway/network failures")
    retry_backoff_ms: int = Field(150, description="Base backoff for retries in milliseconds")

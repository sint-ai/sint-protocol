"""Tests for sint.types — Pydantic model round-trips."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from sint.types import (
    ApprovalTier,
    GatewayConfig,
    LedgerEvent,
    PolicyDecision,
    RiskTier,
    SintRequest,
)


# ---------------------------------------------------------------------------
# ApprovalTier enum
# ---------------------------------------------------------------------------


class TestApprovalTier:
    def test_values_match_typescript(self) -> None:
        assert ApprovalTier.T0_OBSERVE.value == "T0_observe"
        assert ApprovalTier.T1_PREPARE.value == "T1_prepare"
        assert ApprovalTier.T2_ACT.value == "T2_act"
        assert ApprovalTier.T3_COMMIT.value == "T3_commit"

    def test_enum_from_string(self) -> None:
        assert ApprovalTier("T0_observe") is ApprovalTier.T0_OBSERVE
        assert ApprovalTier("T3_commit") is ApprovalTier.T3_COMMIT


class TestRiskTier:
    def test_values_match_typescript(self) -> None:
        assert RiskTier.T0_READ.value == "T0_read"
        assert RiskTier.T1_WRITE_LOW.value == "T1_write_low"
        assert RiskTier.T2_STATEFUL.value == "T2_stateful"
        assert RiskTier.T3_IRREVERSIBLE.value == "T3_irreversible"


# ---------------------------------------------------------------------------
# SintRequest
# ---------------------------------------------------------------------------


_MINIMAL_REQUEST_CAMEL = {
    "requestId": "01905f7c-0000-7000-8000-000000000001",
    "timestamp": "2026-04-04T12:00:00.000000Z",
    "agentId": "a" * 64,
    "tokenId": "01905f7c-0000-7000-8000-000000000002",
    "resource": "mcp://filesystem/readFile",
    "action": "call",
    "params": {},
}


class TestSintRequest:
    def test_parse_camel_case(self) -> None:
        req = SintRequest.model_validate(_MINIMAL_REQUEST_CAMEL)
        assert req.request_id == "01905f7c-0000-7000-8000-000000000001"
        assert req.agent_id == "a" * 64
        assert req.resource == "mcp://filesystem/readFile"

    def test_to_gateway_dict_roundtrip(self) -> None:
        req = SintRequest.model_validate(_MINIMAL_REQUEST_CAMEL)
        d = req.to_gateway_dict()
        assert d["requestId"] == req.request_id
        assert d["agentId"] == req.agent_id
        assert "physicalContext" not in d  # None fields excluded

    def test_snake_case_construction(self) -> None:
        req = SintRequest(
            request_id="01905f7c-0000-7000-8000-000000000003",
            timestamp="2026-04-04T12:00:00.000000Z",
            agent_id="b" * 64,
            token_id="01905f7c-0000-7000-8000-000000000004",
            resource="ros2:///cmd_vel",
            action="publish",
            params={"linear": {"x": 0.5}},
        )
        assert req.resource == "ros2:///cmd_vel"

    def test_missing_required_field_raises(self) -> None:
        with pytest.raises(ValidationError):
            SintRequest.model_validate({"requestId": "x"})  # missing many fields


# ---------------------------------------------------------------------------
# PolicyDecision
# ---------------------------------------------------------------------------


_ALLOW_DECISION = {
    "requestId": "01905f7c-0000-7000-8000-000000000001",
    "timestamp": "2026-04-04T12:00:00.000000Z",
    "action": "allow",
    "assignedTier": "T0_observe",
    "assignedRisk": "T0_read",
}

_DENY_DECISION = {
    "requestId": "01905f7c-0000-7000-8000-000000000002",
    "timestamp": "2026-04-04T12:00:00.000000Z",
    "action": "deny",
    "assignedTier": "T2_act",
    "assignedRisk": "T2_stateful",
    "denial": {
        "reason": "Human detected in workspace",
        "policyViolated": "SINT-P-001",
        "suggestedAlternative": "Wait for clearance",
    },
}

_ESCALATE_DECISION = {
    "requestId": "01905f7c-0000-7000-8000-000000000003",
    "timestamp": "2026-04-04T12:00:00.000000Z",
    "action": "escalate",
    "assignedTier": "T3_commit",
    "assignedRisk": "T3_irreversible",
    "escalation": {
        "requiredTier": "T3_commit",
        "reason": "Irreversible action requires human approval",
        "timeoutMs": 30000,
        "fallbackAction": "deny",
    },
}


class TestPolicyDecision:
    def test_allow_decision(self) -> None:
        d = PolicyDecision.model_validate(_ALLOW_DECISION)
        assert d.allowed is True
        assert d.denied is False
        assert d.needs_escalation is False
        assert d.assigned_tier == ApprovalTier.T0_OBSERVE

    def test_deny_decision(self) -> None:
        d = PolicyDecision.model_validate(_DENY_DECISION)
        assert d.denied is True
        assert d.denial is not None
        assert d.denial.reason == "Human detected in workspace"
        assert d.denial.policy_violated == "SINT-P-001"
        assert d.denial.suggested_alternative == "Wait for clearance"

    def test_escalate_decision(self) -> None:
        d = PolicyDecision.model_validate(_ESCALATE_DECISION)
        assert d.needs_escalation is True
        assert d.escalation is not None
        assert d.escalation.required_tier == ApprovalTier.T3_COMMIT
        assert d.escalation.timeout_ms == 30000


# ---------------------------------------------------------------------------
# LedgerEvent
# ---------------------------------------------------------------------------


_LEDGER_EVENT = {
    "eventId": "01905f7c-0000-7000-8000-000000000001",
    "sequenceNumber": "42",
    "timestamp": "2026-04-04T12:00:00.000000Z",
    "eventType": "policy.evaluated",
    "agentId": "a" * 64,
    "payload": {"decision": "allow", "tier": "T0_observe"},
    "previousHash": "0" * 64,
    "hash": "a" * 64,
}


class TestLedgerEvent:
    def test_parse(self) -> None:
        evt = LedgerEvent.model_validate(_LEDGER_EVENT)
        assert evt.event_id == "01905f7c-0000-7000-8000-000000000001"
        assert evt.sequence_number == "42"
        assert evt.event_type == "policy.evaluated"
        assert evt.payload["decision"] == "allow"

    def test_optional_token_id(self) -> None:
        evt = LedgerEvent.model_validate(_LEDGER_EVENT)
        assert evt.token_id is None

        with_token = {**_LEDGER_EVENT, "tokenId": "01905f7c-0000-7000-8000-000000000099"}
        evt2 = LedgerEvent.model_validate(with_token)
        assert evt2.token_id == "01905f7c-0000-7000-8000-000000000099"


# ---------------------------------------------------------------------------
# GatewayConfig
# ---------------------------------------------------------------------------


class TestGatewayConfig:
    def test_defaults(self) -> None:
        cfg = GatewayConfig(base_url="http://localhost:3000")
        assert cfg.timeout == 30.0
        assert cfg.token is None

    def test_with_token(self) -> None:
        cfg = GatewayConfig(base_url="http://localhost:3000", token="secret", timeout=10.0)
        assert cfg.token == "secret"
        assert cfg.timeout == 10.0

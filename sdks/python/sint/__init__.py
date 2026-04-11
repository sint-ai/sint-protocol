"""
SINT Protocol Python SDK.

Security enforcement layer for physical AI — Python client.
"""

from .types import (
    ApprovalTier,
    RiskTier,
    GatewayConfig,
    SintRequest,
    PolicyDecision,
    LedgerEvent,
)
from .client import GatewayClient
from .tokens import CapabilityTokenRequest, build_token_request
from .scanner import scan_tool, scan_server, ToolScanResult, ServerScanReport
from .crewai import (
    ApprovalResolution as CrewAIApprovalResolution,
    CrewAIGuardrailProviderCompat,
    GuardrailDecision,
)

__version__ = "0.1.0"

__all__ = [
    # types
    "ApprovalTier",
    "RiskTier",
    "GatewayConfig",
    "SintRequest",
    "PolicyDecision",
    "LedgerEvent",
    # client
    "GatewayClient",
    # tokens
    "CapabilityTokenRequest",
    "build_token_request",
    # scanner
    "scan_tool",
    "scan_server",
    "ToolScanResult",
    "ServerScanReport",
    # crewai adapter
    "CrewAIGuardrailProviderCompat",
    "GuardrailDecision",
    "CrewAIApprovalResolution",
]

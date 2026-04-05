"""
SINT Protocol — Capability Token request builder.

Actual Ed25519 signing is deferred to the gateway — this module constructs
the unsigned token request payload that the gateway validates and signs.

The signing flow matches the TypeScript issuer in
``packages/capability-tokens/src/issuer.ts``:

  1. Build a :class:`CapabilityTokenRequest` (this module).
  2. POST the request to the gateway via :meth:`GatewayClient.issue_token`.
  3. Gateway validates, signs with the root Ed25519 key, and returns the
     complete :data:`SintCapabilityToken`.

Usage::

    from datetime import datetime, timezone, timedelta
    from sint.tokens import build_token_request

    req = build_token_request(
        issuer="<issuer-ed25519-pubkey-hex>",
        subject="<agent-ed25519-pubkey-hex>",
        resource="mcp://filesystem/*",
        actions=["call"],
    )
    token_dict = req.to_dict()
    # → pass to GatewayClient.issue_token(token_dict)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any


@dataclass
class PhysicalConstraints:
    """Physical safety constraints embedded in a capability token.

    Mirrors ``SintPhysicalConstraints`` from
    ``packages/core/src/types/capability-token.ts``.
    """

    max_force_newtons: float | None = None
    max_velocity_mps: float | None = None
    max_repetitions: int | None = None
    requires_human_presence: bool | None = None
    rate_limit_max_calls: int | None = None
    rate_limit_window_ms: int | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {}
        if self.max_force_newtons is not None:
            out["maxForceNewtons"] = self.max_force_newtons
        if self.max_velocity_mps is not None:
            out["maxVelocityMps"] = self.max_velocity_mps
        if self.max_repetitions is not None:
            out["maxRepetitions"] = self.max_repetitions
        if self.requires_human_presence is not None:
            out["requiresHumanPresence"] = self.requires_human_presence
        if self.rate_limit_max_calls is not None and self.rate_limit_window_ms is not None:
            out["rateLimit"] = {
                "maxCalls": self.rate_limit_max_calls,
                "windowMs": self.rate_limit_window_ms,
            }
        return out


@dataclass
class DelegationChain:
    """Delegation chain tracking for a capability token.

    Mirrors ``SintDelegationChain`` from
    ``packages/core/src/types/capability-token.ts``.
    """

    parent_token_id: str | None = None
    depth: int = 0
    attenuated: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "parentTokenId": self.parent_token_id,
            "depth": self.depth,
            "attenuated": self.attenuated,
        }


@dataclass
class CapabilityTokenRequest:
    """Unsigned capability token request — submitted to the gateway for signing.

    Mirrors ``SintCapabilityTokenRequest`` from
    ``packages/core/src/types/capability-token.ts``.

    Do not sign this yourself — submit it via :meth:`GatewayClient.issue_token`.
    """

    issuer: str
    subject: str
    resource: str
    actions: list[str]
    expires_at: str  # ISO 8601 UTC
    revocable: bool = True
    constraints: PhysicalConstraints = field(default_factory=PhysicalConstraints)
    delegation_chain: DelegationChain = field(default_factory=DelegationChain)
    revocation_endpoint: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialise to camelCase dict matching the gateway's REST schema."""
        out: dict[str, Any] = {
            "issuer": self.issuer,
            "subject": self.subject,
            "resource": self.resource,
            "actions": self.actions,
            "expiresAt": self.expires_at,
            "revocable": self.revocable,
            "constraints": self.constraints.to_dict(),
            "delegationChain": self.delegation_chain.to_dict(),
        }
        if self.revocation_endpoint:
            out["revocationEndpoint"] = self.revocation_endpoint
        return out


def build_token_request(
    issuer: str,
    subject: str,
    resource: str,
    actions: list[str],
    expires_in_hours: float = 4.0,
    constraints: PhysicalConstraints | None = None,
    delegation_chain: DelegationChain | None = None,
    revocable: bool = True,
    revocation_endpoint: str | None = None,
) -> CapabilityTokenRequest:
    """Build a :class:`CapabilityTokenRequest` with a relative expiry.

    Parameters
    ----------
    issuer:
        Ed25519 public key (hex) of the token issuer / root authority.
    subject:
        Ed25519 public key (hex) of the agent receiving the token.
    resource:
        Resource URI the token covers, e.g. ``"mcp://filesystem/*"`` or
        ``"ros2:///cmd_vel"``.
    actions:
        Permitted actions on the resource, e.g. ``["call"]`` or
        ``["publish", "subscribe"]``.
    expires_in_hours:
        Number of hours from now until the token expires (default 4).
    constraints:
        Optional :class:`PhysicalConstraints` to embed (velocity cap, force
        limit, rate limit, etc.).
    delegation_chain:
        Optional :class:`DelegationChain` — defaults to root token (depth 0).
    revocable:
        Whether the gateway may revoke this token (default ``True``).
    revocation_endpoint:
        Optional URL the gateway will call on revocation.

    Returns
    -------
    CapabilityTokenRequest
        Ready to serialise via :meth:`CapabilityTokenRequest.to_dict` and
        POST to :meth:`GatewayClient.issue_token`.

    Examples
    --------
    ::

        req = build_token_request(
            issuer="a1b2c3...",
            subject="d4e5f6...",
            resource="ros2:///cmd_vel",
            actions=["publish"],
            expires_in_hours=8,
            constraints=PhysicalConstraints(max_velocity_mps=0.5),
        )
        token = await client.issue_token(req.to_dict())
    """
    now = datetime.now(tz=timezone.utc)
    expires_at = (now + timedelta(hours=expires_in_hours)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "000Z"

    return CapabilityTokenRequest(
        issuer=issuer,
        subject=subject,
        resource=resource,
        actions=list(actions),
        expires_at=expires_at,
        revocable=revocable,
        constraints=constraints or PhysicalConstraints(),
        delegation_chain=delegation_chain or DelegationChain(),
        revocation_endpoint=revocation_endpoint,
    )

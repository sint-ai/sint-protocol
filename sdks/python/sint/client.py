"""
SINT Protocol — GatewayClient.

Async HTTP client for the SINT Policy Gateway REST API.
Uses httpx for async I/O and supports context-manager usage.

Usage::

    async with GatewayClient(GatewayConfig(base_url="http://localhost:3000")) as client:
        decision = await client.intercept(request)
        print(decision.action)

All gateway requests are logged to the evidence ledger by the gateway itself —
this client is purely a transport layer.
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx

from .types import GatewayConfig, LedgerEvent, PolicyDecision, SintRequest


class GatewayError(Exception):
    """Raised when the gateway returns a non-2xx response."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(f"Gateway error {status_code}: {detail}")
        self.status_code = status_code
        self.detail = detail

    @property
    def retryable(self) -> bool:
        return self.status_code == 429 or self.status_code >= 500


class GatewayClient:
    """Async SINT Policy Gateway client.

    Parameters
    ----------
    config:
        A :class:`~sint.types.GatewayConfig` instance describing the gateway
        URL, optional auth token, and timeout.

    Examples
    --------
    ::

        config = GatewayConfig(base_url="http://localhost:3000", token="my-key")
        async with GatewayClient(config) as client:
            ok = await client.health()
            decision = await client.intercept(my_request)
    """

    def __init__(self, config: GatewayConfig) -> None:
        self._config = config
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if config.token:
            headers["Authorization"] = f"Bearer {config.token}"
        self._client = httpx.AsyncClient(
            base_url=config.base_url.rstrip("/"),
            headers=headers,
            timeout=config.timeout,
        )
        self._max_retries = max(0, config.max_retries)
        self._retry_backoff_ms = max(1, config.retry_backoff_ms)

    # ------------------------------------------------------------------
    # Context manager
    # ------------------------------------------------------------------

    async def __aenter__(self) -> "GatewayClient":
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        """Close the underlying HTTP client."""
        await self._client.aclose()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        attempts = self._max_retries + 1
        last_error: Exception | None = None
        for attempt in range(attempts):
            try:
                resp = await self._client.request(method, path, **kwargs)
                self._raise_for_status(resp)
                return resp.json()
            except GatewayError as err:
                last_error = err
                if not err.retryable or attempt >= attempts - 1:
                    raise
            except (httpx.TransportError, httpx.TimeoutException) as err:
                last_error = err
                if attempt >= attempts - 1:
                    raise
            await asyncio.sleep((self._retry_backoff_ms * (attempt + 1)) / 1000.0)
        raise last_error or RuntimeError("gateway request failed without explicit error")

    async def _get(self, path: str, **params: Any) -> Any:
        return await self._request("GET", path, params=params or None)

    async def _post(self, path: str, body: Any) -> Any:
        return await self._request("POST", path, json=body)

    @staticmethod
    def _raise_for_status(resp: httpx.Response) -> None:
        if resp.is_error:
            try:
                detail = resp.json().get("message", resp.text)
            except Exception:
                detail = resp.text
            raise GatewayError(resp.status_code, detail)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def health(self) -> dict[str, Any]:
        """GET /v1/health — liveness / readiness check."""
        return await self._get("/v1/health")  # type: ignore[return-value]

    async def intercept(self, request: SintRequest) -> PolicyDecision:
        """POST /v1/intercept — evaluate a single SINT request.

        Parameters
        ----------
        request:
            The :class:`~sint.types.SintRequest` to evaluate.

        Returns
        -------
        PolicyDecision
            The gateway's decision (allow / deny / escalate / transform).
        """
        payload = request.to_gateway_dict()
        data = await self._post("/v1/intercept", payload)
        return PolicyDecision.model_validate(data)

    async def intercept_batch(self, requests: list[SintRequest]) -> list[PolicyDecision]:
        """POST /v1/intercept/batch — evaluate multiple requests atomically.

        Returns a list of :class:`~sint.types.PolicyDecision` objects in the
        same order as the input requests.
        """
        payload = {"requests": [r.to_gateway_dict() for r in requests]}
        data = await self._post("/v1/intercept/batch", payload)
        results = data.get("results", [])
        decisions: list[PolicyDecision] = []
        for item in results:
            decision_data = item.get("decision")
            if decision_data:
                decisions.append(PolicyDecision.model_validate(decision_data))
        return decisions

    async def get_ledger_events(self, limit: int = 100) -> list[LedgerEvent]:
        """GET /v1/ledger — retrieve recent evidence ledger events.

        Parameters
        ----------
        limit:
            Maximum number of events to return (default 100).
        """
        data = await self._get("/v1/ledger", limit=limit)
        events_raw = data.get("events", data if isinstance(data, list) else [])
        return [LedgerEvent.model_validate(e) for e in events_raw]

    async def get_ledger_proof(self, event_id: str) -> dict[str, Any]:
        """GET /v1/ledger/{event_id}/proof — retrieve hash-chain proof for an event."""
        return await self._get(f"/v1/ledger/{event_id}/proof")  # type: ignore[return-value]

    async def issue_token(self, token_request: dict[str, Any]) -> dict[str, Any]:
        """POST /v1/tokens — request the gateway to issue a capability token.

        The gateway performs Ed25519 signing — the SDK constructs the request payload.
        See :func:`sint.tokens.build_token_request` to build the request body.
        """
        return await self._post("/v1/tokens", token_request)  # type: ignore[return-value]

    async def revoke_token(self, token_id: str, reason: str, by: str) -> dict[str, Any]:
        """POST /v1/tokens/revoke — revoke a previously issued capability token."""
        return await self._post("/v1/tokens/revoke", {"tokenId": token_id, "reason": reason, "by": by})  # type: ignore[return-value]

    async def get_pending_approvals(self) -> dict[str, Any]:
        """GET /v1/approvals/pending — list T2/T3 escalations awaiting human review."""
        return await self._get("/v1/approvals/pending")  # type: ignore[return-value]

    async def resolve_approval(
        self,
        request_id: str,
        status: str,
        by: str,
        reason: str | None = None,
    ) -> dict[str, Any]:
        """POST /v1/approvals/{request_id}/resolve — approve or deny an escalation.

        Parameters
        ----------
        request_id:
            UUID of the escalated request.
        status:
            ``"approved"`` or ``"denied"``.
        by:
            Operator identifier resolving the approval.
        reason:
            Optional free-text explanation.
        """
        body: dict[str, Any] = {"status": status, "by": by}
        if reason:
            body["reason"] = reason
        return await self._post(f"/v1/approvals/{request_id}/resolve", body)  # type: ignore[return-value]

    async def compliance_crosswalk(self) -> dict[str, Any]:
        """GET /v1/compliance/tier-crosswalk — approval-tier to regulatory-framework mapping."""
        return await self._get("/v1/compliance/tier-crosswalk")  # type: ignore[return-value]

    async def discovery(self) -> dict[str, Any]:
        """GET /.well-known/sint.json — gateway discovery document."""
        return await self._get("/.well-known/sint.json")  # type: ignore[return-value]

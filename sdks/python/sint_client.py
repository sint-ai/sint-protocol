"""Python SDK for SINT Gateway v0.2.

Dependency-light client using Python stdlib only.
"""

from __future__ import annotations

import json
import urllib.request
import urllib.error
from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass
class SintClient:
    base_url: str
    api_key: Optional[str] = None

    def _request(self, method: str, path: str, payload: Optional[Any] = None) -> Dict[str, Any]:
        url = f"{self.base_url.rstrip('/')}{path}"
        data = None
        headers = {"content-type": "application/json"}

        if self.api_key:
            headers["x-api-key"] = self.api_key

        if payload is not None:
            data = json.dumps(payload).encode("utf-8")

        req = urllib.request.Request(url=url, method=method, headers=headers, data=data)
        try:
            with urllib.request.urlopen(req) as res:  # nosec B310 - explicit endpoint control by caller
                body = res.read().decode("utf-8")
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8")
            message = body or f"HTTP {exc.code}"
            raise RuntimeError(f"SINT gateway request failed ({exc.code}): {message}") from exc

    def discovery(self) -> Dict[str, Any]:
        return self._request("GET", "/.well-known/sint.json")

    def openapi(self) -> Dict[str, Any]:
        return self._request("GET", "/v1/openapi.json")

    def health(self) -> Dict[str, Any]:
        return self._request("GET", "/v1/health")

    def issue_token(self, token_request: Dict[str, Any]) -> Dict[str, Any]:
        return self._request("POST", "/v1/tokens", token_request)

    def revoke_token(self, token_id: str, reason: str, by: str) -> Dict[str, Any]:
        return self._request(
            "POST",
            "/v1/tokens/revoke",
            {"tokenId": token_id, "reason": reason, "by": by},
        )

    def intercept(self, request: Dict[str, Any]) -> Dict[str, Any]:
        return self._request("POST", "/v1/intercept", request)

    def intercept_batch(self, requests: Any) -> Dict[str, Any]:
        return self._request("POST", "/v1/intercept/batch", requests)

    def approvals_pending(self) -> Dict[str, Any]:
        return self._request("GET", "/v1/approvals/pending")

    def approval(self, request_id: str) -> Dict[str, Any]:
        return self._request("GET", f"/v1/approvals/{request_id}")

    def resolve_approval(self, request_id: str, status: str, by: str, reason: Optional[str] = None) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"status": status, "by": by}
        if reason:
            payload["reason"] = reason
        return self._request("POST", f"/v1/approvals/{request_id}/resolve", payload)

    def ledger(self, limit: int = 100) -> Dict[str, Any]:
        return self._request("GET", f"/v1/ledger?limit={limit}")

    def ledger_proof(self, event_id: str) -> Dict[str, Any]:
        return self._request("GET", f"/v1/ledger/{event_id}/proof")

    def compliance_crosswalk(self) -> Dict[str, Any]:
        return self._request("GET", "/v1/compliance/tier-crosswalk")

    def economy_route(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self._request("POST", "/v1/economy/route", payload)

    def approvals_ws_url(self) -> str:
        return f"{self.base_url.rstrip('/').replace('http://', 'ws://').replace('https://', 'wss://')}/v1/approvals/ws"

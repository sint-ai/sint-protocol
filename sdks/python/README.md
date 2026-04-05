# SINT Python SDK

## Usage

```python
from sint_client import SintClient

client = SintClient(base_url="http://localhost:3100", api_key="dev-local-key")

print(client.discovery())
print(client.health())
print(client.openapi())
print(client.compliance_crosswalk())
```

## Surface

- discovery: `/.well-known/sint.json`
- openapi: `/v1/openapi.json`
- health: `/v1/health`
- token issue/revoke
- request intercept (single/batch)
- approvals list/get/resolve
- approvals websocket URL helper
- ledger query
- ledger proof
- economy route helper

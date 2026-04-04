# SINT Python SDK (Minimal)

## Usage

```python
from sint_client import SintClient

client = SintClient(base_url="http://localhost:3100", api_key="dev-local-key")

print(client.discovery())
print(client.health())
```

## Surface

- discovery: `/.well-known/sint.json`
- health: `/v1/health`
- token issue/revoke
- request intercept (single/batch)
- approvals list/resolve
- ledger query

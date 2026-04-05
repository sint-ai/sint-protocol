# WebSocket Approval Transport (Issue #2)

SINT now supports approval queue streaming over WebSocket in addition to SSE.

## Endpoints

- SSE: `GET /v1/approvals/events`
- WebSocket: `ws://<host>/v1/approvals/ws`

## Authentication

If `SINT_API_KEY` is configured, provide:

- `x-api-key` header (recommended), or
- `?apiKey=<key>` query parameter when `SINT_WS_ALLOW_QUERY_API_KEY=true`

For production, set:

```bash
SINT_WS_ALLOW_QUERY_API_KEY=false
```

to prevent URL/query credential leakage in logs and intermediaries.

## Event model

- Initial `snapshot` payload with current pending requests
- Optional replay stream on reconnect using:
  - `?cursor=<sequence>` or
  - `?since=<iso8601>`
- Replay batch markers: `replay.start` and `replay.complete`
- Incremental queue events (`queued`, `resolved`, `timeout`)
- Typed policy events from intercept path: `APPROVAL_REQUIRED`, `DECISION`
- Periodic `heartbeat` event every 30s

## Why use WebSocket

- Lower latency for high-frequency operator workflows
- Bi-directional transport compatibility for future interactive controls
- Better fit for control-room and NOC dashboard integrations

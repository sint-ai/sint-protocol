# WebSocket Approval Transport (Issue #2)

SINT now supports approval queue streaming over WebSocket in addition to SSE.

## Endpoints

- SSE: `GET /v1/approvals/events`
- WebSocket: `ws://<host>/v1/approvals/ws`

## Authentication

If `SINT_API_KEY` is configured, provide either:

- `x-api-key` header, or
- `?apiKey=<key>` query parameter

## Event model

- Initial `snapshot` payload with current pending requests
- Incremental queue events (`queued`, `resolved`, `timeout`)
- Periodic `heartbeat` event every 30s

## Why use WebSocket

- Lower latency for high-frequency operator workflows
- Bi-directional transport compatibility for future interactive controls
- Better fit for control-room and NOC dashboard integrations


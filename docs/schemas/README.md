# SINT Message Schemas

JSON Schema (draft 2020-12) definitions for message types that cross process or transport boundaries in the SINT stack. These are intended for validation at client integration points and for SDK generation.

## Index

| File | Emitted on | Defines |
|---|---|---|
| [`heartbeat.schema.json`](./heartbeat.schema.json) | Approvals WebSocket (`/v1/approvals/ws`) | Server-originated 30-second keepalive. |
| [`approval-request.schema.json`](./approval-request.schema.json) | Approvals WebSocket, approvals SSE | `APPROVAL_REQUIRED` event when a T2/T3 request is escalated for human review. |
| [`delegation-request.schema.json`](./delegation-request.schema.json) | `POST /v1/tokens/delegate` | Body for delegating a capability token with strictly narrower authority. |
| [`task-report.schema.json`](./task-report.schema.json) | Evidence Ledger (`GET /v1/ledger`) | Ledger event reporting the outcome of an agent action (`action.started` / `action.completed` / `action.failed` / `action.rolledback`). |

## Using the schemas

### Validate a message programmatically (Node, via ajv)

```ts
import Ajv from "ajv";
import addFormats from "ajv-formats";
import heartbeatSchema from "./heartbeat.schema.json" assert { type: "json" };

const ajv = new Ajv({ strict: false });
addFormats(ajv);
const validate = ajv.compile(heartbeatSchema);

const message = { type: "heartbeat", ts: new Date().toISOString() };
if (!validate(message)) {
  console.error(validate.errors);
}
```

### Generate client types

```bash
# TypeScript types
npx json-schema-to-typescript docs/schemas/approval-request.schema.json

# Python types (datamodel-code-generator)
datamodel-codegen --input docs/schemas/delegation-request.schema.json --output delegation.py
```

## Source of truth

These schemas are derived from (and should stay in sync with):

- `packages/core/src/types/evidence.ts` — `SintLedgerEvent`, `SintEventType`
- `packages/core/src/schemas/capability-token.schema.ts` — `capabilityTokenRequestSchema`, `delegationChainSchema`
- `apps/gateway-server/src/ws/ws-approval-stream.ts` — `ApprovalRequiredEvent`, `DecisionEvent`

When the Zod schemas or TypeScript interfaces change, these JSON Schemas need a corresponding update. A future CI step could diff-check them automatically.

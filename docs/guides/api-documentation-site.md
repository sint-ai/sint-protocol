# SINT API Documentation Site

SINT Gateway now serves a built-in API documentation surface from the live OpenAPI schema.

## Endpoints

- Landing page: `GET /v1/docs`
- Interactive docs (Redoc): `GET /v1/docs/redoc`
- Raw schema: `GET /v1/openapi.json`

## Local Usage

Start gateway:

```bash
pnpm --filter @sint/gateway-server dev
```

Open docs:

- http://localhost:3100/v1/docs
- http://localhost:3100/v1/docs/redoc

## Notes

- The docs are generated from the same OpenAPI route used by tooling.
- Protected endpoints still require auth (`X-API-Key`) when called from clients.
- Keep OpenAPI paths in `apps/gateway-server/src/routes/discovery.ts` aligned with route changes.

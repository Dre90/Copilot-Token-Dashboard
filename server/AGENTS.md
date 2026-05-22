# AGENTS.md (server)

This file applies to everything under `server/`.

## Stack

- Runtime: Node 26
- Rammeverk: Fastify
- Lagring: SQLite (`node:sqlite`)
- Telemetri-inngang: OTLP/HTTP (`/v1/traces`, `/v1/metrics`, `/v1/logs`)

## Key Files

- `src/index.ts`: starts OTLP and API servers
- `src/routes/otlp.ts`: OTLP routes and parsing/deserialization
- `src/routes/api.ts`: general API routes + SSE
- `src/routes/copilot.ts`: copilot-specific routes and cost/time logic
- `src/core/db.ts`: schema and prepared statements
- `src/core/sse.ts`: SSE client management/broadcast

## Commands

- Dev: `npm run dev`
- Typecheck: `npm run typecheck`
- Test: `npm run test`
- Lint: `npm run lint`
- Lint fix: `npm run lint:fix`
- Format check: `npm run format:check`
- Format write: `npm run format`

## Change Rules

- Keep routes thin; move logic to pure functions where possible.
- For new query params: add validation and tests.
- For changes in time windows/cost calculations: update or add unit tests.
- Do not break existing API response JSON formats without coordination.

## Required Checks for PR (server)

Run these in `server/` for backend changes:

1. `npm run format:check`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test`
5. `npm run build` when runtime/tsconfig/entrypoints are changed

## Observability And API Rules (server)

- Preserve backward compatibility for field names in `/api/copilot/*` unless a breaking change is explicitly agreed.
- Changes in cost models or token mapping must include corresponding test updates in `src/routes/copilot.test.ts`.
- Changes in OTLP parsing (`src/routes/otlp.ts`) must not reduce robustness for missing/unknown attributes.
- New API fields should be additive where possible.

## Testing

- Bruk Vitest for enhetstester (`src/**/*.test.ts`).
- Prioriter tester for:
  - time interval parsing
  - bucket/aggregation
  - token/cost calculation
  - robustness for missing or invalid attributes

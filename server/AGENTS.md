# AGENTS.md (server)

Denne filen gjelder for alt under `server/`.

## Stack

- Runtime: Node 26
- Rammeverk: Fastify
- Lagring: SQLite (`node:sqlite`)
- Telemetri-inngang: OTLP/HTTP (`/v1/traces`, `/v1/metrics`, `/v1/logs`)

## Viktige filer

- `src/index.ts`: starter OTLP- og API-server
- `src/otlp.ts`: parsing/deserialisering av OTLP
- `src/db.ts`: schema og prepared statements
- `src/api.ts`: generelle API-ruter + SSE
- `src/copilot.ts`: copilot-spesifikke ruter og kost/tidslogikk

## Kommandoer

- Dev: `npm run dev`
- Typecheck: `npm run typecheck`
- Test: `npm run test`
- Lint: `npm run lint`
- Lint fix: `npm run lint:fix`
- Format check: `npm run format:check`
- Format write: `npm run format`

## Endringsregler

- Hold ruter tynne; flytt logikk til rene funksjoner der det er mulig.
- Ved nye query-parametre: legg til validering og tester.
- Ved endring i tidsvindu/kostberegning: oppdater eller legg til enhetstester.
- Ikke bryt eksisterende JSON-format pa API-responser uten koordinering.

## Required Checks for PR (server)

Kjor disse i `server/` for server-endringer:

1. `npm run format:check`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test`
5. `npm run build` ved endring i runtime/tsconfig/entrypoints

## Observability og API-regler (server)

- Behold bakoverkompatibilitet for feltnavn i `/api/copilot/*` med mindre breaking change er avtalt.
- Endring i kostmodeller eller token-mapping skal ledsages av testoppdatering i `src/copilot.test.ts`.
- Endring i OTLP parsing (`src/otlp.ts`) skal ikke redusere robusthet for manglende/ukjente attributes.
- Nye API-felt skal vaere additive der mulig.

## Testing

- Bruk Vitest for enhetstester (`src/**/*.test.ts`).
- Prioriter tester for:
  - tidsintervall parsing
  - bucket/aggregering
  - token/kost-kalkulasjon
  - robusthet ved manglende eller ugyldige attributes

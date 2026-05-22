# AGENTS.md (web)

Denne filen gjelder for alt under `web/`.

## Stack

- Vite + React 19 + TypeScript
- Tailwind CSS v4
- Recharts for visualisering

## Viktige filer

- `src/App.tsx`: toppnavigasjon mellom visninger
- `src/components/CopilotDashboard.tsx`: live dashboard
- `src/components/CopilotHistory.tsx`: historikk, trender og innsikt
- `src/api/copilot.ts`: copilot API-klient
- `src/api/client.ts`: generell API/SSE-klient
- `src/lib/copilotInsights.ts`: ren innsiktslogikk

## Kommandoer

- Dev: `npm run dev`
- Typecheck: `npm run typecheck`
- Test: `npm run test`
- Lint: `npm run lint`
- Lint fix: `npm run lint:fix`
- Format check: `npm run format:check`
- Format write: `npm run format`

## UI/UX-regler

- Bevar norsk labels/tekster der de allerede brukes.
- Ikke flytt på hovednavigasjon uten klar grunn.
- Store nye seksjoner skal holdes bak tydelige view-tabs/valg.
- Behold god lesbarhet pa mobile bredder.

## Endringsregler

- Flytt beregningslogikk ut av komponenter nar den blir kompleks.
- Hold API-kall i `src/api/*`, ikke direkte i mange komponenter.
- Ved nye filtre eller visninger: legg til tester for hjelpefunksjoner/URL-bygging.

## Required Checks for PR (web)

Kjor disse i `web/` for frontend-endringer:

1. `npm run format:check`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test`
5. `npm run build` ved endring i Vite-konfig, imports eller produksjonsbygg

## UI og API-kompatibilitet (web)

- Bevar eksisterende faner/filtre og brukerflyt med mindre oppgaven eksplisitt krever redesign.
- Nye datavisninger skal ha tydelig plassering (egen view-tab eller klart seksjonsnavn).
- Endring i API-kall eller query-parametre skal oppdateres samlet i `src/api/*` og testes.
- Ved endring i innsiktsberegninger skal `src/lib/copilotInsights.test.ts` oppdateres.

## Testing

- Bruk Vitest for enhetstester (`src/**/*.test.ts`).
- Prioriter tester for:
  - URL/query-bygging i API-klienter
  - stream-hendelser (EventSource)
  - innsiktsberegninger (median, terskler, prognose)

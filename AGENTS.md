# AGENTS.md

Retningslinjer for AI-agenter i dette repoet. Denne filen gjelder hele prosjektet.

## Prosjektoversikt

- Monorepo med to apper: `server` (Fastify + SQLite + OTLP) og `web` (Vite + React + Tailwind).
- OTLP mottas pa port 4318, API/SSE server pa 4319, frontend pa 5173.

## Foretrukket arbeidsflyt

1. Les relevant kode for området som skal endres.
2. Gjør minst mulig endring som løser oppgaven.
3. Kjør verifikasjon lokalt for berorte deler.
4. Oppdater dokumentasjon ved behov.

## Kommandoer (repo-rot)

- Install: `mise run install`
- Dev: `mise run dev`
- Typecheck: `mise run typecheck`
- Test: `mise run test`
- Lint: `mise run lint`
- Format check: `mise run format:check`
- Format write: `mise run format`
- Build: `mise run build`

## Kvalitetskrav for endringer

- Nye features skal ha tester nar det er fornuftig.
- Kjør minst `mise run lint` og relevante tester for kode som er endret.
- Ikke introduser store refactors uten eksplisitt behov.
- Behold eksisterende API-kontrakter med mindre endring er avtalt.

## Required Checks for PR

Kjor disse fra repo-rot for alle kodeendringer:

1. `mise run format:check`
2. `mise run lint`
3. `mise run typecheck`
4. `mise run test`
5. `mise run build` nar bygg/konfig er berort

Hvis en check feiler, skal PR ikke anses klar.

## Branch og Commit-konvensjoner

- Branch-navn: `feat/<kort-beskrivelse>`, `fix/<kort-beskrivelse>`, `chore/<kort-beskrivelse>`.
- Commit-format: Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`).
- Hold commits sma og fokuserte, unnga blanding av mekaniske formateringer og feature-endringer i samme commit.

## Observability og API-kompatibilitet

- Endringer i OTLP-parsing eller attributtnokler skal vurderes opp mot eksisterende dashboards og tester.
- Endringer i responsskjema for `/api/*` krever samtidig oppdatering av klientkode i `web/src/api` og relevante tester.
- Unnga breaking changes i eksisterende endepunkter uten eksplisitt avtale og dokumentasjon i README.

## Stil og konvensjoner

- TypeScript strict mode er standard.
- Hold funksjoner sma og testbare.
- Foretrekk rene hjelpefunksjoner for forretningslogikk.
- Bruk `oxlint` for lint og `oxfmt` for formattering.

## Forbudt uten eksplisitt avtale

- Destruktive git-kommandoer som hard reset.
- Endre database-skjema uten a oppdatere alle berorte lag.
- Endre porter/endepunkter uten a oppdatere README og klientkode.

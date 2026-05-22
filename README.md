# Copilot OTel Monitoring

Lokal dashboard for OTel-data fra VS Code GitHub Copilot Chat. Tar imot OTLP/HTTP på `:4318`, lagrer i SQLite, viser live og historiske data (time/dag/måned/år) i en React-app.

## Forutsetninger

- [mise](https://mise.jdx.dev/) installert
- VS Code med GitHub Copilot Chat og `github.copilot.chat.otel.enabled: true`

## Kom i gang

```bash
mise install           # henter Node 26
mise run install       # installerer deps i server/ og web/
mise run dev           # starter server (:4318 + :4319) og web (:5173) parallelt
```

Åpne http://localhost:5173.

## Skru på OTel i VS Code

I `settings.json`:

```json
{
  "github.copilot.chat.otel.enabled": true
}
```

Default endpoint er `http://localhost:4318` — det treffer denne mottakeren direkte. Restart VS Code-vinduet etter endring.

## Struktur

```
mise.toml             # Node-versjon + tasks
server/               # Fastify OTLP-mottaker + REST + SSE → SQLite
  src/index.ts        # bootstrap (to lyttere: 4318 OTLP, 4319 API)
  src/otlp.ts         # /v1/traces, /v1/metrics, /v1/logs (proto + json)
  src/db.ts           # SQLite-skjema + prepared statements
  src/api.ts          # REST + SSE
  src/sse.ts          # broadcaster
web/                  # Vite + React 19 + TS + Tailwind v4
  src/App.tsx
  src/components/LiveDashboard.tsx
  src/components/Historical.tsx     # hour/day/month/year via Recharts
  src/components/TraceTable.tsx
  src/api/client.ts
```

## Tasks

- `mise run dev:server` — kun backend
- `mise run dev:web` — kun frontend
- `mise run build` — bygg begge
- `mise run typecheck` — typesjekk begge
- `mise run clean` — slett SQLite-fil

## Lokale Git hooks (anbefalt)

Sett opp lokale hooks (engangs):

```bash
mise run hooks:install
```

Dette aktiverer versjonerte hooks fra `.githooks/`:

- `pre-commit`: kjører `mise run format:check` og `mise run lint`
- `pre-push`: kjører `mise run typecheck` og `mise run test`

## Endpoints

- OTLP-mottaker: `POST http://localhost:4318/v1/{traces,metrics,logs}`
- API:
  - `GET /api/health`
  - `GET /api/summary` — siste 5 min
  - `GET /api/metrics/list`
  - `GET /api/metrics?name=<>&bucket=hour|day|month|year&from=&to=`
  - `GET /api/traces?limit=&from=&to=`
  - `GET /api/traces/:traceId`
  - `GET /api/events?limit=`
  - `GET /api/stream` (SSE: `span` / `metric` / `event`)

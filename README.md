# Copilot OTel Monitoring

Local dashboard for OTel data from VS Code GitHub Copilot Chat. It receives OTLP/HTTP on `:4318`, stores data in SQLite, and shows live and historical views (hour/day/month/year) in a React app.

## Prerequisites

- [mise](https://mise.jdx.dev/) installed
- VS Code with GitHub Copilot Chat and `github.copilot.chat.otel.enabled: true`

## First-Time Local Setup

```bash
git clone https://github.com/Dre90/Copilot-Token-Dashboard.git
cd Copilot-Token-Dashboard
mise trust
mise install
mise run install
mise run hooks:install   # recommended, one-time
```

## Start The App

```bash
mise run dev           # starts server (:4318 + :4319) and web (:5173) in parallel
```

Open http://localhost:5173.

To verify the backend is running, open http://localhost:4319/api/health.

## Enable OTel In VS Code

In `settings.json`:

```json
{
  "github.copilot.chat.otel.enabled": true
}
```

The default endpoint is `http://localhost:4318`, which targets this receiver directly. Restart the VS Code window after changing this setting.

## Structure

```
mise.toml             # Node version + tasks
server/               # Fastify OTLP receiver + REST + SSE -> SQLite
  src/index.ts        # bootstrap (two listeners: 4318 OTLP, 4319 API)
  src/routes/         # API and OTLP routes
  src/core/           # DB and SSE core
web/                  # Vite + React 19 + TS + Tailwind v4
  src/App.tsx
  src/features/       # feature modules (copilot, telemetry)
  src/shared/         # shared UI components
  src/api/            # API clients
```

## Tasks

- `mise run dev:server` — backend only
- `mise run dev:web` — frontend only
- `mise run build` — build both
- `mise run typecheck` — typecheck both
- `mise run lint` — lint both
- `mise run test` — test both
- `mise run clean` — remove SQLite file

## Local Git Hooks (Recommended)

Set up local hooks (one-time):

```bash
mise run hooks:install
```

This enables versioned hooks from `.githooks/`:

- `pre-commit`: runs `mise run format:check` and `mise run lint`
- `pre-push`: runs `mise run typecheck` and `mise run test`

## Endpoints

- OTLP receiver: `POST http://localhost:4318/v1/{traces,metrics,logs}`
- API:
  - `GET /api/health`
  - `GET /api/summary` — last 5 minutes
  - `GET /api/metrics/list`
  - `GET /api/metrics?name=<>&bucket=hour|day|month|year&from=&to=`
  - `GET /api/traces?limit=&from=&to=`
  - `GET /api/traces/:traceId`
  - `GET /api/events?limit=`
  - `GET /api/stream` (SSE: `span` / `metric` / `event`)

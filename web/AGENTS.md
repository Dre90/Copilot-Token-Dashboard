# AGENTS.md (web)

This file applies to everything under `web/`.

## Stack

- Vite + React 19 + TypeScript
- Tailwind CSS v4
- Recharts for visualisering

## Key Files

- `src/App.tsx`: top-level navigation between views
- `src/features/copilot/components/CopilotDashboard.tsx`: live dashboard
- `src/features/copilot/components/CopilotHistory.tsx`: history, trends, and insights
- `src/api/copilot.ts`: copilot API client
- `src/api/client.ts`: generic API/SSE client
- `src/features/copilot/lib/copilotInsights.ts`: pure insights logic
- `src/shared/components/`: shared UI components

## Commands

- Dev: `npm run dev`
- Typecheck: `npm run typecheck`
- Test: `npm run test`
- Lint: `npm run lint`
- Lint fix: `npm run lint:fix`
- Format check: `npm run format:check`
- Format write: `npm run format`

## UI/UX-regler

- Preserve existing English labels/copy and tone in the UI.
- Do not move main navigation without a clear reason.
- Keep large new sections behind clear view tabs/selections.
- Maintain good readability on mobile widths.

## Change Rules

- Move calculation logic out of components when it becomes complex.
- Keep API calls in `src/api/*`, not spread directly across many components.
- For new filters/views: add tests for helper functions and URL building.

## Required Checks for PR (web)

Run these in `web/` for frontend changes:

1. `npm run format:check`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test`
5. `npm run build` when Vite config, imports, or production build setup changes

## UI And API Compatibility (web)

- Preserve existing tabs/filters and user flow unless the task explicitly requires redesign.
- New data views should have clear placement (dedicated view tab or clearly named section).
- Changes in API calls or query params should be centralized in `src/api/*` and tested.
- When insights calculations change, update `src/features/copilot/lib/copilotInsights.test.ts`.

## Testing

- Use Vitest for unit tests (`src/**/*.test.ts`).
- Prioritize tests for:
  - URL/query building in API clients
  - stream events (EventSource)
  - insights calculations (median, thresholds, forecast)

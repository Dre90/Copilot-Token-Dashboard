# AGENTS.md

Guidelines for AI agents in this repository. This file applies to the whole project.

## Project Overview

- Monorepo with two apps: `server` (Fastify + SQLite + OTLP) and `web` (Vite + React + Tailwind).
- OTLP is received on port 4318, API/SSE server on 4319, frontend on 5173.

## Preferred Workflow

1. Read relevant code for the area being changed.
2. Make the smallest change that solves the task.
3. Run local verification for affected parts.
4. Update documentation when needed.

## Commands (Repo Root)

- Install: `mise run install`
- Dev: `mise run dev`
- Typecheck: `mise run typecheck`
- Test: `mise run test`
- Lint: `mise run lint`
- Format check: `mise run format:check`
- Format write: `mise run format`
- Build: `mise run build`

## Quality Requirements For Changes

- New features should include tests when reasonable.
- Run at least `mise run lint` and relevant tests for changed code.
- Do not introduce large refactors without explicit need.
- Keep existing API contracts unless a change is agreed.

## Required Checks for PR

Run these from repo root for all code changes:

1. `mise run format:check`
2. `mise run lint`
3. `mise run typecheck`
4. `mise run test`
5. `mise run build` when build/config is affected

If any check fails, the PR should not be considered ready.

## Branch And Commit Conventions

- Branch names: `feat/<short-description>`, `fix/<short-description>`, `chore/<short-description>`.
- Commit-format: Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`).
- Keep commits small and focused; avoid mixing mechanical formatting with feature changes in the same commit.

## Observability And API Compatibility

- Changes in OTLP parsing or attribute keys must be evaluated against existing dashboards and tests.
- Changes to response schemas for `/api/*` require corresponding updates in `web/src/api` and relevant tests.
- Avoid breaking changes in existing endpoints without explicit agreement and README documentation.

## Style And Conventions

- TypeScript strict mode is the default.
- Keep functions small and testable.
- Prefer pure helper functions for business logic.
- Use `oxlint` for linting and `oxfmt` for formatting.

## Forbidden Without Explicit Agreement

- Destructive git commands such as hard reset.
- Changing database schema without updating all affected layers.
- Changing ports/endpoints without updating README and client code.

# NEXUS-7 E2E Acceptance

## Commands

- Install Chromium once: `corepack pnpm e2e:install`
- Run browser E2E: `corepack pnpm e2e`
- Full local gate:
  - `corepack pnpm lint`
  - `corepack pnpm typecheck`
  - `corepack pnpm test`
  - `corepack pnpm evals`
  - `corepack pnpm utf8:guard`
  - `corepack pnpm smoke`
  - `corepack pnpm e2e`
  - `corepack pnpm build`

## Automated Flow

The Playwright suite starts an isolated API server on `127.0.0.1:3751` and a Vite desktop surface on `127.0.0.1:5178`.

Test data is written only to `.tmp/e2e`:

- SQLite: `.tmp/e2e/nexus-e2e.db`
- Vault: `.tmp/e2e/NEXUS-7`

The suite verifies:

- desktop text renders without mojibake;
- morning planning creates visible task cards;
- task start, evidence validation, completion, and companion feedback work in the UI;
- event stream exposes `task_status_changed`;
- daily review appears in the review panel;
- Obsidian Markdown files are generated.

## Current Boundaries

- Uses deterministic offline LLM by setting `NEXUS_LLM_PROVIDER=deterministic` and clearing Anthropic credentials.
- Does not test real Claude prompt quality.
- Does not initialize the formal Tauri Rust runtime.
- Does not introduce Drizzle migrations.

# NEXUS-7 Project Guide

## Project Positioning

NEXUS-7 is a personal life optimization system driven by an AI core. It is not a todo app with AI added on; tasks are the peripheral nervous system of a larger loop: goal, action, feedback, calibration.

Current product question:

> Did today's behavior move the host closer to the ideal life, or further away?

## Current Phase

Phase 1 · Awakening.

Current sprint goal: make the core loop stable and verifiable:

host input -> Orchestrator -> Agent -> tool layer -> local SQLite event stream -> desktop feedback -> Obsidian Markdown copy.

## Code Organization

- `apps/server`: NestJS API and orchestration entrypoint.
- `apps/desktop`: Vue desktop surface, currently served through Vite until Rust/Tauri is installed.
- `packages/shared`: shared domain types and Agent output contracts.
- `packages/ai-core`: LLM abstraction, model routing, Agent orchestration, structured output parsing.
- `packages/memory`: local SQLite repository using Node 22 `node:sqlite`.
- `packages/companion`: companion state mapping.
- `prompts`: versioned Agent prompt drafts.
- `evals`: lightweight offline evaluation cases.
- `scripts`: project checks and smoke/eval runners.

## Commands

- Install: `corepack pnpm install`
- API dev server: `corepack pnpm dev:server`
- Desktop dev server: `corepack pnpm dev:desktop`
- Lint: `corepack pnpm lint`
- Typecheck: `corepack pnpm typecheck`
- Tests: `corepack pnpm test`
- Build: `corepack pnpm build`
- Eval runner: `corepack pnpm evals`
- End-to-end smoke test: `corepack pnpm smoke`
- UTF-8 guard: `corepack pnpm utf8:guard`

## Engineering Rules

- TypeScript strict mode stays on.
- All Agent data access goes through `NexusTools`; Agents do not read or write storage directly.
- All LLM calls go through `LlmClient` and `ModelRouter`.
- All Agent outputs that affect storage must be parsed and validated as structured JSON first.
- Store raw LLM content in event `rawPayload`; store validated structured output in event `structured`.
- Keep Phase 1 focused on the core loop. Do not add multi-source ingestion, full Tauri runtime, mobile, or 3D companion work yet.
- Use UTF-8 for all Markdown, source strings, prompts, and Obsidian output.
- In Windows PowerShell, prefer `Get-Content -Encoding UTF8` when reading Chinese source or Markdown.
- Do not edit generated `dist`, local SQLite files, `.tmp`, or generated `NEXUS-7` Vault output by hand.

## Current Defaults

- Local storage: Node 22 built-in `node:sqlite`.
- No API key: deterministic offline LLM.
- API key present: Anthropic client through the same abstraction.
- Generated local data and Vault folders are ignored by git.

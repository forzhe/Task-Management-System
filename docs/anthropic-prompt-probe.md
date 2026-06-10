# Anthropic Prompt Probe

`corepack pnpm ai:probe` is a manual online check for real Claude calls. It is not part of the default local gate because it needs an API key and spends tokens.

## Setup

PowerShell:

```powershell
$env:ANTHROPIC_BASE_URL="https://ccapi.scydao.com"
$env:ANTHROPIC_AUTH_TOKEN="<rotated-token>"
$env:CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="1"
corepack pnpm ai:probe
```

cmd:

```cmd
set ANTHROPIC_BASE_URL=https://ccapi.scydao.com
set ANTHROPIC_AUTH_TOKEN=<rotated-token>
set CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
corepack pnpm ai:probe
```

Official Anthropic credentials still work through `ANTHROPIC_API_KEY`. If both
`ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_API_KEY` are set, the auth token is used
for the request. Do not store real tokens in repository files or generated Vault
Markdown.

If a token has been pasted into chat, logs, screenshots, or issue text, rotate it
at the gateway before using it for longer-running tests.

Optional model overrides:

```powershell
$env:ANTHROPIC_MODEL_HAIKU="claude-3-5-haiku-latest"
$env:ANTHROPIC_MODEL_SONNET="claude-sonnet-4-5"
$env:ANTHROPIC_MODEL_OPUS="claude-opus-4-1"
```

## Probe Data

The probe writes only to `.tmp/anthropic-probe`:

- SQLite: `.tmp/anthropic-probe/nexus-anthropic-probe.db`
- Vault: `.tmp/anthropic-probe/NEXUS-7`

## Pass Criteria

- `/health` resolves `llmProvider` to `anthropic`.
- Planning creates 1-3 tasks.
- Task completion records evidence.
- Review saves a structured daily review.
- Companion state remains valid.
- Event `rawPayload` includes model, prompt version, usage, stop reason, and latency metadata.
- Vault Markdown is generated for tasks, review, and event stream.

## Current Boundaries

- This validates structured output stability, not final prompt aesthetics.
- It does not run in CI or offline gates.
- It does not initialize Tauri, Drizzle migrations, or Live2D.

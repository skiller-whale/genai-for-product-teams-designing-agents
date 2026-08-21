# Agent Workbench

A sandbox for the Skiller Whale **Designing Agents** session. Learners build
Finn — the customer-support agent of the fictional Barnacle & Fluke
Whale-Watching Company — up from a blank slate, working through **modes**
(Investigation → Tools → System prompt → Rules → Skills → Cost) that each
unlock more of the design pane and bring their own block of **eval cases**.
Every change is measured: deterministic checks, an LLM judge, tone scores,
and live token/cost readouts.

> ⚠️ This directory is automatically published to a public GitHub repository.
> Make changes here (in the curriculum repo), not in the mirror.

## How it runs in a session

The hosted environment builds and starts the app with
`docker compose up --build --wait` (see the module's `exercise_config.yaml`)
and learners open <http://localhost:1001>. The LLM is reached through the
Skiller Whale Bedrock proxy: `bedrock_proxy: {}` in the exercise config plus
`SW_ATTENDANCE_ID` as the AWS access key — no real API keys anywhere.

## Local development

```sh
bun install
cp .env.example .env    # set AI_PROVIDER + ANTHROPIC_API_KEY for real answers
bun run dev             # Vite on :8000, API on :8001
```

Providers (`AI_PROVIDER`): `claude` (dev default, needs `ANTHROPIC_API_KEY`),
`bedrock` (hosted environment), `ollama` (offline smoke tests; small local
models handle tool calls shakily).

Production build (what the Dockerfile does): `bun run build && bun run start`
— one Hono server serving the built frontend and `/api` on port 3000.

## Tests

```sh
bun test                # unit tests (no LLM, mocked provider)
bunx playwright test    # e2e tests (mock every /api route)
```

## Where things live

- `src/server/agent/` — the tool-use loop, system-prompt assembly, tool registry
- `src/server/scenario/` — the Barnacle & Fluke knowledge base, bookings, canned web results
- `src/server/evals/` — eval cases, deterministic assertions, LLM judge, runner
- `src/server/config/` — learner config + run history persistence (JSON in `DATA_DIR`)
- `src/client/` — the React workbench UI
- `src/shared/` — types and pricing shared by both sides

## Calibration note

The eval blocks are written for the hosted model (`BEDROCK_MODEL_ID`,
currently Claude Sonnet 4.5): the Investigation preset should pass most of its
block, the blank slate should fail most of the tools block until tools are
enabled, tone scores should clear `TONE_PASS_THRESHOLD` with a decent prompt,
and `COST_BLOCK_BUDGET_USD` should be beatable by a lean agent. A different
model — including Ollama stand-ins — will shift all of these.

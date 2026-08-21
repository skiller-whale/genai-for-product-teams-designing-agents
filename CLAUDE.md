# Agent Workbench — notes for AI assistants

Read `README.md` first for the what and why. This file adds constraints that
matter when editing.

## Invariants — do not break these

- **The eval figures and the scenario data are coupled.** Eval cases assert
  exact numbers (£63, £54, £51, £57, £60, £84, £540, £135, £34) that are
  derived from `src/server/scenario/kb/*.md` + `bookings.json` + the simulated
  date (Tuesday 14 July 2026). `tests/unit/fixtures.test.ts` pins these — run
  `bun test tests/unit` after touching any scenario data, eval case, or policy
  number.
- **The simulated date never moves.** Refund-notice arithmetic and Festival
  Week logic all hang off it. The server appends the date line to every system
  prompt (`buildSystemPrompt`); learners cannot edit it out.
- **Rules vs skills must stay honest.** Rules are appended to the system
  prompt on every request; skills contribute only name + description until the
  agent calls `load_skill`. The session's token-cost teaching depends on this
  difference being real, so never inline skill bodies into the prompt.
- **The web-trap must stay deterministic.** The first canned result in
  `src/server/scenario/webResults.ts` (the archived 2019 refund policy) is a
  deliberate trap; the `tools-web-trap` eval case is graded by assertions only,
  no judge.
- **Modes gate the UI, and the eval cases come in per-mode blocks.** The mode
  order and what each unlocks live in `MODES` (`src/shared/types.ts`); the
  blocks live in `src/server/evals/cases.ts`. Investigation mode runs a fixed
  read-only preset (`investigationPreset()` in `src/server/config/store.ts`);
  every other mode runs the learner's own config, which starts as a **blank
  slate** (`baselineConfig()`: minimal persona, no rules, no skills, no tools).
  The blocks assume that arc — tools-block cases must be passable with tools
  alone, prompt-block cases are tone-scored against the learner's chosen brief
  (`TONE_PASS_THRESHOLD`), and the cost block has a run budget
  (`COST_BLOCK_BUDGET_USD`); both constants need calibrating against the
  hosted model.

## Architecture in one breath

Hono server (`src/server`) exposes `/api`; `POST /api/chat` and
`POST /api/evals/run` stream NDJSON events; the agent loop
(`src/server/agent/loop.ts`) drives a provider-agnostic `converse()` interface
(`src/server/ai.ts`) with Bedrock/Claude/Ollama implementations; learner state
is JSON files in `DATA_DIR` (a Docker volume in the hosted environment). React
client in `src/client` (Vite). Shared types in `src/shared/types.ts`.

## Hosted-environment specifics

- Container port 3000, host port 1001; single server serves frontend + API.
- Bedrock proxy: endpoint `https://bedrock-runtime.aws-proxy.skillerwhale.com/`,
  region `eu-west-1`, access key = `SW_ATTENDANCE_ID`, secret literally `'unused'`.
- `maxTokens` defaults: 1024 for agent calls, 256 for judge calls. A full eval
  run is ~50–70 LLM calls; keep concurrency at 3 (see `evals/runner.ts`) —
  a classroom of learners shares the proxy.

## Commands

- `bun test` — unit tests (fast, no network)
- `bunx tsc --noEmit` — typecheck
- `bun run build` — frontend build (needed before `bun run start`)
- `bunx playwright test` — e2e with mocked `/api`

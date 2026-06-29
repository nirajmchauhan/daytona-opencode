# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A POC for **Project Forge / Clank**: a local TypeScript orchestrator that drives **OpenCode**
(running inside a **Daytona** sandbox) through a repo-aware **brainstorm → spec → plan →
implement (TDD)** workflow. It proves the engine that Clank/Hermes will later use to let an
AI agent build features in an isolated sandbox.

The agent engine is OpenCode (not Codex — the plan was originally Codex-based; it was swapped
because OpenCode's server+SDK model is far less brittle than driving a CLI).

## Commands

```bash
npm install            # deps
cp .env.example .env   # then fill DAYTONA_API_KEY + SANDBOX_OPENROUTER_API_KEY
npm start              # run with defaults (login feature on the sample repo)
npm start -- --repo <url> --task "..." --mode implement --branch feat/x
npm run typecheck      # tsc --noEmit — ALWAYS run before committing; there is no test suite here
```

The run is parameterized by `RunInput` (`src/run-input.ts`), built from CLI flags → env → defaults:
`repo`/`REPO_URL`, `task`/`TASK`, `mode`/`MODE` (`brainstorm` | `implement` | `fix`),
`branch`/`BRANCH_NAME` (auto `clank/<mode>-<slug>`), `base`/`BASE_BRANCH`,
`constraints`/`CONSTRAINTS`, `max-turns`/`MAX_TURNS`. `repoDir` (`/home/daytona/<repo-name>`) is
derived from the URL. Defaults reproduce the original login POC.

There are no unit tests in this repo — verification is the end-to-end `npm start` run plus
`npm run typecheck`. The *target* repo (cloned into the sandbox) has its own tests that the
agent runs there.

### Env vars (`.env`)
- `DAYTONA_API_KEY` — orchestrator auth to Daytona.
- `SANDBOX_<PROVIDER>_API_KEY` — provider key forwarded into the sandbox AND registered with
  OpenCode via `auth.set`. Name must match the provider in `SANDBOX_MODEL` (default provider
  is `openrouter` → `SANDBOX_OPENROUTER_API_KEY`).
- `SANDBOX_MODEL` — **always `provider/model`**, and through OpenRouter it's
  `openrouter/<vendor>/<model>` (e.g. `openrouter/z-ai/glm-5.2`). The first segment is the
  provider; `config.ts` splits on the first `/`. Dropping the `openrouter/` prefix breaks auth.
- `AUTO_DELETE_SANDBOX` — `true` (default) deletes the sandbox after the run. Set `false` to
  keep it alive for debugging (see "Debugging a live session").
- `EVENT_LOG` — `off | quiet | verbose` (default `quiet`). Controls console noise from the
  OpenCode event stream; errors always print.

## Architecture & flow

`src/index.ts` is the orchestration script. The flow:

1. **`daytona/create-sandbox.ts`** — create a TypeScript sandbox, inject the provider key as
   `<PROVIDER>_API_KEY`.
2. **`daytona/setup-opencode.ts`** — the heavy lifting, all over `sandbox.process.executeCommand`
   and a background session command:
   - `git clone` `input.repoUrl` into `input.repoDir`, `git checkout -b input.branchName`,
     then `npm install`.
   - Install OpenCode via its official script to `$HOME/.opencode/bin` (NOT `npm i -g` — that
     hits EACCES on the nvm global dir).
   - Start `opencode serve --hostname 0.0.0.0 --port 4096` **from the repo dir** as a background
     process, so the repo's `opencode.json` (which declares the superpowers plugin) loads.
   - Poll `localhost:4096/session` until HTTP 200.
   - `sandbox.getPreviewLink(4096)` → `{ url, token }` is how the LOCAL orchestrator reaches the
     server (the SDK runs locally, not in the sandbox).
3. **`opencode/client.ts`** — `createOpencodeClient({ baseUrl: url, headers: { 'x-daytona-preview-token': token } })`.
4. **`opencode/observe.ts`** — `registerProviderAuth()` (calls `auth.set`; env-var pickup alone
   is unreliable) and `startEventLogger()` (SSE stream → live tool/file/error logging; also
   captures every raw event as a fallback transcript).
5. **`opencode/session.ts`** — `BrainstormSession`: one OpenCode session id reused across all
   prompts (that's what persists context/"thread"). `prompt()` extracts text parts and surfaces
   tool calls; `dumpMessages()` / `readFile()` for transcript and file reads.
6. **`prompts/build-prompts.ts`** — THIN, mode-aware prompts. `buildKickoffPrompt(input)` states
   the task + constraints + full autonomy and lets superpowers own the workflow and file locations;
   `MODE_INSTRUCTIONS` adjusts depth per mode (`brainstorm` stops at spec/plan, `implement` does
   full TDD, `fix` uses systematic-debugging). `index.ts` then loops `buildContinuePrompt(input)`
   (up to `input.maxTurns`) until the agent replies `DONE_MARKER`. We deliberately do NOT dictate
   spec/plan paths or micromanage phases.
7. After the run, `index.ts` reports `git log` / `git diff --stat` (vs the commit captured before
   the agent ran) and — for `implement`/`fix` — `npm test`, all path-agnostic. Always writes a
   transcript to `runs/<sessionId>.json` (or `.events.json` fallback).

### Key relationships to understand
- The **orchestrator holds no agent logic** — OpenCode + the cloned repo's `AGENTS.md` /
  `opencode.json` decide everything (which skills/plugins load, the workflow discipline). Point
  it at a different repo and behavior changes with zero orchestrator edits. This is intentional
  and is the path to "build anything".
- **Provider/model is `provider/model`** parsed in `config.ts`; the same provider id is used for
  `auth.set`.

## OpenCode interaction model (critical gotchas)

- **Context persistence = reusing the session id.** All turns go to the same `session.prompt`
  with the same id.
- **superpowers brainstorming is INTERACTIVE.** It calls an interactive `question` tool that
  **blocks forever in headless mode**. `session.prompt()` disables it via `body.tools: { question: false }`
  so the agent returns questions as text. The future Slack bridge should instead *answer* this
  tool rather than disable it.
- **Where specs land is up to superpowers now.** With thin prompts, the brainstorming/writing-plans
  skills choose locations (typically `docs/superpowers/specs/<date>-<topic>-design.md`). Don't
  reintroduce hardcoded paths — reporting is via `git diff`, which doesn't care. (An earlier
  version dictated `docs/features/login-flow/...`, which caused confusing duplicate spec files.)
- **HTTP timeouts**: `index.ts` sets a finite 20-min undici timeout (`headersTimeout`/`bodyTimeout`).
  Do NOT set these to `0` — an infinite timeout turns a hung model into an infinite hang.
- **Model choice matters a lot.** superpowers depends on reliable tool-calling. Weak models
  (e.g. nemotron) produce malformed specs and don't drive the `skill` tool; GLM and Claude work.

## skills / plugins

- OpenCode has a native `skill` tool. **superpowers ships an OpenCode plugin**, declared in the
  target repo's `opencode.json`: `{"plugin": ["superpowers@git+https://github.com/obra/superpowers.git"]}`.
  It installs on `opencode serve` startup and registers skills (`~/.config/opencode/skills/`,
  project `.opencode/skills/`).
- The target repo's `AGENTS.md` is read automatically and is where the workflow discipline lives
  (brainstorm → spec → plan → TDD). superpowers/Claude-Code skills do **not** transfer to OpenCode;
  only OpenCode-native config (`opencode.json`, `AGENTS.md`, `.opencode/skills`) does.
- Confirm superpowers actually ran by looking for `· tool skill [completed]` in the console or the
  `skill` tool in `runs/<id>.json`. (`verifySuperpowers()` currently checks wrong paths and can
  emit a false negative — trust the tool-call evidence.)

## Logs & debugging

- Console: live event lines (`· tool …`, `· file edited`, `‼ session.error`) gated by `EVENT_LOG`.
- `runs/<sessionId>.json` — full raw transcript (every message + tool call) saved even on failure;
  `runs/<sessionId>.events.json` is the fallback if the server-side dump fails.
- **Debugging a LIVE session** (set `AUTO_DELETE_SANDBOX=false`, SSH into the sandbox via Daytona):
  ```bash
  curl -s localhost:4096/session | python3 -m json.tool
  curl -s "localhost:4096/session/<ID>/message?directory=/home/daytona/nest-js-tmp" | python3 -m json.tool
  curl -N localhost:4096/event                 # live firehose
  tail -f ~/.local/share/opencode/log/<latest>.log
  ```
  Reading `/session/<ID>/message` shows what a pending `question`/tool is waiting on.

## Generalizing (next steps)

Done: thin superpowers-driven prompts and a parameterized `RunInput` (`{ repoUrl, task, mode,
branchName, ... }`). Remaining to make it production-grade:
- **Private repos** — clone currently assumes public; inject a git token into the sandbox.
- **Deliver output** — push the working branch / open a PR (it's already isolated on `branchName`).
- **Interactive Q&A** — replace the disabled `question` tool with a loop that *answers* it (the
  Slack bridge), so brainstorm mode can be truly conversational.

This collapses into the `CodingAgent` interface (`startBrainstorm` / `continueBrainstorm` /
`createSpec` / `createPlan`) so Clank/Hermes can use OpenCode as the brainstorming/coding engine.

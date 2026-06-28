# daytona-opencode

A POC for **Project Forge / Clank**: a local TypeScript orchestrator that drives **OpenCode**
(running inside a **Daytona** sandbox) through a repo-aware **brainstorm → spec → plan →
implement (TDD)** workflow, powered by the **superpowers** skill plugin.

The orchestrator holds no agent logic. It clones a target repo into an isolated sandbox, starts
the OpenCode server, and lets OpenCode + the repo's own `AGENTS.md` / `opencode.json` (which
declares the superpowers plugin) decide how to build the feature. Point it at a different repo and
the behaviour changes with zero orchestrator edits.

## Architecture

```
Local orchestrator (@daytona/sdk + @opencode-ai/sdk)
  ├─ create Daytona sandbox (TypeScript runtime, provider key injected)
  ├─ git clone the target repo + npm install
  ├─ install OpenCode (official script -> $HOME/.opencode/bin)
  ├─ `opencode serve` (background) from the repo dir -> loads superpowers plugin
  ├─ getPreviewLink(4096) -> { url, token }
  ├─ createOpencodeClient({ baseUrl: url, headers: { x-daytona-preview-token: token } })
  ├─ auth.set -> register the provider key with OpenCode
  ├─ session.create  (one session id, reused across turns = persistent context)
  ├─ KICKOFF prompt -> superpowers owns brainstorm -> spec -> plan -> TDD implement
  ├─ CONTINUE loop until the agent replies DONE
  └─ report git log / diff / npm test; save raw transcript; optionally delete sandbox
```

Why OpenCode (not the original Codex plan): OpenCode is client/server by design, so the SDK drives
it over HTTP — far less brittle than screen-scraping a CLI.

## Layout

```
src/
  index.ts                 # orchestration: kickoff + continue-until-DONE loop, reporting
  config.ts                # env loading, provider/model parsing, constants
  daytona/
    create-sandbox.ts      # daytona.create(...)
    setup-opencode.ts      # clone repo, install + serve OpenCode, verify superpowers, expose port
    cleanup.ts             # optional sandbox delete
  opencode/
    client.ts              # createOpencodeClient against the preview URL
    observe.ts             # registerProviderAuth (auth.set) + live SSE event logger
    session.ts             # BrainstormSession: prompt / dumpMessages / readFile
  prompts/
    login-brainstorm.ts    # thin KICKOFF + CONTINUE prompts
```

## Setup

```bash
npm install
cp .env.example .env
# fill in DAYTONA_API_KEY and SANDBOX_OPENROUTER_API_KEY
```

Env vars (see `.env.example`):

- `DAYTONA_API_KEY` — orchestrator auth to Daytona.
- `SANDBOX_<PROVIDER>_API_KEY` — provider key, forwarded into the sandbox and registered with
  OpenCode via `auth.set`. The name must match the provider in `SANDBOX_MODEL` (default provider
  is `openrouter` → set `SANDBOX_OPENROUTER_API_KEY`).
- `SANDBOX_MODEL` — `provider/model`; through OpenRouter it's `openrouter/<vendor>/<model>`
  (e.g. `openrouter/z-ai/glm-5.2`). Use a model with strong tool-calling — superpowers depends on
  it; weak models won't drive the `skill` tool.
- `AUTO_DELETE_SANDBOX` — `true` (default) deletes the sandbox after the run; `false` keeps it for
  debugging.
- `EVENT_LOG` — `off | quiet | verbose` (default `quiet`).

## Run

```bash
npm start          # full end-to-end run
npm run typecheck  # tsc --noEmit
```

The console shows each turn's prompt and reply, live tool calls (`· tool skill …` confirms
superpowers fired), file edits, and finally `git diff --stat` + `npm test`. A full raw transcript
is saved to `runs/<sessionId>.json` (or `runs/<sessionId>.events.json` if the server dump fails).

## Debugging a live session

Set `AUTO_DELETE_SANDBOX=false`, SSH into the sandbox via the Daytona UI, then:

```bash
curl -s localhost:4096/session | python3 -m json.tool
curl -s "localhost:4096/session/<ID>/message?directory=/home/daytona/<repo>" | python3 -m json.tool
curl -N localhost:4096/event                          # live event firehose
tail -f ~/.local/share/opencode/log/<latest>.log
```

## Status & next steps

Working: sandbox bootstrap, OpenCode server, superpowers plugin load, persistent multi-turn
context, and a superpowers-driven brainstorm → spec → plan → TDD build.

To make it build *anything*: parameterize the task/repo (replace the login-specific kickoff with a
`{ repoUrl, task }` input), and replace the disabled interactive `question` tool with a real Q&A
loop that *answers* it (the future Slack bridge), so OpenCode can become the engine behind a
`CodingAgent` interface (`startBrainstorm` / `continueBrainstorm` / `createSpec` / `createPlan`).

See `CLAUDE.md` for architecture details and gotchas.

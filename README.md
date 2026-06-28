# forge-codex-daytona-poc

A small TypeScript POC that validates a repo-aware **brainstorm → spec → plan** workflow,
driven by a local orchestrator against **OpenCode** running inside a **Daytona** sandbox.

> Originally scoped around the Codex SDK; swapped to **OpenCode's server + `@opencode-ai/sdk`**,
> which is client/server by design and far less brittle than screen-scraping a CLI.

## Architecture

```
Local orchestrator (@daytona/sdk + @opencode-ai/sdk)
  ├─ create Daytona sandbox (TypeScript runtime, provider key injected)
  ├─ upload sample repo (forge-target-api) + git init/commit
  ├─ npm i -g opencode-ai; `opencode serve --hostname 0.0.0.0` (background)
  ├─ getPreviewLink(4096) -> { url, token }
  ├─ createOpencodeClient({ baseUrl: url, headers: { x-daytona-preview-token: token } })
  ├─ session.create({ directory: /home/daytona/forge-target-api })
  ├─ prompt 1..4 on the SAME session id  -> brainstorm -> spec.md -> plan.md
  └─ file.read spec.md / plan.md; optionally delete sandbox
```

The whole agent layer from the original plan (`sandbox-agent/`, `codex-client.ts`,
`thread-store.ts`, `output-parser.ts`) is gone: the orchestrator talks to the OpenCode
HTTP server directly. The OpenCode session id provides thread persistence; reusing it
across prompts keeps context.

## Layout

```
src/
  index.ts                 # orchestrator flow (the 4-prompt sequence)
  config.ts                # env loading, model parsing, constants
  daytona/
    create-sandbox.ts      # daytona.create(...)
    setup-opencode.ts      # upload repo, git init, install + serve, expose port
    cleanup.ts             # optional sandbox delete
  opencode/
    client.ts              # createOpencodeClient against the preview URL
    session.ts             # BrainstormSession: create / prompt / readFile
  repo/
    sample-repo.ts         # contents of the fake forge-target-api repo
  prompts/
    login-brainstorm.ts    # the four prompts
```

## Setup

```bash
npm install
cp .env.example .env
# fill in DAYTONA_API_KEY and SANDBOX_OPENAI_API_KEY
```

Env vars (see `.env.example`):

- `DAYTONA_API_KEY` — local orchestrator auth to Daytona.
- `SANDBOX_OPENAI_API_KEY` — injected into the sandbox; OpenCode reads `OPENAI_API_KEY`.
  (Use `SANDBOX_ANTHROPIC_API_KEY` if you switch the model to `anthropic/*`.)
- `SANDBOX_MODEL` — `provider/model`, default `openai/gpt-4o`.
- `AUTO_DELETE_SANDBOX` — `true` (default) deletes the sandbox after the run.

## Run

```bash
npm start
```

You'll see: brainstorm Q&A (turn 1), continued brainstorm (turn 2), the generated
`docs/features/login-flow/spec.md`, and `docs/features/login-flow/plan.md`.

## Success criteria

- [ ] Daytona sandbox created
- [ ] Sample repo created at `/home/daytona/forge-target-api`
- [ ] OpenCode server runs inside the sandbox and is reachable via preview URL
- [ ] OpenCode reads AGENTS.md and repo docs
- [ ] Repo-aware login-flow questions returned
- [ ] Second prompt continues the same session/context
- [ ] `spec.md` and `plan.md` created
- [ ] No implementation happens
- [ ] Sandbox deletable after the run
```

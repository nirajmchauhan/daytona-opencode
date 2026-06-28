# Forge / Clank POC — Daytona + Codex SDK Brainstorming Session

## Objective

Build a small TypeScript POC where:

1. A local orchestrator creates a Daytona sandbox.
2. The orchestrator uploads a sandbox agent into Daytona.
3. The sandbox agent uses the OpenAI Codex SDK.
4. Codex starts a repo-aware brainstorming session for a sample feature: login flow.
5. Codex asks precise questions based on repo context.
6. The orchestrator sends answers back into the same Codex thread.
7. Codex continues the brainstorming and produces a `spec.md` and `plan.md`.

This POC is not about implementation yet. It is only to validate:

* Daytona sandbox creation
* Codex SDK running inside Daytona
* Codex thread persistence
* Multi-turn brainstorming
* Context retained across turns
* Structured questions coming back from Codex

---

# 1. Repo Name

Create a new repo:

```text
forge-codex-daytona-poc
```

---

# 2. Desired Architecture

```text
Local Machine
  └── main orchestrator
      ├── creates Daytona sandbox
      ├── uploads sandbox agent
      ├── runs sandbox agent
      ├── sends prompts
      └── prints Codex output

Daytona Sandbox
  └── sandbox agent
      ├── clones or creates sample repo
      ├── configures Codex
      ├── starts Codex SDK thread
      ├── persists thread ID
      ├── receives prompts
      └── returns responses
```

---

# 3. Project Structure

```text
forge-codex-daytona-poc/
  package.json
  tsconfig.json
  .env.example
  README.md

  src/
    index.ts
    daytona/
      create-sandbox.ts
      upload-agent.ts
      run-agent.ts
      cleanup.ts
    prompts/
      login-brainstorm.ts

  sandbox-agent/
    package.json
    tsconfig.json
    src/
      index.ts
      codex-client.ts
      thread-store.ts
      repo-setup.ts
      output-parser.ts
```

---

# 4. Environment Variables

Create `.env.example`:

```env
DAYTONA_API_KEY=
SANDBOX_OPENAI_API_KEY=
DAYTONA_TARGET=
AUTO_DELETE_SANDBOX=true
```

Notes:

* `DAYTONA_API_KEY` is used by the local orchestrator.
* `SANDBOX_OPENAI_API_KEY` is passed into the Daytona sandbox.
* Use a dedicated OpenAI key for this POC.
* Do not pass personal GitHub tokens yet.
* For this POC, use a sample repo created inside the sandbox.

---

# 5. Install Dependencies

Root project:

```bash
npm init -y
npm install @daytona/sdk dotenv
npm install -D typescript tsx @types/node
```

Sandbox agent:

```bash
cd sandbox-agent
npm init -y
npm install @openai/codex-sdk
npm install -D typescript tsx @types/node
```

---

# 6. Root Orchestrator Responsibilities

The root `src/index.ts` should:

1. Load env vars.
2. Create a Daytona sandbox with TypeScript runtime.
3. Upload the `sandbox-agent` folder into the sandbox.
4. Install sandbox agent dependencies.
5. Ask the sandbox agent to initialize a sample repo.
6. Send initial brainstorming prompt.
7. Print Codex output.
8. Send sample answers.
9. Ask Codex to continue brainstorming.
10. Ask Codex to generate `docs/features/login-flow/spec.md`.
11. Ask Codex to generate `docs/features/login-flow/plan.md`.
12. Print final files.
13. Optionally delete sandbox.

---

# 7. Daytona Sandbox Creation

Create `src/daytona/create-sandbox.ts`.

Expected behavior:

```ts
import { Daytona } from '@daytona/sdk';

export async function createSandbox() {
  const daytona = new Daytona();

  const sandbox = await daytona.create({
    language: 'typescript',
    envVars: {
      OPENAI_API_KEY: process.env.SANDBOX_OPENAI_API_KEY!,
      NODE_ENV: 'development',
    },
  });

  return sandbox;
}
```

Also add logs:

```text
Creating Daytona sandbox...
Sandbox created: <id>
```

---

# 8. Sandbox Agent Upload

Create `src/daytona/upload-agent.ts`.

Responsibilities:

* Upload `sandbox-agent` source folder into `/tmp/agent`.
* Run `npm install` in `/tmp/agent`.
* Create `.codex/config.toml` in `/home/daytona`.

The Codex config should include Daytona-specific developer instructions:

```toml
developer_instructions = """
You are running inside a Daytona sandbox.
Use /home/daytona as the workspace root.
You are helping validate a brainstorming workflow for Project Forge / Clank.
Do not implement code unless explicitly asked.
When brainstorming, ask precise blocking questions.
Prefer producing structured JSON when asked.
"""
```

---

# 9. Sample Repo Setup Inside Sandbox

Create `sandbox-agent/src/repo-setup.ts`.

The sandbox agent should create a fake repo at:

```text
/home/daytona/forge-target-api
```

Create these files:

```text
forge-target-api/
  package.json
  README.md
  AGENTS.md
  src/
    app.ts
  docs/
    architecture.md
```

`AGENTS.md` should contain instructions like:

```md
# Agent Instructions

This is a small NestJS-style API project.

Rules:
- Prefer TypeScript.
- Use cookie-based sessions unless the user explicitly asks for bearer JWT.
- Do not implement SSO unless asked.
- For auth decisions, ask before adding production-grade security features.
- Generate a spec before implementation.
- Generate a plan before implementation.
- Do not code until the plan is approved.
```

`README.md` should say:

```md
# Forge Target API

A small API used for testing Clank, the AI developer agent.

The app currently has no login flow.
```

`docs/architecture.md` should say:

```md
# Architecture

This is a small API-first TypeScript service.

No database has been selected yet.
No authentication system exists yet.
```

Initialize git:

```bash
cd /home/daytona/forge-target-api
git init
git add .
git commit -m "chore: initial sample repo"
```

If git user is missing, configure local git user:

```bash
git config user.email "clank@example.local"
git config user.name "Clank"
```

---

# 10. Sandbox Agent: Codex SDK Wrapper

Create `sandbox-agent/src/codex-client.ts`.

Responsibilities:

* Start or resume a Codex thread.
* Use working directory `/home/daytona/forge-target-api`.
* Persist thread ID to `/tmp/codex-thread-id`.
* Run prompts against the same thread.

Pseudo-shape:

```ts
import { Codex } from '@openai/codex-sdk';
import { readFile, writeFile } from 'node:fs/promises';

const THREAD_ID_PATH = '/tmp/codex-thread-id';

async function readThreadId(): Promise<string | null> {
  try {
    return (await readFile(THREAD_ID_PATH, 'utf8')).trim();
  } catch {
    return null;
  }
}

export async function runCodexPrompt(prompt: string): Promise<string> {
  const codex = new Codex();

  const options = {
    workingDirectory: '/home/daytona/forge-target-api',
    skipGitRepoCheck: false,
    sandboxMode: 'workspace-write',
  };

  const existingThreadId = await readThreadId();

  const thread = existingThreadId
    ? codex.resumeThread(existingThreadId, options)
    : codex.startThread(options);

  const result = await thread.run(prompt);

  if (!existingThreadId && thread.id) {
    await writeFile(THREAD_ID_PATH, thread.id, 'utf8');
  }

  return typeof result === 'string'
    ? result
    : JSON.stringify(result, null, 2);
}
```

Adjust the exact SDK API based on the installed package’s typings.

---

# 11. Sandbox Agent Entrypoint

Create `sandbox-agent/src/index.ts`.

It should support commands:

```bash
npm run agent -- setup-repo
npm run agent -- run "<prompt>"
npm run agent -- read-file "docs/features/login-flow/spec.md"
```

Expected CLI behavior:

```ts
const command = process.argv[2];

if (command === 'setup-repo') {
  await setupRepo();
}

if (command === 'run') {
  const prompt = process.argv.slice(3).join(' ');
  const output = await runCodexPrompt(prompt);
  console.log(output);
}

if (command === 'read-file') {
  const path = process.argv[3];
  const content = await readFile(`/home/daytona/forge-target-api/${path}`, 'utf8');
  console.log(content);
}
```

---

# 12. Prompt 1 — Start Brainstorming

Create `src/prompts/login-brainstorm.ts`.

Initial prompt:

```text
You are working inside the repo /home/daytona/forge-target-api.

Task:
Start a brainstorming session for adding a login flow.

Important:
- Inspect README.md, AGENTS.md, and docs/architecture.md before asking questions.
- Do not implement code.
- Ask only blocking questions required before creating a spec.
- Prefer specific, repo-aware questions.
- Return output in this format:

## Current Understanding
<short summary>

## Blocking Questions
1. <question>
2. <question>
3. <question>

## Assumptions You Can Safely Make
- <assumption>

## Next Step
Say what information you need from the human.
```

Expected result:

Codex should ask questions around:

* backend-only or UI + backend
* DB choice
* session style
* password storage
* token/session expiry
* registration needed or login only
* user model
* auth middleware
* protected endpoint examples
* tests

---

# 13. Prompt 2 — Provide Human Answers

After the first prompt, send a second prompt into the same Codex thread:

```text
Here are the human answers:

1. Backend only for now.
2. Use email/password login.
3. Use cookie-based session, not bearer JWT.
4. No SSO for this POC.
5. Use an in-memory user store for now; do not add a real DB yet.
6. Session expiry should be 1 hour.
7. Include login, logout, and current-user endpoints.
8. Add tests.
9. Keep this POC-level, not production-grade.

Continue the brainstorming session.
If more blocking questions remain, ask them.
If enough information is available, produce a concise feature spec.
Do not implement code yet.
```

Expected result:

Codex should either:

* ask remaining questions, or
* say it has enough and produce a spec draft.

---

# 14. Prompt 3 — Generate Spec File

Send:

```text
Create docs/features/login-flow/spec.md in the repo.

The spec should include:
- Goal
- Non-goals
- API endpoints
- Session behaviour
- In-memory user store assumptions
- Validation rules
- Error handling
- Test scenarios
- Open questions, if any

Do not implement code yet.
After writing the file, summarize what you wrote.
```

Then read the file using sandbox command:

```bash
npm run agent -- read-file docs/features/login-flow/spec.md
```

---

# 15. Prompt 4 — Generate Plan File

Send:

```text
Create docs/features/login-flow/plan.md based on the approved spec.

The plan should include:
- Files likely to change
- Implementation steps
- Test plan
- Commit strategy
- Risks
- Human approval needed before coding

Do not implement code yet.
```

Then read:

```bash
npm run agent -- read-file docs/features/login-flow/plan.md
```

---

# 16. Root Orchestrator Flow

The root script should do this:

```ts
async function main() {
  const sandbox = await createSandbox();

  try {
    await uploadAgent(sandbox);
    await runAgentCommand(sandbox, 'setup-repo');

    const first = await runAgentCommand(sandbox, 'run', LOGIN_BRAINSTORM_PROMPT);
    console.log('\n--- CODEX BRAINSTORM 1 ---\n');
    console.log(first);

    const second = await runAgentCommand(sandbox, 'run', HUMAN_ANSWERS_PROMPT);
    console.log('\n--- CODEX BRAINSTORM 2 ---\n');
    console.log(second);

    const spec = await runAgentCommand(sandbox, 'run', CREATE_SPEC_PROMPT);
    console.log('\n--- SPEC CREATED ---\n');
    console.log(spec);

    const specContent = await runAgentCommand(
      sandbox,
      'read-file',
      'docs/features/login-flow/spec.md'
    );
    console.log(specContent);

    const plan = await runAgentCommand(sandbox, 'run', CREATE_PLAN_PROMPT);
    console.log('\n--- PLAN CREATED ---\n');
    console.log(plan);

    const planContent = await runAgentCommand(
      sandbox,
      'read-file',
      'docs/features/login-flow/plan.md'
    );
    console.log(planContent);
  } finally {
    if (process.env.AUTO_DELETE_SANDBOX === 'true') {
      await sandbox.delete();
    }
  }
}
```

---

# 17. Success Criteria

The POC is successful when:

```text
[ ] Daytona sandbox is created
[ ] Sandbox agent is uploaded
[ ] Codex SDK runs inside the sandbox
[ ] Sample repo is created inside /home/daytona/forge-target-api
[ ] Codex reads AGENTS.md and repo docs
[ ] Codex asks repo-aware login-flow questions
[ ] Second prompt continues same thread/context
[ ] Codex remembers earlier questions and answers
[ ] Codex creates spec.md
[ ] Codex creates plan.md
[ ] No implementation happens yet
[ ] Sandbox can be deleted after run
```

---

# 18. Stretch Goal

After the above works, add a manual loop:

```text
You: npm run start
Clank: asks prompt
You: type answer
Clank: sends answer into same Codex thread
```

This will become the future Slack bridge:

```text
Codex question
  ↓
Clank orchestrator
  ↓
Slack question to Niraj
  ↓
Niraj answer
  ↓
Same Codex thread resumes
```

---

# 19. Future Integration into Clank

Once this POC works, extract the logic into Project Forge:

```text
forge-agent-platform/
  packages/coding-agent-codex/
    CodexDaytonaAdapter.ts
```

Expose this interface:

```ts
interface CodingAgent {
  startBrainstorm(input: BrainstormInput): Promise<BrainstormResult>;
  continueBrainstorm(taskId: string, answers: string): Promise<BrainstormResult>;
  createSpec(taskId: string): Promise<FileResult>;
  createPlan(taskId: string): Promise<FileResult>;
}
```

This allows Clank/Hermes to use Codex as the coding/brainstorming engine later.

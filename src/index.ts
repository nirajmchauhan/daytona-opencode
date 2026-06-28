import { mkdir, writeFile } from 'node:fs/promises';
import { Agent, setGlobalDispatcher } from 'undici';
import type { Sandbox } from '@daytona/sdk';
import { loadConfig, REPO_DIR } from './config.js';

// The implement turn can run for many minutes, but a hung model must not block forever.
// Use a long but FINITE timeout (20 min) instead of disabling it.
const PROMPT_TIMEOUT_MS = 20 * 60 * 1000;
setGlobalDispatcher(new Agent({ headersTimeout: PROMPT_TIMEOUT_MS, bodyTimeout: PROMPT_TIMEOUT_MS }));
import { createSandbox } from './daytona/create-sandbox.js';
import { setupOpencode } from './daytona/setup-opencode.js';
import { cleanup } from './daytona/cleanup.js';
import { makeOpencodeClient } from './opencode/client.js';
import { registerProviderAuth, startEventLogger } from './opencode/observe.js';
import { BrainstormSession } from './opencode/session.js';
import {
  LOGIN_BRAINSTORM_PROMPT,
  HUMAN_ANSWERS_PROMPT,
  CREATE_SPEC_AND_PLAN_PROMPT,
  IMPLEMENT_PROMPT,
} from './prompts/login-brainstorm.js';

function banner(title: string): void {
  console.log(`\n--- ${title} ---\n`);
}

/** Best-effort: print a file the agent wrote; don't fail the run if the path differs. */
async function showFile(session: BrainstormSession, relPath: string): Promise<void> {
  try {
    banner(relPath);
    console.log(await session.readFile(relPath));
  } catch {
    console.log(`(could not read ${relPath} — agent may have used a different path)`);
  }
}

/** Print the resulting repo state and run the test suite for verification. */
async function reportRepoState(sandbox: Sandbox): Promise<void> {
  const exec = (cmd: string, timeout = 600) =>
    sandbox.process.executeCommand(cmd, REPO_DIR, undefined, timeout);

  banner('GIT LOG');
  console.log((await exec('git --no-pager log --oneline -5')).result);

  banner('CHANGED FILES (diff stat vs first commit)');
  console.log((await exec('git --no-pager diff --stat $(git rev-list --max-parents=0 HEAD) HEAD')).result);

  banner('TEST RUN (npm test)');
  const test = await exec('npm test 2>&1', 600);
  console.log(test.result);
  console.log(`\nnpm test exit code: ${test.exitCode}`);
}

async function main(): Promise<void> {
  const config = loadConfig();
  console.log(`Using model: ${config.modelSpec}`);

  const sandbox = await createSandbox(config);
  let session: BrainstormSession | undefined;
  let stopEvents: (() => void) | undefined;

  try {
    const access = await setupOpencode(sandbox);
    const client = makeOpencodeClient(access);
    await registerProviderAuth(client, config);
    stopEvents = startEventLogger(client);
    session = await BrainstormSession.start(client, config);

    banner('BRAINSTORM 1 (superpowers questions)');
    console.log(await session.prompt(LOGIN_BRAINSTORM_PROMPT));

    banner('BRAINSTORM 2 (human answers + continue)');
    console.log(await session.prompt(HUMAN_ANSWERS_PROMPT));

    banner('SPEC + PLAN');
    console.log(await session.prompt(CREATE_SPEC_AND_PLAN_PROMPT));
    await showFile(session, 'docs/features/login-flow/spec.md');
    await showFile(session, 'docs/features/login-flow/plan.md');

    banner('IMPLEMENT (TDD)');
    console.log(await session.prompt(IMPLEMENT_PROMPT));

    await reportRepoState(sandbox);
  } finally {
    stopEvents?.();
    // Always save the full raw session transcript (every message + tool call),
    // even if the run errored mid-way — this is the audit log of what the agent did.
    if (session) {
      try {
        await mkdir('runs', { recursive: true });
        const path = `runs/${session.id}.json`;
        await writeFile(path, JSON.stringify(await session.dumpMessages(), null, 2), 'utf8');
        console.log(`\nRaw session transcript saved: ${path}`);
      } catch (e) {
        console.error('Could not save session transcript:', e);
      }
    }
    await cleanup(sandbox, config.autoDeleteSandbox);
  }
}

main().catch((err) => {
  console.error('\nPOC failed:', err);
  process.exit(1);
});

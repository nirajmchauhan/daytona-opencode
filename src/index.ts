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
import { registerProviderAuth, startEventLogger, type EventLogger } from './opencode/observe.js';
import { BrainstormSession } from './opencode/session.js';
import { KICKOFF_PROMPT, CONTINUE_PROMPT, DONE_MARKER } from './prompts/login-brainstorm.js';

/** Max continue-nudges before we stop waiting for the agent to finish. */
const MAX_TURNS = 12;

function banner(title: string): void {
  console.log(`\n--- ${title} ---\n`);
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
  let logger: EventLogger | undefined;

  try {
    const access = await setupOpencode(sandbox);
    const client = makeOpencodeClient(access);
    await registerProviderAuth(client, config);
    logger = startEventLogger(client);
    session = await BrainstormSession.start(client, config);

    // Echo what we send (so the human side of the conversation is visible too),
    // then print the assistant reply.
    const ask = async (label: string, prompt: string): Promise<string> => {
      banner(label);
      console.log(`>>> SENT:\n${prompt}\n\n<<< REPLY:`);
      const reply = await session!.prompt(prompt);
      console.log(reply);
      return reply;
    };

    // Thin kickoff: superpowers owns the whole workflow. Then nudge until the agent
    // reports completion (or we hit the turn cap), letting it run to completion across
    // turns without scripting the content of each phase.
    await ask('KICKOFF', KICKOFF_PROMPT);

    for (let turn = 1; turn <= MAX_TURNS; turn++) {
      const reply = await ask(`CONTINUE ${turn}/${MAX_TURNS}`, CONTINUE_PROMPT);
      if (new RegExp(`(^|\\s)${DONE_MARKER}(\\s|$|[.!])`).test(reply)) {
        console.log('\nAgent reported completion.');
        break;
      }
      if (turn === MAX_TURNS) {
        console.log('\nReached turn cap without an explicit DONE — reporting current state.');
      }
    }

    await reportRepoState(sandbox);
  } finally {
    logger?.stop();
    // Always save a transcript, even if the run errored mid-way. Prefer the
    // server-side message history; if that fails (e.g. server died), fall back
    // to the raw events captured locally by the logger.
    if (session) {
      await mkdir('runs', { recursive: true });
      const path = `runs/${session.id}.json`;
      try {
        await writeFile(path, JSON.stringify(await session.dumpMessages(), null, 2), 'utf8');
        console.log(`\nRaw session transcript saved: ${path}`);
      } catch (e) {
        console.error('Server-side dump failed; saving captured events instead:', e);
        const fallback = `runs/${session.id}.events.json`;
        await writeFile(fallback, JSON.stringify(logger?.events ?? [], null, 2), 'utf8').catch(() => {});
        console.log(`Event transcript saved: ${fallback}`);
      }
    }
    await cleanup(sandbox, config.autoDeleteSandbox);
  }
}

main().catch((err) => {
  console.error('\nPOC failed:', err);
  process.exit(1);
});

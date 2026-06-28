import { loadConfig } from './config.js';
import { createSandbox } from './daytona/create-sandbox.js';
import { setupOpencode } from './daytona/setup-opencode.js';
import { cleanup } from './daytona/cleanup.js';
import { makeOpencodeClient } from './opencode/client.js';
import { BrainstormSession } from './opencode/session.js';
import {
  LOGIN_BRAINSTORM_PROMPT,
  HUMAN_ANSWERS_PROMPT,
  CREATE_SPEC_PROMPT,
  CREATE_PLAN_PROMPT,
} from './prompts/login-brainstorm.js';

function banner(title: string): void {
  console.log(`\n--- ${title} ---\n`);
}

async function main(): Promise<void> {
  const config = loadConfig();
  console.log(`Using model: ${config.modelSpec}`);

  const sandbox = await createSandbox(config);

  try {
    const access = await setupOpencode(sandbox);
    const client = makeOpencodeClient(access);
    const session = await BrainstormSession.start(client, config);

    banner('CODEX BRAINSTORM 1');
    console.log(await session.prompt(LOGIN_BRAINSTORM_PROMPT));

    banner('CODEX BRAINSTORM 2');
    console.log(await session.prompt(HUMAN_ANSWERS_PROMPT));

    banner('SPEC CREATED');
    console.log(await session.prompt(CREATE_SPEC_PROMPT));
    banner('spec.md');
    console.log(await session.readFile('docs/features/login-flow/spec.md'));

    banner('PLAN CREATED');
    console.log(await session.prompt(CREATE_PLAN_PROMPT));
    banner('plan.md');
    console.log(await session.readFile('docs/features/login-flow/plan.md'));
  } finally {
    await cleanup(sandbox, config.autoDeleteSandbox);
  }
}

main().catch((err) => {
  console.error('\nPOC failed:', err);
  process.exit(1);
});

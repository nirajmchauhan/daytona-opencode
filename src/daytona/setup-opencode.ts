import type { Sandbox } from '@daytona/sdk';
import { OPENCODE_PORT } from '../config.js';
import type { RunInput } from '../run-input.js';

const SERVE_SESSION = 'opencode-serve';

/**
 * OpenCode binary path. The official install script drops it under $HOME/.opencode/bin,
 * which is writable by the sandbox user (global npm -g hits EACCES on the nvm dir).
 */
const OPENCODE_BIN = '$HOME/.opencode/bin/opencode';

/** Runs a shell command in the sandbox and throws if it exits non-zero. */
async function run(sandbox: Sandbox, command: string, cwd?: string, timeout = 300): Promise<string> {
  const res = await sandbox.process.executeCommand(command, cwd, undefined, timeout);
  if (res.exitCode !== 0) {
    throw new Error(`Command failed (exit ${res.exitCode}): ${command}\n${res.result}`);
  }
  return res.result;
}

/** Clones the target repo, checks out a working branch, and installs dependencies. */
async function cloneRepo(sandbox: Sandbox, input: RunInput): Promise<void> {
  const { repoUrl, repoDir, baseBranch, branchName } = input;
  console.log(`Cloning ${repoUrl} -> ${repoDir} ...`);
  const branchArg = baseBranch ? `--branch ${baseBranch} ` : '';
  await run(sandbox, `git clone --depth 1 ${branchArg}${repoUrl} ${repoDir}`, undefined, 180);

  // Identity so the agent can commit its work, then an isolated working branch.
  await run(
    sandbox,
    'git config user.email "clank@example.local" && git config user.name "Clank"',
    repoDir,
  );
  await run(sandbox, `git checkout -b ${branchName}`, repoDir);
  console.log(`Working branch: ${branchName}`);

  console.log('Installing repo dependencies (npm install)...');
  await run(sandbox, 'npm install', repoDir, 600);
  console.log('Repo ready.');
}

/** Installs the OpenCode CLI inside the sandbox (user-local, no root required). */
async function installOpencode(sandbox: Sandbox): Promise<void> {
  console.log('Installing OpenCode CLI (this can take a minute)...');
  await run(sandbox, 'curl -fsSL https://opencode.ai/install | bash', undefined, 420);
  const version = (await run(sandbox, `${OPENCODE_BIN} --version`)).trim();
  console.log(`OpenCode installed: ${version}`);
}

let serveCmdId: string | undefined;

/** Starts `opencode serve` as a background process and waits until it answers. */
async function startServer(sandbox: Sandbox, repoDir: string): Promise<void> {
  console.log(`Starting "opencode serve" on port ${OPENCODE_PORT} ...`);
  await sandbox.process.createSession(SERVE_SESSION);
  // Run from the repo dir so the project opencode.json (superpowers plugin) is picked up.
  const started = await sandbox.process.executeSessionCommand(SERVE_SESSION, {
    command: `cd ${repoDir} && ${OPENCODE_BIN} serve --hostname 0.0.0.0 --port ${OPENCODE_PORT}`,
    runAsync: true,
  });
  serveCmdId = started.cmdId;

  // Poll the server from inside the sandbox until the HTTP API responds.
  // Generous: first start also installs the superpowers plugin from git.
  for (let attempt = 1; attempt <= 60; attempt++) {
    const probe = await sandbox.process.executeCommand(
      `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${OPENCODE_PORT}/session`,
    );
    if (probe.result.trim() === '200') {
      console.log('OpenCode server is up.');
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  const logs = await sandbox.process.getSessionCommandLogs(SERVE_SESSION, '').catch(() => null);
  throw new Error(`OpenCode server did not become ready.${logs ? `\nLogs:\n${JSON.stringify(logs)}` : ''}`);
}

/**
 * Checks whether the superpowers plugin/skills actually loaded. Prints findings;
 * does not throw, so you can decide whether the run is meaningful.
 */
async function verifySuperpowers(sandbox: Sandbox, repoDir: string): Promise<void> {
  console.log('\nVerifying superpowers plugin/skills...');

  // The plugin is installed by OpenCode at startup; its exact on-disk location varies
  // (cache/data dirs), so search broadly rather than assuming ~/.config/opencode/skills.
  const fsCheck = await sandbox.process.executeCommand(
    `find $HOME ${repoDir}/.opencode -maxdepth 7 -iname '*superpower*' ` +
      "-not -path '*/.git/*' 2>/dev/null | head -10",
  );
  const traces = fsCheck.result.trim();
  if (traces) {
    console.log('superpowers plugin found on disk:');
    console.log(traces);
  } else {
    console.log(
      'superpowers not located on disk (install path varies). This is NOT proof it is off — ' +
        'runtime confirmation is the `· tool skill` lines during prompts.',
    );
  }
}

export type OpencodeAccess = {
  /** Public preview URL for the OpenCode server. */
  url: string;
  /** Daytona preview token, sent as the x-daytona-preview-token header. */
  token: string;
};

/** Full sandbox bootstrap: clone repo + OpenCode server, returns how to reach the server. */
export async function setupOpencode(sandbox: Sandbox, input: RunInput): Promise<OpencodeAccess> {
  await cloneRepo(sandbox, input);
  await installOpencode(sandbox);
  await startServer(sandbox, input.repoDir);
  await verifySuperpowers(sandbox, input.repoDir);

  const preview = await sandbox.getPreviewLink(OPENCODE_PORT);
  console.log(`OpenCode reachable via preview URL: ${preview.url}`);
  return { url: preview.url, token: preview.token };
}

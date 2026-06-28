import type { Sandbox } from '@daytona/sdk';
import { OPENCODE_PORT, REPO_DIR, REPO_URL } from '../config.js';

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

/** Clones the target repo and installs its dependencies inside the sandbox. */
async function cloneRepo(sandbox: Sandbox): Promise<void> {
  console.log(`Cloning ${REPO_URL} -> ${REPO_DIR} ...`);
  await run(sandbox, `git clone --depth 1 ${REPO_URL} ${REPO_DIR}`, undefined, 180);

  console.log('Installing repo dependencies (npm install)...');
  await run(sandbox, 'npm install', REPO_DIR, 600);

  // Identity so the agent can commit its work.
  await run(
    sandbox,
    'git config user.email "clank@example.local" && git config user.name "Clank"',
    REPO_DIR,
  );
  console.log('Repo ready.');
}

/** Installs the OpenCode CLI inside the sandbox (user-local, no root required). */
async function installOpencode(sandbox: Sandbox): Promise<void> {
  console.log('Installing OpenCode CLI (this can take a minute)...');
  await run(sandbox, 'curl -fsSL https://opencode.ai/install | bash', undefined, 420);
  const version = (await run(sandbox, `${OPENCODE_BIN} --version`)).trim();
  console.log(`OpenCode installed: ${version}`);
}

/** Starts `opencode serve` as a background process and waits until it answers. */
async function startServer(sandbox: Sandbox): Promise<void> {
  console.log(`Starting "opencode serve" on port ${OPENCODE_PORT} ...`);
  await sandbox.process.createSession(SERVE_SESSION);
  // Run from the repo dir so the project opencode.json (superpowers plugin) is picked up.
  await sandbox.process.executeSessionCommand(SERVE_SESSION, {
    command: `cd ${REPO_DIR} && ${OPENCODE_BIN} serve --hostname 0.0.0.0 --port ${OPENCODE_PORT}`,
    runAsync: true,
  });

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

export type OpencodeAccess = {
  /** Public preview URL for the OpenCode server. */
  url: string;
  /** Daytona preview token, sent as the x-daytona-preview-token header. */
  token: string;
};

/** Full sandbox bootstrap: clone repo + OpenCode server, returns how to reach the server. */
export async function setupOpencode(sandbox: Sandbox): Promise<OpencodeAccess> {
  await cloneRepo(sandbox);
  await installOpencode(sandbox);
  await startServer(sandbox);

  const preview = await sandbox.getPreviewLink(OPENCODE_PORT);
  console.log(`OpenCode reachable via preview URL: ${preview.url}`);
  return { url: preview.url, token: preview.token };
}

/**
 * The parameters for a single orchestration run. This is the shape that a future
 * `CodingAgent` API would accept; for now it's parsed from CLI flags / env / defaults.
 */
export type RunMode = 'brainstorm' | 'implement' | 'fix';

export type RunInput = {
  /** Git URL of the target repo to clone into the sandbox (public for now). */
  repoUrl: string;
  /** What to do, in plain language. */
  task: string;
  /** How far to go: spec/plan only, full TDD build, or debug-and-fix. */
  mode: RunMode;
  /** Branch the agent works on (auto-generated from mode+task if omitted). */
  branchName: string;
  /** Branch to start from; defaults to the cloned repo's default branch. */
  baseBranch?: string;
  /** Extra constraints appended to the task (the repo's AGENTS.md also applies). */
  constraints?: string;
  /** Max continue-nudges before the loop gives up waiting for completion. */
  maxTurns: number;
  /** Derived: absolute path of the repo inside the sandbox. */
  repoDir: string;
};

const MODES: RunMode[] = ['brainstorm', 'implement', 'fix'];

/** Default task that preserves the original login POC when no --task is given. */
const DEFAULT_TASK = 'Add a login feature to the API.';
const DEFAULT_CONSTRAINTS =
  'Backend only; email/password; cookie-based session (not JWT); no SSO; ' +
  'in-memory user store (no database); 1-hour session expiry; endpoints register, login, ' +
  'logout, and current-user (whoami); add unit + e2e tests; POC-level, not production-grade.';
const DEFAULT_REPO = 'https://github.com/nirajmchauhan/nest-js-tmp.git';

/** repo name from a git URL: ".../nest-js-tmp.git" -> "nest-js-tmp". */
function repoNameFromUrl(url: string): string {
  const last = url.replace(/\.git$/, '').replace(/\/+$/, '').split('/').pop() ?? 'repo';
  return last || 'repo';
}

/** kebab slug for branch names. */
function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'task';
}

/** Parse `--key value` and `--key=value` flags from argv. */
function parseFlags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[arg.slice(2)] = next;
        i++;
      } else {
        out[arg.slice(2)] = 'true';
      }
    }
  }
  return out;
}

/** Build a validated RunInput from CLI flags, env vars, then defaults. */
export function parseRunInput(argv = process.argv.slice(2)): RunInput {
  const f = parseFlags(argv);
  const pick = (flag: string, env: string) => f[flag] ?? process.env[env];

  const repoUrl = pick('repo', 'REPO_URL') ?? DEFAULT_REPO;
  const task = pick('task', 'TASK') ?? DEFAULT_TASK;

  const modeRaw = (pick('mode', 'MODE') ?? 'implement') as RunMode;
  if (!MODES.includes(modeRaw)) {
    throw new Error(`Invalid mode "${modeRaw}". Use one of: ${MODES.join(', ')}.`);
  }

  // Only apply the login default constraints when running the default task; a custom
  // task shouldn't inherit login-specific constraints.
  const constraints =
    pick('constraints', 'CONSTRAINTS') ?? (task === DEFAULT_TASK ? DEFAULT_CONSTRAINTS : undefined);

  const branchName = pick('branch', 'BRANCH_NAME') ?? `clank/${modeRaw}-${slug(task)}`;
  const baseBranch = pick('base', 'BASE_BRANCH');
  const maxTurns = Number(pick('max-turns', 'MAX_TURNS') ?? 12);

  return {
    repoUrl,
    task,
    mode: modeRaw,
    branchName,
    baseBranch,
    constraints,
    maxTurns: Number.isFinite(maxTurns) && maxTurns > 0 ? maxTurns : 12,
    repoDir: `/home/daytona/${repoNameFromUrl(repoUrl)}`,
  };
}

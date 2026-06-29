import type { RunInput } from '../run-input.js';

/**
 * Thin, mode-aware prompts: state the task + constraints + autonomy, then let superpowers
 * own the workflow and decide file locations. We do NOT dictate paths or micromanage.
 */

/** Marker the agent emits when finished, so the orchestrator can stop the loop. */
export const DONE_MARKER = 'DONE';

/** What each mode tells the agent to do, and how far to go. */
const MODE_INSTRUCTIONS: Record<RunInput['mode'], string> = {
  brainstorm:
    'Use your skills to brainstorm this, then write a spec and an implementation plan. ' +
    'Do NOT write implementation code — stop after the spec and plan.',
  implement:
    'Follow your skills end-to-end: brainstorm, write a spec, write a plan, then implement ' +
    'with TDD, run the tests, and commit.',
  fix:
    'Use systematic debugging: reproduce the problem with a failing test first, then fix it, ' +
    'verify the whole test suite passes, and commit.',
};

/** Build the single kickoff prompt from the run input. */
export function buildKickoffPrompt(input: RunInput): string {
  const constraints = input.constraints ? `\nConstraints:\n${input.constraints}\n` : '\n';
  return `Task: ${input.task}

${MODE_INSTRUCTIONS[input.mode]}

Follow the project's AGENTS.md.${constraints}
You have my approval to proceed through ALL phases autonomously, without waiting for further
confirmation. If something is ambiguous, state a reasonable assumption and keep going.
Do not stop to ask blocking questions.`;
}

/** Build the continue-nudge prompt; completion criteria depend on the mode. */
export function buildContinuePrompt(input: RunInput): string {
  const doneWhen =
    input.mode === 'brainstorm'
      ? 'When the spec and plan are written'
      : 'When the task is fully implemented AND the test suite passes (run `npm test`)';
  return `Continue with the next step of your plan.

${doneWhen}, reply with exactly: ${DONE_MARKER}
Otherwise, do the next step and report what you did.`;
}

/**
 * Thin prompts: state the task + constraints + autonomy, then let superpowers own the
 * whole workflow (brainstorm -> spec -> plan -> TDD implement) and decide file locations.
 * We do NOT dictate paths or micromanage steps.
 */

export const KICKOFF_PROMPT = `Add a login feature to the NestJS API in this repo.

Follow the project's AGENTS.md and use your skills end-to-end: brainstorm, write a spec,
write a plan, then implement with TDD, run the tests, and commit.

Constraints (so you do not need to ask blocking questions):
- Backend only (NestJS), no frontend.
- Email/password login.
- Cookie-based session, not bearer JWT.
- No SSO.
- In-memory user store; do not add a real database.
- Session expiry: 1 hour.
- Endpoints: register, login, logout, and current-user (whoami).
- Add tests (unit + e2e where reasonable).
- POC-level, not production-grade.

You have my approval to proceed through ALL phases autonomously, without waiting for further
confirmation. If something is ambiguous, state a reasonable assumption and keep going.
Do not stop to ask blocking questions.`;

export const CONTINUE_PROMPT = `Continue with the next step of your plan.

When the login feature is fully implemented AND the test suite passes (run \`npm test\`),
reply with exactly: DONE
Otherwise, do the next step and report what you did.`;

/** Marker the agent emits when finished, so the orchestrator can stop the loop. */
export const DONE_MARKER = 'DONE';

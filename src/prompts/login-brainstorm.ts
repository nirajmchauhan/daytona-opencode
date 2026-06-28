import { REPO_DIR } from '../config.js';

export const LOGIN_BRAINSTORM_PROMPT = `You are working inside the repo ${REPO_DIR} (a NestJS API).

Task: add a login feature.

Follow the project's AGENTS.md. Use OpenCode's \`skill\` tool to load and follow the
**superpowers brainstorming** skill before any code.

For this first turn:
- Inspect README.md, AGENTS.md, and src/ to understand the project.
- Do NOT write code yet.
- Ask only the blocking questions you need before a spec.
- Return:

## Current Understanding
<short summary>

## Blocking Questions
1. <question>
...

## Assumptions You Can Safely Make
- <assumption>`;

export const HUMAN_ANSWERS_PROMPT = `Here are the human answers:

1. Backend only (NestJS), no frontend.
2. Email/password login.
3. Cookie-based session, not bearer JWT.
4. No SSO.
5. In-memory user store for now; do not add a real database.
6. Session expiry: 1 hour.
7. Endpoints: register, login, logout, and current-user (whoami).
8. Add tests (unit + e2e where reasonable).
9. POC-level, not production-grade.

I approve this scope. Continue with the superpowers workflow:
produce a concise spec, then a plan. Do not write implementation code yet.`;

export const CREATE_SPEC_AND_PLAN_PROMPT = `Write the spec and the plan as files in the repo:
- docs/features/login-flow/spec.md
- docs/features/login-flow/plan.md

The spec must cover: goal, non-goals, API endpoints, session behaviour, in-memory user
store assumptions, validation rules, error handling, and test scenarios.
The plan must cover: files to change, implementation steps, test plan, and risks.

After writing both files, summarize them. Still do not write implementation code yet.`;

export const IMPLEMENT_PROMPT = `I approve the plan. Now implement the login feature.

Use the superpowers **test-driven-development** skill: write failing tests first, then the
NestJS implementation (module, controller, service, DTOs) to make them pass, then refactor.

Requirements:
- Implement register, login, logout, and current-user endpoints with cookie-based sessions.
- Keep the in-memory user store.
- Run \`npm test\` and ensure tests pass before you finish.
- Commit your work with a clear message.

When done, report: which files you created/changed, and the final test result.`;

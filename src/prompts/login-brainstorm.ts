import { REPO_DIR } from '../config.js';

export const LOGIN_BRAINSTORM_PROMPT = `You are working inside the repo ${REPO_DIR}.

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
Say what information you need from the human.`;

export const HUMAN_ANSWERS_PROMPT = `Here are the human answers:

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
Do not implement code yet.`;

export const CREATE_SPEC_PROMPT = `Create docs/features/login-flow/spec.md in the repo.

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
After writing the file, summarize what you wrote.`;

export const CREATE_PLAN_PROMPT = `Create docs/features/login-flow/plan.md based on the approved spec.

The plan should include:
- Files likely to change
- Implementation steps
- Test plan
- Commit strategy
- Risks
- Human approval needed before coding

Do not implement code yet.`;

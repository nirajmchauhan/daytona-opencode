/**
 * Contents of the fake target repo that gets uploaded into the sandbox.
 * Keyed by path relative to the repo root (REPO_DIR).
 */
export const SAMPLE_REPO_FILES: Record<string, string> = {
  'package.json': JSON.stringify(
    {
      name: 'forge-target-api',
      version: '0.1.0',
      private: true,
      description: 'A small API used for testing Clank, the AI developer agent.',
      type: 'module',
      scripts: { dev: 'tsx src/app.ts' },
    },
    null,
    2,
  ),

  'README.md': `# Forge Target API

A small API used for testing Clank, the AI developer agent.

The app currently has no login flow.
`,

  'AGENTS.md': `# Agent Instructions

This is a small NestJS-style API project.

Rules:
- Prefer TypeScript.
- Use cookie-based sessions unless the user explicitly asks for bearer JWT.
- Do not implement SSO unless asked.
- For auth decisions, ask before adding production-grade security features.
- Generate a spec before implementation.
- Generate a plan before implementation.
- Do not code until the plan is approved.
`,

  'src/app.ts': `// Minimal placeholder API entrypoint.
// No authentication system exists yet.

export function createApp() {
  return {
    routes: ['/health'],
  };
}

console.log('forge-target-api: no login flow yet');
`,

  'docs/architecture.md': `# Architecture

This is a small API-first TypeScript service.

No database has been selected yet.
No authentication system exists yet.
`,
};

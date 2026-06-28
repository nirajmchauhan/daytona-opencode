import 'dotenv/config';

/** Public GitHub repo the sandbox clones and OpenCode builds in. */
export const REPO_URL = 'https://github.com/nirajmchauhan/nest-js-tmp.git';

/** Where the cloned repo lives inside the sandbox. OpenCode operates on this directory. */
export const REPO_DIR = '/home/daytona/nest-js-tmp';

/** Port OpenCode's HTTP server listens on inside the sandbox. */
export const OPENCODE_PORT = 4096;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

/** "openai/gpt-4o" -> { providerID: "openai", modelID: "gpt-4o" } */
function parseModel(spec: string): { providerID: string; modelID: string } {
  const slash = spec.indexOf('/');
  if (slash === -1) {
    throw new Error(`SANDBOX_MODEL must be "provider/model" (e.g. openai/gpt-4o), got: ${spec}`);
  }
  return { providerID: spec.slice(0, slash), modelID: spec.slice(slash + 1) };
}

export function loadConfig() {
  const modelSpec = process.env.SANDBOX_MODEL ?? 'openrouter/anthropic/claude-3.5-sonnet';
  const model = parseModel(modelSpec);

  // The provider key is injected into the sandbox so OpenCode can authenticate.
  // OpenCode reads <PROVIDER>_API_KEY from the environment (e.g. OPENROUTER_API_KEY,
  // OPENAI_API_KEY, ANTHROPIC_API_KEY). We read it from SANDBOX_<PROVIDER>_API_KEY
  // locally and forward it under the name OpenCode expects.
  const providerUpper = model.providerID.toUpperCase();
  const localKeyName = `SANDBOX_${providerUpper}_API_KEY`;
  const providerKey = process.env[localKeyName];
  if (!providerKey) {
    throw new Error(
      `No API key for provider "${model.providerID}". Set ${localKeyName} in .env ` +
        `(SANDBOX_MODEL is "${modelSpec}").`,
    );
  }

  const sandboxEnv: Record<string, string> = {
    NODE_ENV: 'development',
    [`${providerUpper}_API_KEY`]: providerKey,
  };

  return {
    daytonaApiKey: required('DAYTONA_API_KEY'),
    daytonaTarget: process.env.DAYTONA_TARGET || undefined,
    daytonaApiUrl: process.env.DAYTONA_API_URL || undefined,
    model,
    modelSpec,
    sandboxEnv,
    // Provider credentials, so the orchestrator can register them with OpenCode
    // via auth.set (env-var pickup alone is unreliable).
    providerId: model.providerID,
    providerKey,
    autoDeleteSandbox: (process.env.AUTO_DELETE_SANDBOX ?? 'true') === 'true',
  };
}

export type Config = ReturnType<typeof loadConfig>;

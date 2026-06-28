import 'dotenv/config';

/** Where the sample repo lives inside the sandbox. OpenCode operates on this directory. */
export const REPO_DIR = '/home/daytona/forge-target-api';

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
  const modelSpec = process.env.SANDBOX_MODEL ?? 'openai/gpt-4o';
  const model = parseModel(modelSpec);

  // Provider key that gets injected into the sandbox so OpenCode can authenticate.
  // OpenCode reads OPENAI_API_KEY / ANTHROPIC_API_KEY from the environment.
  const sandboxEnv: Record<string, string> = { NODE_ENV: 'development' };
  if (process.env.SANDBOX_OPENAI_API_KEY) {
    sandboxEnv.OPENAI_API_KEY = process.env.SANDBOX_OPENAI_API_KEY;
  }
  if (process.env.SANDBOX_ANTHROPIC_API_KEY) {
    sandboxEnv.ANTHROPIC_API_KEY = process.env.SANDBOX_ANTHROPIC_API_KEY;
  }

  const providerKeyPresent =
    (model.providerID === 'openai' && !!sandboxEnv.OPENAI_API_KEY) ||
    (model.providerID === 'anthropic' && !!sandboxEnv.ANTHROPIC_API_KEY);
  if (!providerKeyPresent) {
    throw new Error(
      `No API key found for provider "${model.providerID}". ` +
        `Set SANDBOX_${model.providerID.toUpperCase()}_API_KEY in .env.`,
    );
  }

  return {
    daytonaApiKey: required('DAYTONA_API_KEY'),
    daytonaTarget: process.env.DAYTONA_TARGET || undefined,
    daytonaApiUrl: process.env.DAYTONA_API_URL || undefined,
    model,
    modelSpec,
    sandboxEnv,
    autoDeleteSandbox: (process.env.AUTO_DELETE_SANDBOX ?? 'true') === 'true',
  };
}

export type Config = ReturnType<typeof loadConfig>;

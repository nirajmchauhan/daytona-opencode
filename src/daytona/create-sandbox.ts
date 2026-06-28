import { Daytona, type Sandbox } from '@daytona/sdk';
import type { Config } from '../config.js';

/** Creates a Daytona sandbox with a TypeScript runtime and the provider key injected. */
export async function createSandbox(config: Config): Promise<Sandbox> {
  const daytona = new Daytona({
    apiKey: config.daytonaApiKey,
    apiUrl: config.daytonaApiUrl,
    target: config.daytonaTarget,
  });

  console.log('Creating Daytona sandbox...');
  const sandbox = await daytona.create({
    language: 'typescript',
    envVars: config.sandboxEnv,
  });
  console.log(`Sandbox created: ${sandbox.id}`);

  return sandbox;
}

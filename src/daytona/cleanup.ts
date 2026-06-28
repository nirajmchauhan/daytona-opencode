import type { Sandbox } from '@daytona/sdk';

/** Deletes the sandbox if auto-delete is enabled, otherwise leaves it for inspection. */
export async function cleanup(sandbox: Sandbox, autoDelete: boolean): Promise<void> {
  if (!autoDelete) {
    console.log(`\nLeaving sandbox ${sandbox.id} running (AUTO_DELETE_SANDBOX=false).`);
    return;
  }
  console.log(`\nDeleting sandbox ${sandbox.id} ...`);
  await sandbox.delete();
  console.log('Sandbox deleted.');
}

import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk';
import type { OpencodeAccess } from '../daytona/setup-opencode.js';

/**
 * Builds an OpenCode client pointed at the server inside the Daytona sandbox.
 * The Daytona preview token authorizes access to the exposed port.
 */
export function makeOpencodeClient(access: OpencodeAccess): OpencodeClient {
  return createOpencodeClient({
    baseUrl: access.url,
    headers: { 'x-daytona-preview-token': access.token },
  });
}

import type { OpencodeClient } from '@opencode-ai/sdk';
import type { Config } from '../config.js';

/**
 * Registers the provider API key with OpenCode. Relying on the <PROVIDER>_API_KEY
 * env var alone is unreliable; auth.set is the explicit, documented path.
 */
export async function registerProviderAuth(client: OpencodeClient, config: Config): Promise<void> {
  const res = await client.auth.set({
    path: { id: config.providerId },
    body: { type: 'api', key: config.providerKey },
  });
  if (res.error) {
    throw new Error(`Failed to register auth for "${config.providerId}": ${JSON.stringify(res.error)}`);
  }
  console.log(`Registered OpenCode credentials for provider "${config.providerId}".`);
}

/** Compact, truncated stringify for event payloads. */
function brief(value: unknown, max = 300): string {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Subscribes to the OpenCode event stream and logs interesting events live, so you
 * can see what the agent is doing while a prompt is still running.
 * Returns a stop() function. Errors are surfaced loudly (e.g. provider/model errors).
 */
export function startEventLogger(client: OpencodeClient): () => void {
  let stopped = false;

  // Noisy streaming deltas — skip these to keep the console readable.
  const skip = new Set(['message.part.removed', 'message.updated', 'message.removed']);

  (async () => {
    try {
      const events = await client.event.subscribe();
      for await (const evt of events.stream) {
        if (stopped) break;
        const e = evt as { type?: string; properties?: Record<string, unknown> };
        const type = e.type ?? 'unknown';
        const props = e.properties ?? {};

        if (type === 'session.error') {
          console.error(`  ‼ [event] session.error: ${brief(props, 600)}`);
          continue;
        }

        // Live tool calls (incl. the superpowers `skill` tool).
        if (type === 'message.part.updated') {
          const part = (props as { part?: { type?: string; tool?: string; state?: { status?: string } } }).part;
          if (part?.type === 'tool') {
            console.log(`  · tool ${part.tool} [${part.state?.status ?? '?'}]`);
          }
          continue;
        }

        if (skip.has(type)) continue;

        if (type === 'file.edited') console.log(`  · file edited: ${brief(props)}`);
        else if (type === 'command.executed') console.log(`  · command: ${brief(props)}`);
        else if (type === 'permission.updated') console.log(`  · permission: ${brief(props)}`);
        else if (type === 'session.idle') console.log('  · session idle (turn complete)');
        else if (type !== 'server.connected') console.log(`  · [event] ${type}`);
      }
    } catch (err) {
      if (!stopped) console.error('  event stream ended:', brief(err));
    }
  })();

  return () => {
    stopped = true;
  };
}

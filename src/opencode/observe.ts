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

export type EventLogger = {
  /** Stop listening. */
  stop: () => void;
  /** All raw events captured so far — usable as a fallback transcript. */
  events: unknown[];
};

/**
 * Subscribes to the OpenCode event stream. Always captures every raw event into
 * `events` (for a fallback transcript), but only PRINTS based on verbosity:
 *
 *   EVENT_LOG=off     -> print nothing (errors still print)
 *   EVENT_LOG=quiet   -> errors + tool calls + file edits + idle (default)
 *   EVENT_LOG=verbose -> every event type
 */
export function startEventLogger(client: OpencodeClient): EventLogger {
  let stopped = false;
  const events: unknown[] = [];
  const mode = (process.env.EVENT_LOG ?? 'quiet').toLowerCase();

  (async () => {
    try {
      const stream = await client.event.subscribe();
      for await (const evt of stream.stream) {
        if (stopped) break;
        events.push(evt);

        const e = evt as { type?: string; properties?: Record<string, unknown> };
        const type = e.type ?? 'unknown';
        const props = e.properties ?? {};

        // Errors always print, regardless of mode.
        if (type === 'session.error') {
          console.error(`  ‼ session.error: ${brief(props, 600)}`);
          continue;
        }
        if (mode === 'off') continue;

        if (mode === 'verbose') {
          console.log(`  · ${type}`);
          continue;
        }

        // quiet (default): only the signal, none of the streaming noise.
        if (type === 'message.part.updated') {
          const part = (props as { part?: { type?: string; tool?: string; state?: { status?: string } } }).part;
          if (part?.type === 'tool') console.log(`  · tool ${part.tool} [${part.state?.status ?? '?'}]`);
        } else if (type === 'file.edited') {
          console.log(`  · file edited: ${brief(props)}`);
        } else if (type === 'session.idle') {
          console.log('  · session idle (turn complete)');
        }
      }
    } catch (err) {
      if (!stopped) console.error('  event stream ended:', brief(err));
    }
  })();

  return {
    stop: () => {
      stopped = true;
    },
    events,
  };
}

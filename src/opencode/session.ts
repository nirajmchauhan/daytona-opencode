import type { OpencodeClient } from '@opencode-ai/sdk';
import { REPO_DIR, type Config } from '../config.js';

/** Builds a useful error string from a hey-api result (status + body). */
function describe(res: { error?: unknown; response?: Response }): string {
  const status = res.response ? `HTTP ${res.response.status} ${res.response.statusText}` : 'no response';
  const body = res.error && Object.keys(res.error as object).length ? JSON.stringify(res.error) : '(empty body)';
  return `${status} — ${body}`;
}

/**
 * Wraps a single OpenCode session bound to the sample repo directory.
 * Every prompt reuses the same session id, so context persists across turns.
 */
export class BrainstormSession {
  private constructor(
    private readonly client: OpencodeClient,
    private readonly config: Config,
    readonly id: string,
  ) {}

  /** Creates a new OpenCode session scoped to the target repo. */
  static async start(client: OpencodeClient, config: Config): Promise<BrainstormSession> {
    const res = await client.session.create({
      query: { directory: REPO_DIR },
      body: { title: 'login-flow brainstorm' },
    });
    if (res.error || !res.data) {
      throw new Error(`Failed to create OpenCode session: ${describe(res)}`);
    }
    console.log(`OpenCode session created: ${res.data.id}`);
    return new BrainstormSession(client, config, res.data.id);
  }

  /** Sends a prompt to the session and returns the assistant's text reply. */
  async prompt(text: string): Promise<string> {
    const res = await this.client.session.prompt({
      path: { id: this.id },
      query: { directory: REPO_DIR },
      body: {
        model: this.config.model,
        parts: [{ type: 'text', text }],
      },
    });
    if (res.error || !res.data) {
      throw new Error(`Prompt failed: ${describe(res)}`);
    }

    // Surface tool calls so skill usage (e.g. the superpowers `skill` tool) is visible.
    const toolCalls = res.data.parts.filter(
      (p): p is Extract<typeof p, { type: 'tool' }> => p.type === 'tool',
    );
    if (toolCalls.length) {
      console.log('  [tools used]');
      for (const t of toolCalls) {
        const input = 'input' in t.state ? JSON.stringify(t.state.input) : '';
        console.log(`    • ${t.tool}${input ? ` ${input}` : ''}`);
      }
    }

    return res.data.parts
      .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
      .map((p) => p.text)
      .join('\n')
      .trim();
  }

  /** Returns the full raw session history (every message + every part/tool call). */
  async dumpMessages(): Promise<unknown> {
    const res = await this.client.session.messages({
      path: { id: this.id },
      query: { directory: REPO_DIR },
    });
    if (res.error || !res.data) {
      throw new Error(`Failed to read session messages: ${describe(res)}`);
    }
    return res.data;
  }

  /** Reads a file from the repo via the OpenCode server. */
  async readFile(relPath: string): Promise<string> {
    const res = await this.client.file.read({
      query: { directory: REPO_DIR, path: relPath },
    });
    if (res.error || !res.data) {
      throw new Error(`Failed to read ${relPath}: ${describe(res)}`);
    }
    return res.data.content;
  }
}

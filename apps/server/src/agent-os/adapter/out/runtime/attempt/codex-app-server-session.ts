import { randomUUID } from 'node:crypto';

type RpcResponse = { id?: string; result?: unknown; error?: { message?: string } };

/** Memory-only JSON-RPC state for one ephemeral Codex app-server Attempt. */
export class CodexAppServerSession {
  private readonly pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();
  private buffer = '';
  private threadId: string | null = null;
  private turnId: string | null = null;

  constructor(private readonly write: (line: string) => void, private readonly maxBytes = 64 * 1024) {}

  async start(input: { model: string; cwd: string; prompt: string }): Promise<void> {
    await this.request('initialize', { clientInfo: { name: 'kiditem', version: '1' } });
    const thread = await this.request('thread/start', { ephemeral: true, model: input.model, cwd: input.cwd });
    this.threadId = requiredId(thread, 'threadId');
    const turn = await this.request('turn/start', { threadId: this.threadId, input: [{ type: 'text', text: input.prompt }] });
    this.turnId = requiredId(turn, 'turnId');
  }

  async steer(message: string): Promise<void> {
    if (!this.threadId || !this.turnId) throw new Error('codex_turn_not_live');
    await this.request('turn/steer', { threadId: this.threadId, expectedTurnId: this.turnId, input: [{ type: 'text', text: message }] });
  }

  async interrupt(): Promise<void> {
    if (!this.threadId || !this.turnId) return;
    await this.request('turn/interrupt', { threadId: this.threadId, turnId: this.turnId });
  }

  receive(chunk: string): void {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer, 'utf8') > this.maxBytes) throw new Error('codex_app_server_output_too_large');
    while (this.buffer.includes('\n')) {
      const index = this.buffer.indexOf('\n');
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      if (!line.trim()) continue;
      let response: RpcResponse;
      try { response = JSON.parse(line) as RpcResponse; } catch { throw new Error('codex_app_server_output_invalid'); }
      if (!response.id) continue;
      const pending = this.pending.get(response.id);
      if (!pending) continue;
      this.pending.delete(response.id);
      if (response.error) pending.reject(new Error(`codex_app_server_error:${response.error.message ?? 'unknown'}`));
      else pending.resolve(response.result);
    }
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }
}

function requiredId(value: unknown, key: 'threadId' | 'turnId'): string {
  const id = (value as Record<string, unknown> | null)?.[key];
  if (typeof id !== 'string' || !id) throw new Error(`codex_app_server_${key}_missing`);
  return id;
}

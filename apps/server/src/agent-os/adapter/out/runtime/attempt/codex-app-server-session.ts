import { randomUUID } from 'node:crypto';
import { agentResultOutputSchema } from './agent-result-output-schema';

type RpcResponse = { id?: string; method?: string; params?: unknown; result?: unknown; error?: { message?: string } };

/** Memory-only JSON-RPC state for one ephemeral Codex app-server Attempt. */
export class CodexAppServerSession {
  private readonly pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();
  private buffer = '';
  private threadId: string | null = null;
  private turnId: string | null = null;

  constructor(private readonly write: (line: string) => void, private readonly maxBytes = 64 * 1024, private readonly notification?: (method: string, params: unknown) => void) {}

  async start(input: { model: string; cwd: string; prompt: string }): Promise<void> {
    await this.request('initialize', { clientInfo: { name: 'kiditem', version: '1' }, capabilities: null });
    this.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} })}\n`);
    const thread = await this.request('thread/start', {
      ephemeral: true, model: input.model, cwd: input.cwd,
      runtimeWorkspaceRoots: [input.cwd], environments: [], selectedCapabilityRoots: [],
      permissions: 'kiditem_attempt',
    });
    this.threadId = requiredNestedId(thread, 'thread');
    if (requiredNestedId(thread, 'activePermissionProfile') !== 'kiditem_attempt') {
      throw new Error('codex_app_server_permission_profile_mismatch');
    }
    const turn = await this.request('turn/start', { threadId: this.threadId, input: [{ type: 'text', text: input.prompt }], outputSchema: terminalOutputSchema() });
    this.turnId = requiredNestedId(turn, 'turn');
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
      if (!response.id) {
        if (response.method) this.notification?.(response.method, response.params);
        continue;
      }
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

function terminalOutputSchema() { return agentResultOutputSchema(); }

function requiredNestedId(value: unknown, key: 'thread' | 'turn' | 'activePermissionProfile'): string {
  const id = ((value as Record<string, unknown> | null)?.[key] as Record<string, unknown> | undefined)?.id;
  if (typeof id !== 'string' || !id) throw new Error(`codex_app_server_${key}_id_missing`);
  return id;
}

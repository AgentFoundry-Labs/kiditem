import { describe, expect, it } from 'vitest';
import { CodexAppServerSession } from './codex-app-server-session';

describe('CodexAppServerSession', () => {
  it('uses the pinned 0.149 thread/start sandbox shape without unsupported history fields', async () => {
    const lines: string[] = [];
    const session = new CodexAppServerSession((line) => lines.push(line));
    const starting = session.start({ model: 'gpt-5.6', cwd: '/attempt/workspace', prompt: 'do work' });
    respond(session, lines, 'initialize', {});
    await Promise.resolve();
    const initializedIndex = lines.findIndex((line) => JSON.parse(line).method === 'initialized');
    const threadIndex = lines.findIndex((line) => JSON.parse(line).method === 'thread/start');
    expect(JSON.parse(lines[initializedIndex]!)).toMatchObject({ jsonrpc: '2.0', method: 'initialized', params: {} });
    expect(initializedIndex).toBeGreaterThan(lines.findIndex((line) => JSON.parse(line).method === 'initialize'));
    expect(threadIndex).toBeGreaterThan(initializedIndex);
    const thread = request(lines, 'thread/start');

    expect(thread.params).toMatchObject({
      ephemeral: true,
      sandbox: 'workspace-write',
      runtimeWorkspaceRoots: ['/attempt/workspace'],
      environments: [],
      selectedCapabilityRoots: [],
    });
    respond(session, lines, 'thread/start', { thread: { id: 'thread-1' } });
    await Promise.resolve();
    expect(request(lines, 'turn/start').params).toMatchObject({ threadId: 'thread-1', outputSchema: expect.any(Object) });
    respond(session, lines, 'turn/start', { turn: { id: 'turn-1' } });
    await starting;
  });
});

function request(lines: string[], method: string): { id: string; params: Record<string, unknown> } {
  const message = lines.map((line) => JSON.parse(line) as { id: string; method: string; params: Record<string, unknown> }).find((line) => line.method === method);
  if (!message) throw new Error(`missing ${method}`);
  return message;
}
function respond(session: CodexAppServerSession, lines: string[], method: string, result: unknown): void {
  const message = request(lines, method);
  session.receive(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n`);
}

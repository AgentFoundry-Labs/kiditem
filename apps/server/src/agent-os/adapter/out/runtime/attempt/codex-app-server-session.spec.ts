import { describe, expect, it } from 'vitest';
import { CodexAppServerSession } from './codex-app-server-session';

describe('CodexAppServerSession', () => {
  it('uses initialize, ephemeral thread/start, turn/start, steer expectedTurnId, and interrupt', async () => {
    const writes: Array<Record<string, unknown>> = [];
    const session = new CodexAppServerSession((line) => writes.push(JSON.parse(line)));
    const started = session.start({ model: 'model', cwd: '/tmp/work', prompt: 'hello' });
    session.receive(JSON.stringify({ id: writes[0].id, result: {} }) + '\n');
    await Promise.resolve();
    session.receive(JSON.stringify({ id: writes[1].id, result: { thread: { id: 'thread' } } }) + '\n');
    await Promise.resolve();
    session.receive(JSON.stringify({ id: writes[2].id, result: { turn: { id: 'turn' } } }) + '\n');
    await started;
    const steering = session.steer('follow up');
    expect(writes[3]).toMatchObject({ method: 'turn/steer', params: { threadId: 'thread', expectedTurnId: 'turn' } });
    session.receive(JSON.stringify({ id: writes[3].id, result: {} }) + '\n');
    await steering;
    const interrupted = session.interrupt();
    expect(writes[4]).toMatchObject({ method: 'turn/interrupt', params: { threadId: 'thread', turnId: 'turn' } });
    session.receive(JSON.stringify({ id: writes[4].id, result: {} }) + '\n');
    await interrupted;
  });

  it('forwards terminal notifications without retaining provider output', () => {
    const received: Array<{ method: string; params: unknown }> = [];
    const session = new CodexAppServerSession(() => undefined, 64 * 1024, (method, params) => received.push({ method, params }));
    session.receive(JSON.stringify({ jsonrpc: '2.0', method: 'turn/completed', params: { turn: { id: 'turn', status: 'completed' } } }) + '\n');
    expect(received).toEqual([{ method: 'turn/completed', params: { turn: { id: 'turn', status: 'completed' } } }]);
  });
});

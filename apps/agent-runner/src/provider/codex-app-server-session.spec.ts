import { describe, expect, it } from 'vitest';
import { CodexAppServerSession } from './codex-app-server-session';

describe('CodexAppServerSession', () => {
  it('ignores unrelated startup notifications before a thread exists', () => {
    const lines: string[] = []; const session = new CodexAppServerSession((line) => { lines.push(line); });

    expect(() => session.receive(`${JSON.stringify({ jsonrpc: '2.0', method: 'server/notice', params: { status: 'starting' } })}\n`)).not.toThrow();
    expect(lines).toEqual([]);
  });

  it('uses an exact ephemeral thread request, the built-in workspace profile, and live steering without a resume id', async () => {
    const lines: string[] = []; const session = new CodexAppServerSession((line) => { lines.push(line); });
    const start = session.start({ model: 'gpt-5.6', cwd: '/attempt/workspace', prompt: 'work' });
    answer(session, lines, 'initialize', {}); await advance();
    answer(session, lines, 'thread/start', { thread: { id: 'thread-1' }, activePermissionProfile: { id: ':workspace' } }); await advance();
    answer(session, lines, 'turn/start', { turn: { id: 'turn-1' } }); await start;
    const steer = session.steer('continue'); answer(session, lines, 'turn/steer', {}); await steer;

    expect(request(lines, 'thread/start').params).toEqual({ ephemeral: true, model: 'gpt-5.6', cwd: '/attempt/workspace', approvalPolicy: 'never' });
    expect(request(lines, 'turn/start').params).toMatchObject({ input: [{ type: 'text', text: 'work', text_elements: [] }] });
    expect(JSON.stringify(request(lines, 'turn/start').params)).not.toContain('resume');
  });

  it('fails closed when the deferred Runner-owned readiness probe does not return its exact nonce', async () => {
    const lines: string[] = []; const session = new CodexAppServerSession((line) => { lines.push(line); });
    const start = session.start({
      model: 'gpt-5.6',
      cwd: '/attempt/workspace',
      prompt: 'work',
      readinessProbeNonce: '51e975ef-c0a7-4ab1-8007-47c0fd563505',
    });
    answer(session, lines, 'initialize', {}); await advance();
    const threadStarts = requests(lines, 'thread/start');
    expect(threadStarts).toHaveLength(1);
    expect(threadStarts[0]!.params).toEqual({
      ephemeral: true,
      model: 'gpt-5.6',
      cwd: '/attempt/workspace',
      approvalPolicy: 'never',
      config: { mcp_servers: { kiditem_attempt: { disabled_tools: ['readiness_probe'] } } },
    });
    answerAt(session, threadStarts, 0, { thread: { id: 'provider-thread' }, activePermissionProfile: { id: ':workspace' } }); await advance();
    const probeThreadStart = requests(lines, 'thread/start')[1]!;
    expect(probeThreadStart.params).toEqual({ ephemeral: true, model: 'gpt-5.6', cwd: '/attempt/workspace', approvalPolicy: 'never' });
    answerAt(session, [probeThreadStart], 0, { thread: { id: 'probe-thread' }, activePermissionProfile: { id: ':workspace' } }); await advance();
    answer(session, lines, 'turn/start', { turn: { id: 'provider-turn' } }); await start;

    const probe = session.completeReadinessProbe();
    expect(request(lines, 'mcpServer/tool/call').params).toEqual({
      threadId: 'probe-thread',
      server: 'kiditem_attempt',
      tool: 'readiness_probe',
      arguments: { nonce: '51e975ef-c0a7-4ab1-8007-47c0fd563505' },
    });
    answer(session, lines, 'mcpServer/tool/call', { content: [], structuredContent: { nonce: '0b2327bb-cd8b-4f4c-8fa5-142760734c30' } });

    await expect(probe).rejects.toThrow('codex_readiness_probe_invalid');
  });

  it('starts the provider turn with its readiness tool hidden and defers the direct probe to the enabled thread', async () => {
    const lines: string[] = []; const events: unknown[] = [];
    const session = new CodexAppServerSession((line) => { lines.push(line); }, undefined, (event) => events.push(event));
    const start = session.start({
      model: 'gpt-5.6',
      cwd: '/attempt/workspace',
      prompt: 'work',
      readinessProbeNonce: '51e975ef-c0a7-4ab1-8007-47c0fd563505',
    });
    answer(session, lines, 'initialize', {}); await advance();
    const threadStarts = requests(lines, 'thread/start');
    expect(threadStarts).toHaveLength(1);
    expect(threadStarts[0]!.params).toEqual({
      ephemeral: true,
      model: 'gpt-5.6',
      cwd: '/attempt/workspace',
      approvalPolicy: 'never',
      config: { mcp_servers: { kiditem_attempt: { disabled_tools: ['readiness_probe'] } } },
    });
    answerAt(session, threadStarts, 0, { thread: { id: 'provider-thread' }, activePermissionProfile: { id: ':workspace' } }); await advance();
    const probeThreadStart = requests(lines, 'thread/start')[1]!;
    expect(probeThreadStart.params).toEqual({ ephemeral: true, model: 'gpt-5.6', cwd: '/attempt/workspace', approvalPolicy: 'never' });
    answerAt(session, [probeThreadStart], 0, { thread: { id: 'probe-thread' }, activePermissionProfile: { id: ':workspace' } }); await advance();
    expect(lines.map((line) => JSON.parse(line).method)).not.toContain('mcpServer/tool/call');
    expect(request(lines, 'turn/start').params).toMatchObject({ threadId: 'provider-thread' });
    answer(session, lines, 'turn/start', { turn: { id: 'provider-turn' } }); await start;

    const steer = session.steer('continue');
    expect(request(lines, 'turn/steer').params).toMatchObject({ threadId: 'provider-thread', expectedTurnId: 'provider-turn' });
    answer(session, lines, 'turn/steer', {}); await steer;
    session.receive(`${JSON.stringify({ jsonrpc: '2.0', method: 'turn/completed', params: { threadId: 'probe-thread', turn: { id: 'probe-turn', status: 'failed' } } })}\n`);
    expect(events).toEqual([]);
    session.receive(`${JSON.stringify({ jsonrpc: '2.0', method: 'turn/completed', params: { threadId: 'provider-thread', turn: { id: 'provider-turn', status: 'completed', items: [{ type: 'agentMessage', text: JSON.stringify({ outcome: 'completed', summary: 'done', resourceRefs: [], operationRefs: [] }) }] } } })}\n`);
    expect(events).toEqual([
      { kind: 'turn_completed', turnId: 'provider-turn', status: 'completed', result: { outcome: 'completed', summary: 'done', resourceRefs: [], operationRefs: [] } },
    ]);
    const probe = session.completeReadinessProbe();
    expect(request(lines, 'mcpServer/tool/call').params).toMatchObject({ threadId: 'probe-thread' });
    answer(session, lines, 'mcpServer/tool/call', { content: [{}], structuredContent: { nonce: '51e975ef-c0a7-4ab1-8007-47c0fd563505' } });
    await probe;
  });

  it('fails closed when the enabled deferred probe thread does not return the workspace permission profile', async () => {
    const lines: string[] = []; const session = new CodexAppServerSession((line) => { lines.push(line); });
    const start = session.start({
      model: 'gpt-5.6',
      cwd: '/attempt/workspace',
      prompt: 'work',
      readinessProbeNonce: '51e975ef-c0a7-4ab1-8007-47c0fd563505',
    });
    answer(session, lines, 'initialize', {}); await advance();
    const threadStarts = requests(lines, 'thread/start');
    expect(threadStarts[0]!.params).toMatchObject({ config: { mcp_servers: { kiditem_attempt: { disabled_tools: ['readiness_probe'] } } } });
    answerAt(session, threadStarts, 0, { thread: { id: 'provider-thread' }, activePermissionProfile: { id: ':workspace' } }); await advance();
    const probeThreadStart = requests(lines, 'thread/start')[1]!;
    answerAt(session, [probeThreadStart], 0, { thread: { id: 'probe-thread' }, activePermissionProfile: { id: ':danger-full-access' } });

    await expect(start).rejects.toThrow('codex_app_server_permission_profile_mismatch');
    expect(lines.map((line) => JSON.parse(line).method)).not.toContain('turn/start');
  });

  it('decodes exact 0.149.1 delta and completion notifications, then closes the live turn', async () => {
    const lines: string[] = []; const events: unknown[] = [];
    const session = new CodexAppServerSession((line) => { lines.push(line); }, undefined, (event) => events.push(event));
    const start = session.start({ model: 'gpt-5.6', cwd: '/attempt/workspace', prompt: 'work' });
    answer(session, lines, 'initialize', {}); await advance();
    answer(session, lines, 'thread/start', { thread: { id: 'thread-1' }, activePermissionProfile: { id: ':workspace' } }); await advance();
    answer(session, lines, 'turn/start', { turn: { id: 'turn-1' } }); await start;

    session.receive(`${JSON.stringify({ jsonrpc: '2.0', method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', delta: 'bounded delta' } })}\n`);
    session.receive(`${JSON.stringify({ jsonrpc: '2.0', method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed', items: [{ type: 'agentMessage', id: 'item-1', text: JSON.stringify({ outcome: 'completed', summary: 'done', resourceRefs: [], operationRefs: [], needsInput: null, error: null }) }] } } })}\n`);

    expect(events).toEqual([
      { kind: 'agent_message_delta', turnId: 'turn-1', delta: 'bounded delta' },
      { kind: 'turn_completed', turnId: 'turn-1', status: 'completed', result: { outcome: 'completed', summary: 'done', resourceRefs: [], operationRefs: [] } },
    ]);
    await expect(session.steer('too late')).rejects.toThrow('codex_turn_not_live');
  });

  it.each(['failed', 'cancelled', 'interrupted'] as const)('surfaces a fast %s completion before the turn/start response', async (status) => {
    const lines: string[] = []; const events: unknown[] = [];
    const session = new CodexAppServerSession((line) => { lines.push(line); }, undefined, (event) => events.push(event));
    const start = session.start({ model: 'gpt-5.6', cwd: '/attempt/workspace', prompt: 'work' });
    answer(session, lines, 'initialize', {}); await advance();
    answer(session, lines, 'thread/start', { thread: { id: 'thread-1' }, activePermissionProfile: { id: ':workspace' } }); await advance();

    session.receive(`${JSON.stringify({ jsonrpc: '2.0', method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status } } })}\n`);
    await start;

    expect(events).toEqual([
      { kind: 'turn_completed', turnId: 'turn-1', status },
    ]);
    await expect(session.steer('too late')).rejects.toThrow('codex_turn_not_live');
  });

  it('rejects an outstanding start RPC when app-server exits before its reply', async () => {
    const lines: string[] = []; const session = new CodexAppServerSession((line) => { lines.push(line); });
    const start = session.start({ model: 'gpt-5.6', cwd: '/attempt/workspace', prompt: 'work' });
    answer(session, lines, 'initialize', {}); await advance();
    expect(request(lines, 'thread/start')).toBeTruthy();

    session.close();

    await expect(start).rejects.toThrow('codex_app_server_closed');
  });
});
function requests(lines: string[], method: string): { id: string; params: Record<string, unknown> }[] { return lines.map((line) => JSON.parse(line)).filter((line) => line.method === method); }
function request(lines: string[], method: string): { id: string; params: Record<string, unknown> } { const value = requests(lines, method)[0]; if (!value) throw new Error(`missing ${method}`); return value; }
function answer(session: CodexAppServerSession, lines: string[], method: string, result: unknown): void { const message = request(lines, method); session.receive(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n`); }
function answerAt(session: CodexAppServerSession, messages: { id: string; params: Record<string, unknown> }[], index: number, result: unknown): void { const message = messages[index]; if (!message) throw new Error(`missing response ${index}`); session.receive(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n`); }
async function advance(): Promise<void> { await Promise.resolve(); await Promise.resolve(); }

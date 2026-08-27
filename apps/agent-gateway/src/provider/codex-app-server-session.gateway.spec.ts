import { describe, expect, it } from 'vitest';
import { gatewayInstructionProfile } from '../profile/agent-profile.catalog';

const GENERAL_PROFILE = gatewayInstructionProfile(null);
const SOURCING_PROFILE = gatewayInstructionProfile('sourcing');
const MCP_TRANSPORT_TOKEN = 'T'.repeat(43);

describe('CodexAppServerSession provider-native thread adapter', () => {
  it('names a conversation even when the caller omits a title so Codex persists the empty thread', async () => {
    const { CodexAppServerSession } = await import('./codex-app-server-session');
    const lines: string[] = [];
    const session = new CodexAppServerSession({
      write: (line: string) => { lines.push(line); },
      workspace: '/gateway/workspace',
      mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      mcpTransportToken: MCP_TRANSPORT_TOKEN,
    });

    const created = session.createConversation({ conversationId: 'conversation-empty', instructionProfile: GENERAL_PROFILE });
    answer(session, lines, 'initialize', {}); await advance();
    answer(session, lines, 'thread/start', threadResponse('provider-thread-empty')); await advance();

    expect(request(lines, 'thread/name/set').params).toEqual({
      threadId: 'provider-thread-empty',
      name: 'Thread title',
    });
    answer(session, lines, 'thread/name/set', {});
    await expect(created).resolves.toEqual(expect.objectContaining({
      providerConversationRef: 'provider-thread-empty',
      title: 'Thread title',
    }));
  });

  it('configures a persistent full-access thread once with the process token and reuses it for ordinary turns without resume', async () => {
    const { CodexAppServerSession } = await import('./codex-app-server-session');
    const lines: string[] = [];
    const session = new CodexAppServerSession({
      write: (line: string) => { lines.push(line); },
      workspace: '/gateway/workspace',
      mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      mcpTransportToken: MCP_TRANSPORT_TOKEN,
    });

    const created = session.createConversation({ conversationId: 'conversation-1', title: 'Supplier research', instructionProfile: SOURCING_PROFILE });
    answer(session, lines, 'initialize', {}); await advance();
    answer(session, lines, 'thread/start', threadResponse('provider-thread-1')); await advance();
    answer(session, lines, 'thread/name/set', {}); await created;

    expect(request(lines, 'thread/start').params).toEqual(expect.objectContaining({
      cwd: '/gateway/workspace',
      approvalPolicy: 'never',
      sandbox: 'danger-full-access',
      ephemeral: false,
      developerInstructions: expect.stringContaining('KidItem Sourcing Agent'),
      config: {
        features: {
          mcp_2026_07_28: true,
        },
        mcp_servers: {
          kiditem: {
            url: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
            http_headers: {
              Authorization: `Bearer ${MCP_TRANSPORT_TOKEN}`,
              'x-kiditem-conversation-id': 'conversation-1',
            },
          },
        },
      },
    }));
    expect(String(request(lines, 'thread/start').params.developerInstructions)).toEqual(expect.stringContaining('KidItem Advertising Agent'));
    expect(String(request(lines, 'thread/start').params.developerInstructions)).toEqual(expect.stringContaining('KidItem Merchandising Agent'));
    expect(String(request(lines, 'thread/start').params.developerInstructions)).toEqual(expect.stringContaining('KidItem Supply Agent'));
    expect(String(request(lines, 'thread/start').params.developerInstructions)).toEqual(expect.stringContaining('KidItem Channel Operations Agent'));
    expect(request(lines, 'thread/name/set').params).toEqual({ threadId: 'provider-thread-1', name: 'Supplier research' });

    const first = session.startTurn({
      providerConversationRef: 'provider-thread-1',
      conversationId: 'conversation-1',
      turnId: 'gateway-turn-1',
      message: 'Find current inventory.',
      model: 'gpt-5.6',
      reasoningEffort: 'medium',
      instructionProfile: SOURCING_PROFILE,
    }, () => undefined);
    await advance();
    answer(session, lines, 'turn/start', { turn: { id: 'provider-turn-1' } }); await first;
    session.receive(notification('turn/completed', { threadId: 'provider-thread-1', turn: { id: 'provider-turn-1', status: 'completed', items: [] } }));

    const second = session.startTurn({
      providerConversationRef: 'provider-thread-1',
      conversationId: 'conversation-1',
      turnId: 'gateway-turn-2',
      message: 'Compare the two suppliers.',
      model: 'gpt-5.6',
      reasoningEffort: 'high',
      instructionProfile: SOURCING_PROFILE,
    }, () => undefined);
    await advance();
    answerAt(session, requests(lines, 'turn/start'), 1, { turn: { id: 'provider-turn-2' } }); await second;

    const resumes = requests(lines, 'thread/resume');
    expect(resumes).toHaveLength(0);
    expect(requests(lines, 'turn/start').every(({ params }) => !('config' in params))).toBe(true);
    expect(requests(lines, 'turn/start').map(({ params }) => ({
      threadId: params.threadId,
      model: params.model,
      effort: params.effort,
      approvalPolicy: params.approvalPolicy,
      sandboxPolicy: params.sandboxPolicy,
    }))).toEqual([
      { threadId: 'provider-thread-1', model: 'gpt-5.6', effort: 'medium', approvalPolicy: 'never', sandboxPolicy: { type: 'dangerFullAccess' } },
      { threadId: 'provider-thread-1', model: 'gpt-5.6', effort: 'high', approvalPolicy: 'never', sandboxPolicy: { type: 'dangerFullAccess' } },
    ]);
    expect(JSON.stringify(requests(lines, 'thread/start'))).not.toContain('"ephemeral":true');
  });

  it('reapplies the MCP 2026 feature when a Gateway restart resumes a configured thread', async () => {
    const { CodexAppServerSession } = await import('./codex-app-server-session');
    const firstLines: string[] = [];
    const beforeRestart = new CodexAppServerSession({
      write: (line: string) => { firstLines.push(line); },
      workspace: '/gateway/workspace',
      mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      mcpTransportToken: MCP_TRANSPORT_TOKEN,
    });
    const created = beforeRestart.createConversation({
      conversationId: 'conversation-restarted',
      title: 'Restarted conversation',
      instructionProfile: GENERAL_PROFILE,
    });
    answer(beforeRestart, firstLines, 'initialize', {}); await advance();
    answer(beforeRestart, firstLines, 'thread/start', threadResponse('provider-thread-restarted')); await advance();
    answer(beforeRestart, firstLines, 'thread/name/set', {}); await created;
    beforeRestart.close();

    const resumedLines: string[] = [];
    const output: unknown[] = [];
    const afterRestart = new CodexAppServerSession({
      write: (line: string) => { resumedLines.push(line); },
      workspace: '/gateway/workspace',
      mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      mcpTransportToken: MCP_TRANSPORT_TOKEN,
    });
    const started = afterRestart.startTurn({
      providerConversationRef: 'provider-thread-restarted',
      conversationId: 'conversation-restarted',
      turnId: 'gateway-turn-restarted',
      message: 'Resume supplier research.',
      model: 'gpt-5.6',
      reasoningEffort: 'medium',
      instructionProfile: GENERAL_PROFILE,
    }, (event) => output.push(event));
    await advance();
    answer(afterRestart, resumedLines, 'initialize', {}); await advance();

    expect(request(resumedLines, 'thread/resume').params).toEqual(expect.objectContaining({
      threadId: 'provider-thread-restarted',
      config: {
        features: {
          mcp_2026_07_28: true,
        },
        mcp_servers: {
          kiditem: {
            url: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
            http_headers: {
              Authorization: `Bearer ${MCP_TRANSPORT_TOKEN}`,
              'x-kiditem-conversation-id': 'conversation-restarted',
            },
          },
        },
      },
    }));
    answer(afterRestart, resumedLines, 'thread/resume', threadResponse('provider-thread-restarted')); await advance();
    answer(afterRestart, resumedLines, 'turn/start', { turn: { id: 'provider-turn-restarted' } });
    await started;

    expect(JSON.stringify(output)).not.toContain(MCP_TRANSPORT_TOKEN);
  });

  it('lists top-level provider threads, reads provider history without cache, archives before local deletion, and never starts a turn on reopen', async () => {
    const { CodexAppServerSession } = await import('./codex-app-server-session');
    const firstLines: string[] = [];
    const first = new CodexAppServerSession({ write: (line: string) => { firstLines.push(line); }, workspace: '/gateway/workspace', mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp', mcpTransportToken: MCP_TRANSPORT_TOKEN });
    const list = first.listConversations();
    answer(first, firstLines, 'initialize', {}); await advance();
    answer(first, firstLines, 'thread/list', {
      data: [
        thread('provider-thread-1', null, 'Top-level thread'),
        thread('subagent-thread-1', 'provider-thread-1', 'Native subagent'),
      ],
      nextCursor: null,
    });
    await expect(list).resolves.toEqual([{
      providerConversationRef: 'provider-thread-1',
      title: 'Top-level thread',
      createdAt: '2023-08-23T00:00:00.000Z',
      updatedAt: '2023-08-23T00:01:00.000Z',
    }]);

    const reopenLines: string[] = [];
    const reopened = new CodexAppServerSession({ write: (line: string) => { reopenLines.push(line); }, workspace: '/gateway/workspace', mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp', mcpTransportToken: MCP_TRANSPORT_TOKEN });
    const history = reopened.history('provider-thread-1');
    answer(reopened, reopenLines, 'initialize', {}); await advance();
    answer(reopened, reopenLines, 'thread/read', {
      thread: {
        ...thread('provider-thread-1', null, 'Top-level thread'),
        turns: [{
          id: 'provider-turn-1',
          startedAt: 1_692_748_800,
          items: [
            { type: 'userMessage', id: 'user-1', content: [{ type: 'text', text: 'Provider-owned message', text_elements: [] }] },
            { type: 'agentMessage', id: 'assistant-1', text: 'Provider-owned answer' },
            { type: 'mcpToolCall', id: 'tool-1', server: 'kiditem', tool: 'capability.invoke', status: 'completed', arguments: { private: 'must not render' }, result: { private: 'must not render' } },
          ],
        }],
      },
    });
    expect(await history).toEqual([
      { id: 'user-1', role: 'user', content: 'Provider-owned message', createdAt: '2023-08-23T00:00:00.000Z' },
      { id: 'assistant-1', role: 'assistant', content: 'Provider-owned answer', createdAt: '2023-08-23T00:00:00.000Z' },
      { id: 'tool-1', role: 'tool', content: 'kiditem.capability.invoke: completed', createdAt: '2023-08-23T00:00:00.000Z' },
    ]);
    expect(reopenLines.map((line) => JSON.parse(line).method)).not.toContain('turn/start');

    const archived = reopened.archive('provider-thread-1');
    await advance();
    answer(reopened, reopenLines, 'thread/archive', {});
    await archived;
    expect(request(reopenLines, 'thread/archive').params).toEqual({ threadId: 'provider-thread-1' });
  });

  it('retains a protocol list cursor for bounded archive reconciliation', async () => {
    const { CodexAppServerSession } = await import('./codex-app-server-session');
    const lines: string[] = [];
    const session = new CodexAppServerSession({
      write: (line: string) => { lines.push(line); },
      workspace: '/gateway/workspace',
      mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      mcpTransportToken: MCP_TRANSPORT_TOKEN,
    });
    const listConversationsPage = (session as unknown as {
      listConversationsPage?: (cursor?: string) => Promise<unknown>;
    }).listConversationsPage;

    expect(listConversationsPage).toBeTypeOf('function');
    if (!listConversationsPage) return;
    const page = listConversationsPage.call(session, 'cursor-1');
    answer(session, lines, 'initialize', {}); await advance();
    expect(request(lines, 'thread/list').params).toEqual({
      limit: 1_000,
      cwd: '/gateway/workspace',
      archived: false,
      cursor: 'cursor-1',
    });
    answer(session, lines, 'thread/list', {
      data: [thread('provider-thread-2', null, 'Later thread')],
      nextCursor: 'cursor-2',
    });

    await expect(page).resolves.toEqual({
      conversations: [{
        providerConversationRef: 'provider-thread-2',
        title: 'Later thread',
        createdAt: '2023-08-23T00:00:00.000Z',
        updatedAt: '2023-08-23T00:01:00.000Z',
      }],
      nextCursor: 'cursor-2',
    });
  });

  it('reads the Codex app-server model catalog and retains each model\'s supported reasoning efforts', async () => {
    const { CodexAppServerSession } = await import('./codex-app-server-session');
    const lines: string[] = [];
    const session = new CodexAppServerSession({ write: (line: string) => { lines.push(line); }, workspace: '/gateway/workspace', mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp', mcpTransportToken: MCP_TRANSPORT_TOKEN });

    const catalog = session.modelCatalog();
    answer(session, lines, 'initialize', {}); await advance();
    answer(session, lines, 'model/list', {
      data: [
        { model: 'gpt-5.6', supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'xhigh' }] },
        { model: 'gpt-5.5', supportedReasoningEfforts: [{ reasoningEffort: 'medium' }] },
      ],
      nextCursor: null,
    });

    await expect(catalog).resolves.toEqual([
      { model: 'gpt-5.6', reasoningEfforts: ['low', 'xhigh'] },
      { model: 'gpt-5.5', reasoningEfforts: ['medium'] },
    ]);
  });

  it('classifies a frame above an injected byte limit without retaining its payload', async () => {
    const { CodexAppServerFramingError, CodexAppServerSession } = await import('./codex-app-server-session');
    const session = new CodexAppServerSession({
      write: () => undefined,
      workspace: '/gateway/workspace',
      mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      mcpTransportToken: MCP_TRANSPORT_TOKEN,
      maxBytes: 32,
    });

    let fault: unknown;
    try { session.receive('x'.repeat(33)); }
    catch (error) { fault = error; }

    expect(fault).toBeInstanceOf(CodexAppServerFramingError);
    expect(fault).toMatchObject({ code: 'codex_app_server_output_too_large', byteCount: 33 });
    expect(() => session.receive('\n')).not.toThrow();
  });

  it('uses exact provider turn coordinates for steer and interrupt, and waits for the provider terminal event before closing the turn', async () => {
    const { CodexAppServerSession } = await import('./codex-app-server-session');
    const lines: string[] = [];
    const events: unknown[] = [];
    const session = new CodexAppServerSession({ write: (line: string) => { lines.push(line); }, workspace: '/gateway/workspace', mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp', mcpTransportToken: MCP_TRANSPORT_TOKEN });
    const start = session.startTurn({
      providerConversationRef: 'provider-thread-1', conversationId: 'conversation-1', turnId: 'gateway-turn-1', message: 'Work', model: 'gpt-5.6', reasoningEffort: 'medium',
      instructionProfile: GENERAL_PROFILE,
    }, (event: unknown) => events.push(event));
    await advance();
    answer(session, lines, 'initialize', {}); await advance();
    answer(session, lines, 'thread/resume', threadResponse('provider-thread-1')); await advance();
    answer(session, lines, 'turn/start', { turn: { id: 'provider-turn-1' } }); await start;

    const steer = session.steer({ providerConversationRef: 'provider-thread-1', turnId: 'gateway-turn-1', message: 'Use current facts.' });
    answer(session, lines, 'turn/steer', {}); await steer;
    const interrupt = session.interrupt({ providerConversationRef: 'provider-thread-1', turnId: 'gateway-turn-1' });
    answer(session, lines, 'turn/interrupt', {}); await interrupt;
    expect(request(lines, 'turn/steer').params).toEqual({
      threadId: 'provider-thread-1', expectedTurnId: 'provider-turn-1', input: [{ type: 'text', text: 'Use current facts.', text_elements: [] }],
    });
    expect(request(lines, 'turn/interrupt').params).toEqual({ threadId: 'provider-thread-1', turnId: 'provider-turn-1' });

    expect(events).toEqual([{ kind: 'status', status: 'started' }]);

    session.receive(notification('item/agentMessage/delta', { threadId: 'provider-thread-1', turnId: 'provider-turn-1', delta: 'A bounded answer.' }));
    session.receive(notification('turn/completed', { threadId: 'provider-thread-1', turn: { id: 'provider-turn-1', status: 'interrupted', items: [] } }));
    session.receive(notification('turn/completed', { threadId: 'other-thread', turn: { id: 'provider-turn-1', status: 'completed', items: [] } }));
    expect(events).toEqual([
      { kind: 'status', status: 'started' },
      { kind: 'assistant.delta', delta: 'A bounded answer.' },
      { kind: 'status', status: 'interrupted' },
    ]);
  });

  it('normalizes only MCP tool lifecycle names and statuses from app-server item notifications', async () => {
    const { CodexAppServerSession } = await import('./codex-app-server-session');
    const lines: string[] = [];
    const events: unknown[] = [];
    const secret = 'provider-arguments-and-results-must-not-leave-the-gateway';
    const session = new CodexAppServerSession({
      write: (line: string) => { lines.push(line); },
      workspace: '/gateway/workspace',
      mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      mcpTransportToken: MCP_TRANSPORT_TOKEN,
    });
    const start = session.startTurn({
      providerConversationRef: 'provider-thread-1', conversationId: 'conversation-1', turnId: 'gateway-turn-1', message: 'Work', model: 'gpt-5.6', reasoningEffort: 'medium',
      instructionProfile: GENERAL_PROFILE,
    }, (event: unknown) => events.push(event));
    await advance();
    answer(session, lines, 'initialize', {}); await advance();
    answer(session, lines, 'thread/resume', threadResponse('provider-thread-1')); await advance();
    answer(session, lines, 'turn/start', { turn: { id: 'provider-turn-1' } }); await start;

    session.receive(notification('item/started', {
      threadId: 'provider-thread-1', turnId: 'provider-turn-1', startedAtMs: 1,
      item: { type: 'mcpToolCall', id: 'tool-1', server: 'kiditem', tool: 'capability.invoke', status: 'inProgress', arguments: { secret }, result: { secret }, error: { secret } },
    }));
    session.receive(notification('item/completed', {
      threadId: 'provider-thread-1', turnId: 'provider-turn-1', completedAtMs: 2,
      item: { type: 'mcpToolCall', id: 'tool-1', server: 'kiditem', tool: 'capability.invoke', status: 'completed', arguments: { secret }, result: { secret }, error: { secret } },
    }));
    session.receive(notification('item/started', {
      threadId: 'provider-thread-1', turnId: 'provider-turn-1', startedAtMs: 3,
      item: { type: 'commandExecution', command: secret, status: 'inProgress' },
    }));

    expect(events).toEqual([
      { kind: 'status', status: 'started' },
      { kind: 'tool.status', name: 'kiditem.capability.invoke', status: 'started' },
      { kind: 'tool.status', name: 'kiditem.capability.invoke', status: 'completed' },
    ]);
    expect(JSON.stringify(events)).not.toContain(secret);
  });

  it('rejects a request when app-server stdin fails instead of leaving a pending RPC forever', async () => {
    const { CodexAppServerSession } = await import('./codex-app-server-session');
    const session = new CodexAppServerSession({
      write: () => Promise.reject(new Error('stdin closed')),
      workspace: '/gateway/workspace',
      mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      mcpTransportToken: MCP_TRANSPORT_TOKEN,
    });

    await expect(session.createConversation({ conversationId: 'conversation-failure', title: 'Will fail', instructionProfile: GENERAL_PROFILE }))
      .rejects.toThrow('codex_app_server_write_failed');
  });

  it('emits one disconnected terminal for every active turn on close and ignores a late duplicate provider terminal', async () => {
    const { CodexAppServerSession } = await import('./codex-app-server-session');
    const lines: string[] = [];
    const events: unknown[] = [];
    const session = new CodexAppServerSession({
      write: (line: string) => { lines.push(line); },
      workspace: '/gateway/workspace',
      mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      mcpTransportToken: MCP_TRANSPORT_TOKEN,
    });
    const start = session.startTurn({
      providerConversationRef: 'provider-thread-1',
      conversationId: 'conversation-1',
      turnId: 'gateway-turn-1',
      message: 'Work',
      model: 'gpt-5.6',
      reasoningEffort: 'medium',
      instructionProfile: GENERAL_PROFILE,
    }, (event: unknown) => events.push(event));
    await advance();
    answer(session, lines, 'initialize', {}); await advance();
    answer(session, lines, 'thread/resume', threadResponse('provider-thread-1')); await advance();
    answer(session, lines, 'turn/start', { turn: { id: 'provider-turn-1' } }); await start;

    session.close();
    session.close();
    session.receive(notification('turn/completed', {
      threadId: 'provider-thread-1',
      turn: { id: 'provider-turn-1', status: 'completed' },
    }));

    expect(events).toEqual([
      { kind: 'status', status: 'started' },
      { kind: 'status', status: 'disconnected' },
    ]);
  });
});

function threadResponse(id: string) {
  return { thread: thread(id, null, 'Thread title'), approvalPolicy: 'never', sandbox: { type: 'dangerFullAccess' } };
}

function thread(id: string, parentThreadId: string | null, name: string) {
  return { id, parentThreadId, name, createdAt: 1_692_748_800, updatedAt: 1_692_748_860, turns: [] };
}

function notification(method: string, params: unknown): string {
  return `${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`;
}

function requests(lines: string[], method: string): Array<{ id: string; params: Record<string, unknown> }> {
  return lines.map((line) => JSON.parse(line) as { id?: string; method?: string; params?: Record<string, unknown> })
    .filter((line): line is { id: string; method: string; params: Record<string, unknown> } => line.method === method && typeof line.id === 'string' && !!line.params);
}

function request(lines: string[], method: string): { id: string; params: Record<string, unknown> } {
  const result = requests(lines, method)[0];
  if (!result) throw new Error(`Missing ${method}`);
  return result;
}

function answer(session: { receive(chunk: string): void }, lines: string[], method: string, result: unknown): void {
  const rpc = request(lines, method);
  session.receive(`${JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result })}\n`);
}

function answerAt(session: { receive(chunk: string): void }, calls: Array<{ id: string; params: Record<string, unknown> }>, index: number, result: unknown): void {
  const rpc = calls[index];
  if (!rpc) throw new Error(`Missing response ${index}`);
  session.receive(`${JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result })}\n`);
}

async function advance(): Promise<void> {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

import { EventType, type BaseEvent } from '@ag-ui/core';
import { describe, expect, it, vi } from 'vitest';
import type { AguiRunAuthorization } from '@kiditem/shared/agent-interaction';
import { AgentCapabilityRegistry } from '../agent-capability-registry.service';
import { AgentAguiRuntimeRegistry } from '../agent-agui-runtime-registry.service';
import { AgentAguiRunService } from '../agent-agui-run.service';

const authorization = (): AguiRunAuthorization => ({
  session: {
    sessionId: 'session-1',
    copilotThreadId: 'thread-1',
    primaryAgentDefinitionKey: 'operator',
    primaryAgentVersionId: 'version-1',
    lifecycle: 'active',
    updatedAt: '2026-08-14T00:00:00.000Z',
  },
  sessionTaskId: 'task-1',
  executionId: 'execution-1',
  modelIdentity: 'gpt-5.2',
  runtimeType: 'openai_responses',
  policySnapshotId: 'policy-1',
  contextEpoch: 1,
  dashboardContext: {
    routeKey: 'dashboard',
    resourceRefs: [], filters: {}, visibleRowIds: [], aggregateSummary: {},
    locale: 'ko-KR', timezone: 'Asia/Seoul',
  },
});

const runInput = () => ({
  threadId: 'thread-1',
  runId: 'run-1',
  state: { forged: true },
  messages: [{ id: 'message-1', role: 'user' as const, content: '재고 위험을 알려줘' }],
  tools: [],
  context: [],
  forwardedProps: { kiditemAuthorization: authorization() },
});

function setup(events: BaseEvent[] = [
  { type: EventType.RUN_STARTED, threadId: 'thread-1', runId: 'run-1' },
  { type: EventType.TEXT_MESSAGE_START, messageId: 'assistant-1', role: 'assistant' },
  { type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'assistant-1', delta: '확인했습니다.' },
  { type: EventType.TEXT_MESSAGE_END, messageId: 'assistant-1' },
  { type: EventType.RUN_FINISHED, threadId: 'thread-1', runId: 'run-1' },
]) {
  const calls: string[] = [];
  const repository = {
    loadExecutionRuntimeContext: vi.fn().mockResolvedValue({
      organizationId: 'org-1', userId: 'user-1', agentDefinitionKey: 'operator',
      sessionId: 'session-1', sessionTaskId: 'task-1', executionId: 'execution-1',
      copilotThreadId: 'thread-1', aguiRunId: 'run-1', agentVersionId: 'version-1',
      runtimeType: 'openai_responses', modelIdentity: 'gpt-5.2',
      policySnapshotId: 'policy-1', contextEpoch: 1, lifecycle: 'active',
      capabilityKeys: ['analytics.readOverview'],
      initialUserEvent: {
        id: 'event-user-1', externalEventId: 'message-1', eventType: 'user_message',
        schemaVersion: 1, payload: { messageId: 'message-1', content: '재고 위험을 알려줘' },
        sequence: 1n, createdAt: new Date('2026-08-14T00:00:00.000Z'),
      },
    }),
    readModelConversation: vi.fn().mockResolvedValue({
      events: [
        { eventType: 'user_message', schemaVersion: 1, payload: { messageId: 'old-user', content: 'canonical prior' }, sequence: 0n },
        { eventType: 'user_message', schemaVersion: 1, payload: { messageId: 'message-1', content: '재고 위험을 알려줘' }, sequence: 1n },
      ],
      hasMore: false,
    }),
    appendExecutionEvent: vi.fn(async (input) => {
      calls.push(`persist:${input.eventType}`);
      return { id: input.externalEventId, sequence: BigInt(calls.length + 1), ...input, createdAt: new Date() };
    }),
    recordExecutionUsage: vi.fn(),
    findCurrentExecution: vi.fn().mockResolvedValue({
      organizationId: 'org-1', sessionId: 'session-1', executionId: 'execution-1',
      copilotThreadId: 'thread-1', aguiRunId: 'run-1', status: 'running',
      runtimeType: 'openai_responses', agentDefinitionKey: 'operator',
    }),
  };
  const publisher = {
    publish: vi.fn(async (pointer) => calls.push(`publish:${pointer.eventId}`)),
    subscribe: vi.fn(),
  };
  const runtimes = new AgentAguiRuntimeRegistry();
  const runtime = {
    run: vi.fn(async function* (input) {
      await input.recordUsage({ provider: 'openai', inputTokens: 10, outputTokens: 5, costMicros: 12n });
      for (const event of events) yield event;
    }),
    stop: vi.fn().mockResolvedValue(true),
  };
  runtimes.register('openai_responses', runtime);
  const capabilities = new AgentCapabilityRegistry();
  const service = new AgentAguiRunService(repository as never, publisher as never, runtimes, capabilities);
  return { service, repository, publisher, runtime, capabilities, calls };
}

async function collect(iterable: AsyncIterable<BaseEvent>) {
  const values: BaseEvent[] = [];
  for await (const value of iterable) values.push(value);
  return values;
}

describe('AgentAguiRunService', () => {
  it('uses canonical history and persists every normalized event before publishing/yielding', async () => {
    const { service, repository, runtime, calls } = setup();
    const events = await collect(service.run({ agentDefinitionKey: 'operator', input: runInput() }));

    expect(events[0]).toMatchObject({ type: 'RUN_STARTED', threadId: 'thread-1', runId: 'run-1' });
    expect(events.at(-1)).toMatchObject({ type: 'RUN_FINISHED', threadId: 'thread-1', runId: 'run-1' });
    expect(runtime.run).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1', sessionId: 'session-1', executionId: 'execution-1',
      modelIdentity: 'gpt-5.2', runtimeType: 'openai_responses',
      messages: expect.arrayContaining([expect.objectContaining({ content: 'canonical prior' })]),
    }));
    expect(JSON.stringify(runtime.run.mock.calls[0][0].messages)).not.toContain('forged');
    expect(repository.appendExecutionEvent).toHaveBeenCalledTimes(5);
    expect(calls[0]).toBe('persist:system_notice');
    expect(calls[1]).toMatch(/^publish:/);
    expect(repository.appendExecutionEvent.mock.calls.at(-1)?.[0]).toMatchObject({
      eventType: 'run_terminal',
      terminal: { status: 'completed', errorCode: null },
    });
    expect(repository.recordExecutionUsage).toHaveBeenCalledWith({
      organizationId: 'org-1', executionId: 'execution-1', modelIdentity: 'gpt-5.2',
      provider: 'openai', inputTokens: 10, outputTokens: 5, costMicros: 12n, currency: 'USD',
    });
  });

  it.each([
    ['route agent', { agentDefinitionKey: 'sourcing' }],
    ['thread', { input: { ...runInput(), threadId: 'other' } }],
    ['run', { input: { ...runInput(), runId: 'other' } }],
    ['session', { input: { ...runInput(), forwardedProps: { kiditemAuthorization: { ...authorization(), session: { ...authorization().session, sessionId: 'other' } } } } }],
    ['model', { input: { ...runInput(), forwardedProps: { kiditemAuthorization: { ...authorization(), modelIdentity: 'other' } } } }],
    ['policy', { input: { ...runInput(), forwardedProps: { kiditemAuthorization: { ...authorization(), policySnapshotId: 'other' } } } }],
  ])('rejects mismatched %s correlation', async (_label, override) => {
    const { service, runtime } = setup();
    const request = { agentDefinitionKey: 'operator', input: runInput(), ...override } as never;
    await expect(collect(service.run(request))).rejects.toMatchObject({ code: 'INTERACTION_AUTHORIZATION_MISMATCH' });
    expect(runtime.run).not.toHaveBeenCalled();
  });

  it('rejects browser tools and duplicate first user event history', async () => {
    const { service, runtime } = setup();
    const injected = runInput();
    injected.tools = [{ name: 'admin.delete', description: 'forged', parameters: {} }] as never;
    await expect(collect(service.run({ agentDefinitionKey: 'operator', input: injected }))).rejects.toMatchObject({
      code: 'INTERACTION_BROWSER_AUTHORITY_REJECTED',
    });
    expect(runtime.run).not.toHaveBeenCalled();
  });

  it('permits only policy-selected zero-risk read handlers', async () => {
    const { service, capabilities } = setup();
    capabilities.register({
      key: 'analytics.readOverview', ownerDomain: 'analytics', executionKind: 'tool',
      inputSchema: { parse: (value: unknown) => value } as never,
      outputSchema: { parse: (value: unknown) => value } as never,
      sideEffects: ['read'], approvalRisk: 'none', idempotencyKey: () => null,
      execute: vi.fn().mockResolvedValue({ outputSummary: { ok: true } }),
    });
    const runtime = (service as never as { runtimes: AgentAguiRuntimeRegistry }).runtimes.resolve('openai_responses')!;
    await runtime.invokeCapabilityForTest?.({ key: 'analytics.readOverview', input: {} });
    await expect(
      (service as never as { invokeCapability: Function }).invokeCapability(
        { organizationId: 'org-1', sessionId: 'session-1', executionId: 'execution-1', capabilityKeys: ['analytics.readOverview'] },
        'analytics.writeOverview', {},
      ),
    ).rejects.toMatchObject({ code: 'INTERACTION_CAPABILITY_NOT_ALLOWED' });
  });

  it('normalizes provider-specific failures into one durable RUN_ERROR terminal', async () => {
    const { service, repository } = setup([{ type: EventType.RAW, event: { provider: 'secret' } }]);
    const events = await collect(service.run({ agentDefinitionKey: 'operator', input: runInput() }));
    expect(events).toEqual([expect.objectContaining({ type: 'RUN_ERROR', code: 'INTERACTION_RUNTIME_EVENT_INVALID' })]);
    expect(repository.appendExecutionEvent).toHaveBeenCalledTimes(1);
    expect(repository.appendExecutionEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'run_terminal',
      payload: { status: 'failed', errorCode: 'interaction_runtime_event_invalid' },
      terminal: expect.objectContaining({ status: 'failed', errorCode: 'interaction_runtime_event_invalid' }),
    }));
  });

  it('rejects provider-specific fields on an otherwise official event', async () => {
    const { service, repository } = setup([{
      type: EventType.RUN_STARTED,
      threadId: 'thread-1',
      runId: 'run-1',
      providerPayload: 'secret',
    } as never]);

    await expect(collect(service.run({ agentDefinitionKey: 'operator', input: runInput() })))
      .resolves.toEqual([expect.objectContaining({
        type: EventType.RUN_ERROR,
        code: 'INTERACTION_RUNTIME_EVENT_INVALID',
      })]);
    expect(repository.appendExecutionEvent).toHaveBeenCalledTimes(1);
  });

  it('stops only the exact current execution', async () => {
    const { service, runtime, repository } = setup();
    await expect(service.stop({
      agentDefinitionKey: 'operator', sessionId: 'session-1', executionId: 'execution-1',
      copilotThreadId: 'thread-1', aguiRunId: 'run-1',
    })).resolves.toBe(true);
    expect(runtime.stop).toHaveBeenCalledWith(expect.objectContaining({ executionId: 'execution-1' }));

    repository.findCurrentExecution.mockResolvedValueOnce({ status: 'completed' });
    await expect(service.stop({
      agentDefinitionKey: 'operator', sessionId: 'session-1', executionId: 'execution-1',
      copilotThreadId: 'thread-1', aguiRunId: 'run-1',
    })).resolves.toBe(false);
  });
});

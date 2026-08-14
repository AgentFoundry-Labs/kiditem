import { EventType, type BaseEvent } from '@ag-ui/core';
import { describe, expect, it, vi } from 'vitest';
import type { AguiRunAuthorization } from '@kiditem/shared/agent-interaction';
import {
  AgentExecutionIdSchema,
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  formatAgentExecutionName,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  OrganizationIdSchema,
} from '@kiditem/shared/identifiers';
import { AgentCapabilityRegistry } from '../agent-capability-registry.service';
import { AgentAguiRuntimeRegistry } from '../agent-agui-runtime-registry.service';
import { AgentAguiRunService } from '../agent-agui-run.service';
import { AgentInteractionPresentationService } from '../agent-interaction-presentation.service';

const authorization = (): AguiRunAuthorization => ({
  session: formatAgentSessionName(
    OrganizationIdSchema.parse('org-1'),
    AgentSessionIdSchema.parse('session-1'),
  ),
  task: formatAgentSessionTaskName(
    OrganizationIdSchema.parse('org-1'),
    AgentSessionIdSchema.parse('session-1'),
    AgentSessionTaskIdSchema.parse('task-1'),
  ),
  execution: formatAgentExecutionName(
    OrganizationIdSchema.parse('org-1'),
    AgentSessionIdSchema.parse('session-1'),
    AgentExecutionIdSchema.parse('execution-1'),
  ),
  modelIdentity: 'gpt-5.2',
  runtimeType: 'openai_responses',
  policyHash: 'a'.repeat(64),
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
      policySnapshotId: 'policy-1', policyHash: 'a'.repeat(64), contextEpoch: 1, lifecycle: 'active',
      capabilityKeys: ['analytics.readOverview'],
      initialUserEvent: {
        id: 'event-user-1', externalEventId: 'message-1', eventType: 'user_message',
        schemaVersion: 1, payload: { phase: 'complete', messageId: 'message-1', content: '재고 위험을 알려줘' },
        sequence: 1n, createdAt: new Date('2026-08-14T00:00:00.000Z'),
      },
    }),
    readModelConversation: vi.fn().mockResolvedValue({
      events: [
        { eventType: 'user_message', schemaVersion: 1, payload: { phase: 'complete', messageId: 'old-user', content: 'canonical prior' }, sequence: 0n },
        { eventType: 'user_message', schemaVersion: 1, payload: { phase: 'complete', messageId: 'message-1', content: '재고 위험을 알려줘' }, sequence: 1n },
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
      runtimeType: 'openai_responses', agentDefinitionKey: 'operator', attempt: 1,
    }),
    findCurrentSessionExecution: vi.fn().mockResolvedValue({
      organizationId: 'org-1', sessionId: 'session-1', executionId: 'execution-1',
      copilotThreadId: 'thread-1', aguiRunId: 'run-1', status: 'running',
      runtimeType: 'openai_responses', agentDefinitionKey: 'operator', attempt: 1,
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
  const analytics = { record: vi.fn().mockResolvedValue(true) };
  const service = new AgentAguiRunService(
    repository as never, publisher as never, runtimes, capabilities,
    new AgentInteractionPresentationService(), analytics,
  );
  return { service, repository, publisher, runtime, capabilities, analytics, calls };
}

async function collect(iterable: AsyncIterable<BaseEvent>) {
  const values: BaseEvent[] = [];
  for await (const value of iterable) values.push(value);
  return values;
}

describe('AgentAguiRunService', () => {
  it('uses canonical history and persists every normalized event before publishing/yielding', async () => {
    const { service, repository, runtime, analytics, calls } = setup();
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
    expect(analytics.record).toHaveBeenCalledWith(expect.objectContaining({
      event: 'interaction_run_finished', organizationId: 'org-1',
      sessionId: 'session-1', executionId: 'execution-1',
      surface: 'global_panel', outcome: 'completed', rendererKinds: [],
    }));
  });

  it('records only deduplicated renderer kinds accepted from the strict persisted tool-result stream', async () => {
    const suggestion = {
      kind: 'suggested_replies', messageId: 'assistant-source-1',
      replies: [{ id: 'reply-1', label: '후속', content: '후속 질문' }],
      textFallback: '후속 질문이 있습니다.',
    };
    const navigation = {
      kind: 'navigation', actionId: '11111111-1111-4111-8111-111111111111',
      routeKey: 'agent_os', resourceRef: null, label: 'AgentOS', disabledReason: null,
      expiresAt: '2099-08-14T00:00:00.000Z', textFallback: 'AgentOS로 이동합니다.',
    };
    const toolEvents = (toolCallId: string, messageId: string, result: unknown): BaseEvent[] => [
      { type: EventType.TOOL_CALL_START, toolCallId, toolCallName: 'server.projected' },
      { type: EventType.TOOL_CALL_END, toolCallId },
      { type: EventType.TOOL_CALL_RESULT, toolCallId, messageId, role: 'tool', content: JSON.stringify(result) },
    ];
    const { service, analytics } = setup([
      { type: EventType.RUN_STARTED, threadId: 'thread-1', runId: 'run-1' },
      ...toolEvents('tool-1', 'tool-message-1', suggestion),
      ...toolEvents('tool-2', 'tool-message-2', suggestion),
      ...toolEvents('tool-3', 'tool-message-3', navigation),
      { type: EventType.RUN_FINISHED, threadId: 'thread-1', runId: 'run-1' },
    ]);

    await collect(service.run({ agentDefinitionKey: 'operator', input: runInput() }));

    expect(analytics.record).toHaveBeenCalledWith(expect.objectContaining({
      rendererKinds: ['suggested_replies', 'navigation'],
    }));
  });

  it('never records a renderer kind when its validated tool result was not persisted', async () => {
    const result = {
      kind: 'suggested_replies', messageId: 'assistant-source-1',
      replies: [{ id: 'reply-1', label: '후속', content: '후속 질문' }],
      textFallback: '후속 질문이 있습니다.',
    };
    const { service, repository, analytics } = setup([
      { type: EventType.RUN_STARTED, threadId: 'thread-1', runId: 'run-1' },
      { type: EventType.TOOL_CALL_START, toolCallId: 'tool-1', toolCallName: 'server.projected' },
      { type: EventType.TOOL_CALL_END, toolCallId: 'tool-1' },
      { type: EventType.TOOL_CALL_RESULT, toolCallId: 'tool-1', messageId: 'tool-message-1', role: 'tool', content: JSON.stringify(result) },
    ]);
    repository.appendExecutionEvent.mockImplementationOnce(repository.appendExecutionEvent.getMockImplementation()!);
    repository.appendExecutionEvent.mockImplementationOnce(repository.appendExecutionEvent.getMockImplementation()!);
    repository.appendExecutionEvent.mockImplementationOnce(repository.appendExecutionEvent.getMockImplementation()!);
    repository.appendExecutionEvent.mockRejectedValueOnce(new Error('persist failed'));

    await collect(service.run({ agentDefinitionKey: 'operator', input: runInput() }));

    expect(analytics.record).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'failed', rendererKinds: [],
    }));
  });

  it('persists every assistant stream phase before yield and folds ordered deltas into one model turn', async () => {
    const { service, repository, runtime } = setup([
      { type: EventType.RUN_STARTED, threadId: 'thread-1', runId: 'run-1' },
      { type: EventType.TEXT_MESSAGE_START, messageId: 'assistant-new', role: 'assistant' },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'assistant-new', delta: '첫 ' },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'assistant-new', delta: '응답' },
      { type: EventType.TEXT_MESSAGE_END, messageId: 'assistant-new' },
      { type: EventType.RUN_FINISHED, threadId: 'thread-1', runId: 'run-1' },
    ]);
    repository.readModelConversation.mockResolvedValueOnce({
      events: [
        { eventType: 'assistant_message', schemaVersion: 1, payload: { phase: 'start', messageId: 'assistant-old' }, sequence: 1n },
        { eventType: 'assistant_message', schemaVersion: 1, payload: { phase: 'delta', messageId: 'assistant-old', content: '재고 ' }, sequence: 2n },
        { eventType: 'assistant_message', schemaVersion: 1, payload: { phase: 'delta', messageId: 'assistant-old', content: '요약' }, sequence: 3n },
        { eventType: 'assistant_message', schemaVersion: 1, payload: { phase: 'end', messageId: 'assistant-old' }, sequence: 4n },
        { eventType: 'user_message', schemaVersion: 1, payload: { phase: 'complete', messageId: 'message-1', content: '재고 위험을 알려줘' }, sequence: 5n },
      ],
      hasMore: false,
    });

    await collect(service.run({ agentDefinitionKey: 'operator', input: runInput() }));

    expect(runtime.run).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        { id: 'assistant-old', role: 'assistant', content: '재고 요약' },
      ]),
    }));
    expect(repository.appendExecutionEvent.mock.calls.slice(1, 5).map(([input]) => input.payload))
      .toEqual([
        { phase: 'start', messageId: 'assistant-new' },
        { phase: 'delta', messageId: 'assistant-new', content: '첫 ' },
        { phase: 'delta', messageId: 'assistant-new', content: '응답' },
        { phase: 'end', messageId: 'assistant-new' },
      ]);
  });

  it('rejects incomplete or interleaved canonical assistant streams', async () => {
    const { service, repository, runtime } = setup();
    repository.readModelConversation.mockResolvedValueOnce({
      events: [
        { eventType: 'assistant_message', schemaVersion: 1, payload: { phase: 'start', messageId: 'assistant-old' }, sequence: 1n },
        { eventType: 'user_message', schemaVersion: 1, payload: { phase: 'complete', messageId: 'message-1', content: '재고 위험을 알려줘' }, sequence: 2n },
      ],
      hasMore: false,
    });

    await expect(collect(service.run({ agentDefinitionKey: 'operator', input: runInput() })))
      .rejects.toMatchObject({ code: 'INTERACTION_MESSAGE_STREAM_INVALID' });
    expect(runtime.run).not.toHaveBeenCalled();
  });

  it.each([
    ['route agent', { agentDefinitionKey: 'sourcing' }],
    ['thread', { input: { ...runInput(), threadId: 'other' } }],
    ['run', { input: { ...runInput(), runId: 'other' } }],
    ['session', { input: { ...runInput(), forwardedProps: { kiditemAuthorization: { ...authorization(), session: formatAgentSessionName(OrganizationIdSchema.parse('org-1'), AgentSessionIdSchema.parse('other')) } } } }],
    ['model', { input: { ...runInput(), forwardedProps: { kiditemAuthorization: { ...authorization(), modelIdentity: 'other' } } } }],
    ['policy', { input: { ...runInput(), forwardedProps: { kiditemAuthorization: { ...authorization(), policyHash: 'b'.repeat(64) } } } }],
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
      execute: vi.fn().mockResolvedValue({ outputSummary: {
        sales: { revenue: 1000, orders: 1 },
        inventory: { outOfStockSkus: 0, mappingAttentionSkus: 0 },
        freshness: { lastSync: '2026-08-14T00:00:00.000Z', confirmedUntil: null },
      } }),
    });
    const runtime = (service as never as { runtimes: AgentAguiRuntimeRegistry }).runtimes.resolve('openai_responses')!;
    await runtime.invokeCapabilityForTest?.({ key: 'analytics.readOverview', input: {} });
    await expect(
      (service as never as { invokeCapability: Function }).invokeCapability(
        { organizationId: 'org-1', sessionId: 'session-1', executionId: 'execution-1', capabilityKeys: ['analytics.readOverview'] },
        'analytics.writeOverview', {},
      ),
    ).rejects.toMatchObject({ code: 'INTERACTION_CAPABILITY_NOT_ALLOWED' });
    await expect(
      (service as never as { invokeCapability: Function }).invokeCapability(
        {
          organizationId: 'org-1', userId: 'user-1', sessionId: 'session-1',
          executionId: 'execution-1', capabilityKeys: ['analytics.readOverview'],
        },
        'analytics.readOverview', {},
      ),
    ).resolves.toMatchObject({ interactionUiResult: { kind: 'metric_group' } });
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

  it.each([
    ['unknown result', 0, [
      { type: EventType.RUN_STARTED, threadId: 'thread-1', runId: 'run-1' },
      { type: EventType.TOOL_CALL_RESULT, messageId: 'tool-message-1', toolCallId: 'unknown', role: 'tool', content: JSON.stringify({ kind: 'notice', tone: 'info', title: '완료', body: '완료', textFallback: '완료' }) },
    ]],
    ['pre-end result', 0, [
      { type: EventType.RUN_STARTED, threadId: 'thread-1', runId: 'run-1' },
      { type: EventType.TOOL_CALL_START, toolCallId: 'tool-1', toolCallName: 'analytics.readOverview' },
      { type: EventType.TOOL_CALL_RESULT, messageId: 'tool-message-1', toolCallId: 'tool-1', role: 'tool', content: JSON.stringify({ kind: 'notice', tone: 'info', title: '완료', body: '완료', textFallback: '완료' }) },
    ]],
    ['duplicate result', 1, [
      { type: EventType.RUN_STARTED, threadId: 'thread-1', runId: 'run-1' },
      { type: EventType.TOOL_CALL_START, toolCallId: 'tool-1', toolCallName: 'analytics.readOverview' },
      { type: EventType.TOOL_CALL_END, toolCallId: 'tool-1' },
      { type: EventType.TOOL_CALL_RESULT, messageId: 'tool-message-1', toolCallId: 'tool-1', role: 'tool', content: JSON.stringify({ kind: 'notice', tone: 'info', title: '완료', body: '완료', textFallback: '완료' }) },
      { type: EventType.TOOL_CALL_RESULT, messageId: 'tool-message-2', toolCallId: 'tool-1', role: 'tool', content: JSON.stringify({ kind: 'notice', tone: 'info', title: '완료', body: '완료', textFallback: '완료' }) },
    ]],
    ['wrong result role', 0, [
      { type: EventType.RUN_STARTED, threadId: 'thread-1', runId: 'run-1' },
      { type: EventType.TOOL_CALL_START, toolCallId: 'tool-1', toolCallName: 'analytics.readOverview' },
      { type: EventType.TOOL_CALL_END, toolCallId: 'tool-1' },
      { type: EventType.TOOL_CALL_RESULT, messageId: 'tool-message-1', toolCallId: 'tool-1', role: 'assistant', content: JSON.stringify({ kind: 'notice', tone: 'info', title: '완료', body: '완료', textFallback: '완료' }) },
    ]],
    ['pending result at terminal', 0, [
      { type: EventType.RUN_STARTED, threadId: 'thread-1', runId: 'run-1' },
      { type: EventType.TOOL_CALL_START, toolCallId: 'tool-1', toolCallName: 'analytics.readOverview' },
      { type: EventType.TOOL_CALL_END, toolCallId: 'tool-1' },
      { type: EventType.RUN_FINISHED, threadId: 'thread-1', runId: 'run-1' },
    ]],
  ] as const)('rejects invalid tool lifecycle: %s', async (_label, acceptedResultCount, events) => {
    const { service, repository } = setup(events as unknown as BaseEvent[]);
    const output = await collect(service.run({ agentDefinitionKey: 'operator', input: runInput() }));
    expect(output.at(-1)).toMatchObject({
      type: EventType.RUN_ERROR,
      code: 'INTERACTION_RUNTIME_EVENT_INVALID',
    });
    expect(output.filter(({ type }) => type === EventType.TOOL_CALL_RESULT))
      .toHaveLength(acceptedResultCount);
    expect(repository.appendExecutionEvent.mock.calls.filter(([input]) => (
      input.eventType === 'state_snapshot'
    ))).toHaveLength(acceptedResultCount);
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

    repository.findCurrentSessionExecution.mockResolvedValueOnce({
      organizationId: 'org-1', sessionId: 'session-1', executionId: 'execution-2',
      copilotThreadId: 'thread-1', aguiRunId: 'run-2', status: 'running',
      runtimeType: 'openai_responses', agentDefinitionKey: 'operator', attempt: 2,
    });
    await expect(service.stop({
      agentDefinitionKey: 'operator', sessionId: 'session-1', executionId: 'execution-1',
      copilotThreadId: 'thread-1', aguiRunId: 'run-1',
    })).resolves.toBe(false);
  });
});

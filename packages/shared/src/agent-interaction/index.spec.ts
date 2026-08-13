import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as AgentInteraction from './index';

type ParseSchema = {
  parse(input: unknown): unknown;
};

const exportedSchema = (name: string): ParseSchema => {
  const value = (AgentInteraction as unknown as Record<string, unknown>)[name];

  expect(value, `${name} should be exported`).toMatchObject({
    parse: expect.any(Function),
  });

  return value as ParseSchema;
};

const agent = {
  agentDefinitionKey: 'operator',
  agentVersionId: 'version-1',
  displayName: 'KidItem Operator',
  description: 'KidItem operations agent',
  isDefault: true,
} as const;

const session = {
  sessionId: 'session-1',
  copilotThreadId: 'thread-1',
  primaryAgentDefinitionKey: 'operator',
  primaryAgentVersionId: 'version-1',
  lifecycle: 'active',
  updatedAt: '2026-08-13T00:00:00.000Z',
} as const;

const dashboardContext = {
  routeKey: 'analytics.dashboard',
  resourceRefs: [{ kind: 'product', id: 'product-1', version: '7' }],
  filters: { status: ['ready'], page: 2, active: true },
  visibleRowIds: ['product-1'],
  aggregateSummary: { total: 1, sampled: true, note: null },
  locale: 'ko-KR',
  timezone: 'Asia/Seoul',
} as const;

const runAuthorization = {
  session,
  sessionTaskId: 'task-1',
  executionId: 'execution-1',
  modelIdentity: 'gpt-5',
  runtimeType: 'ag_ui',
  policySnapshotId: 'policy-1',
  contextEpoch: 1,
  dashboardContext,
} as const;

const userMessageEvent = {
  eventId: 'event-1',
  sessionId: 'session-1',
  executionId: 'execution-1',
  sequence: '1',
  eventType: 'user_message',
  schemaVersion: 1,
  payload: { messageId: 'message-1', content: '재고 현황 알려줘' },
  createdAt: '2026-08-13T00:00:00.000Z',
} as const;

const replay = {
  sessionId: 'session-1',
  events: [userMessageEvent],
  nextCursor: 'opaque-replay-cursor',
  lastSequence: '1',
} as const;

const connectionAuthorization = {
  session,
  contextEpoch: 1,
  replay: { ...replay, nextCursor: null },
  liveJoinToken: 'live-join-token-that-is-at-least-32-bytes',
  liveJoinExpiresAt: '2026-08-13T00:00:15.000Z',
  currentExecution: null,
} as const;

describe('agent interaction contracts', () => {
  it('strips untrusted browser authority while accepting canonical dashboard context', () => {
    const context = AgentInteraction.DashboardContextSchema.parse({
      ...dashboardContext,
      organizationId: 'attacker-org',
      permissions: ['admin'],
    });

    expect(context).toEqual(dashboardContext);
    expect(context).not.toHaveProperty('organizationId');
    expect(context).not.toHaveProperty('permissions');
  });

  it('requires every server-derived principal field and rejects added authority', () => {
    expect(
      AgentInteraction.InteractionPrincipalSchema.parse({
        principalKey: 'principal-1',
        userId: 'user-1',
        organizationId: 'org-1',
      }),
    ).toEqual({
      principalKey: 'principal-1',
      userId: 'user-1',
      organizationId: 'org-1',
    });

    for (const invalidPrincipal of [
      { userId: 'user-1', organizationId: 'org-1' },
      { principalKey: 'principal-1', organizationId: 'org-1' },
      { principalKey: 'principal-1', userId: 'user-1' },
      {
        principalKey: 'principal-1',
        userId: 'user-1',
        organizationId: 'org-1',
        permissions: ['admin'],
      },
    ]) {
      expect(() =>
        AgentInteraction.InteractionPrincipalSchema.parse(invalidPrincipal),
      ).toThrow();
    }
  });

  it('bootstraps allowed agents and existing sessions without thread targets', () => {
    const schema = AgentInteraction.InteractionBootstrapSchema;

    expect(
      schema.parse({
        defaultAgentDefinitionKey: 'operator',
        agents: [agent],
        sessions: [session],
      }),
    ).toEqual(expect.objectContaining({ sessions: [session] }));

    expect(() =>
      schema.parse({
        defaultAgentDefinitionKey: 'operator',
        agents: [agent],
        sessions: [],
        threadTargets: [],
      }),
    ).toThrow();
  });

  it('requires exactly one matching default agent', () => {
    const schema = AgentInteraction.InteractionBootstrapSchema;
    const bootstrap = {
      defaultAgentDefinitionKey: 'operator',
      agents: [agent],
      sessions: [session],
    };

    for (const invalidBootstrap of [
      {
        ...bootstrap,
        agents: [{ ...agent, isDefault: false }],
      },
      {
        ...bootstrap,
        agents: [agent, { ...agent, agentVersionId: 'version-2' }],
      },
      { ...bootstrap, defaultAgentDefinitionKey: 'analyst' },
    ]) {
      expect(() => schema.parse(invalidBootstrap)).toThrow(
        'bootstrap requires exactly one matching default agent',
      );
    }
  });

  it('preserves unique composite allowed-agent identities', () => {
    expect(() =>
      AgentInteraction.InteractionBootstrapSchema.parse({
        defaultAgentDefinitionKey: 'operator',
        agents: [agent, { ...agent, isDefault: false }],
        sessions: [],
      }),
    ).toThrow('bootstrap requires unique allowed-agent identities');

    expect(
      AgentInteraction.InteractionBootstrapSchema.parse({
        defaultAgentDefinitionKey: 'operator',
        agents: [
          agent,
          { ...agent, agentVersionId: 'version-2', isDefault: false },
        ],
        sessions: [],
      }),
    ).toBeTruthy();
  });

  it('rejects retired allowed-agent fields and invalid session summaries', () => {
    expect(() =>
      AgentInteraction.AllowedAgentSchema.parse({
        ...agent,
        supportsQuickAsk: true,
      }),
    ).toThrow();

    const schema = exportedSchema('AgentSessionSummarySchema');
    expect(schema.parse(session)).toEqual(session);

    for (const invalidSession of [
      { ...session, sessionId: '' },
      { ...session, lifecycle: 'deleted' },
      { ...session, updatedAt: 'tomorrow' },
      { ...session, organizationId: 'attacker-org' },
    ]) {
      expect(() => schema.parse(invalidSession)).toThrow();
    }
  });

  it('accepts only the strict opaque run-intent contract', () => {
    const schema = exportedSchema('AguiRunIntentSchema');
    const intent = {
      runIntent: 'run-intent-token-that-is-at-least-32-bytes',
      expiresAt: '2026-08-13T00:00:30.000Z',
      copilotThreadId: 'thread-1',
      aguiRunId: 'run-1',
    };

    expect(schema.parse(intent)).toEqual(intent);
    expect(() => schema.parse({ ...intent, runIntent: 'too-short' })).toThrow();
    expect(() => schema.parse({ ...intent, expiresAt: 'tomorrow' })).toThrow();
    expect(() => schema.parse({ ...intent, copilotThreadId: '' })).toThrow();
    expect(() => schema.parse({ ...intent, archive: null })).toThrow();
    expect(() =>
      schema.parse({ ...intent, preparationToken: intent.runIntent }),
    ).toThrow();
  });

  it('requires a non-null session and root task for run authorization', () => {
    const schema = AgentInteraction.AguiRunAuthorizationSchema;

    expect(schema.parse(runAuthorization)).toEqual(runAuthorization);
    expect(() =>
      schema.parse({ ...runAuthorization, sessionTaskId: null }),
    ).toThrow();
    expect(() => schema.parse({ ...runAuthorization, session: null })).toThrow();
    expect(() => schema.parse({ ...runAuthorization, contextEpoch: 0 })).toThrow();
  });

  it('requires explicit model/runtime/policy identity and rejects added run authority', () => {
    const schema = AgentInteraction.AguiRunAuthorizationSchema;

    for (const key of ['modelIdentity', 'runtimeType', 'policySnapshotId'] as const) {
      expect(() => schema.parse({ ...runAuthorization, [key]: '' })).toThrow();
    }

    for (const extraAuthority of [
      { organizationId: 'attacker-org' },
      { permissions: ['admin'] },
      { interactionClass: 'official_task' },
      { binding: { id: 'binding-1' } },
    ]) {
      expect(() =>
        schema.parse({ ...runAuthorization, ...extraAuthority }),
      ).toThrow();
    }
  });

  it('requires complete correlation and defaults a missing attempt id to null', () => {
    const schema = AgentInteraction.AgentCorrelationSchema;
    const correlation = {
      copilotThreadId: 'thread-1',
      aguiRunId: 'run-1',
      executionId: 'execution-1',
      sessionId: 'session-1',
      sessionTaskId: 'task-1',
      operationsRunId: null,
    };

    expect(schema.parse(correlation)).toEqual({ ...correlation, attemptId: null });
    expect(() => schema.parse({ ...correlation, sessionId: null })).toThrow();
    expect(() => schema.parse({ ...correlation, sessionTaskId: null })).toThrow();
    expect(() => schema.parse({ ...correlation, attemptId: '' })).toThrow();
    expect(() => schema.parse({ ...correlation, attemptId: 1 })).toThrow();
    expect(() =>
      schema.parse({ ...correlation, taskId: 'legacy-task-1' }),
    ).toThrow();
  });

  it('validates all version-1 event discriminants against bounded payloads', () => {
    const schema = exportedSchema('AgentConversationEventEnvelopeSchema');
    const eventVariants = [
      userMessageEvent,
      {
        ...userMessageEvent,
        eventId: 'event-2',
        sequence: '2',
        eventType: 'assistant_message',
        payload: { messageId: 'message-2', content: '재고는 10개입니다.' },
      },
      {
        ...userMessageEvent,
        eventId: 'event-3',
        executionId: null,
        sequence: '3',
        eventType: 'system_notice',
        payload: { code: 'session_resumed', content: '세션이 재개되었습니다.' },
      },
      {
        ...userMessageEvent,
        eventId: 'event-4',
        sequence: '4',
        eventType: 'tool_activity',
        payload: {
          toolCallId: 'tool-call-1',
          toolName: 'inventory.lookup',
          status: 'started',
        },
      },
      {
        ...userMessageEvent,
        eventId: 'event-5',
        sequence: '5',
        eventType: 'state_snapshot',
        payload: {
          snapshotType: 'conversation_summary',
          snapshotVersion: 1,
          data: { content: '요약된 대화 상태' },
        },
      },
      {
        ...userMessageEvent,
        eventId: 'event-6',
        sequence: '6',
        eventType: 'hitl_request',
        payload: {
          requestId: 'request-1',
          status: 'pending',
          prompt: '변경을 승인할까요?',
        },
      },
      {
        ...userMessageEvent,
        eventId: 'event-7',
        sequence: '7',
        eventType: 'hitl_decision',
        payload: { requestId: 'request-1', decision: 'approved' },
      },
      {
        ...userMessageEvent,
        eventId: 'event-8',
        sequence: '8',
        eventType: 'run_terminal',
        payload: { status: 'completed', errorCode: null },
      },
    ];

    for (const event of eventVariants) {
      expect(schema.parse(event)).toEqual(event);
    }
  });

  it('accepts only canonical positive decimal event sequences', () => {
    const schema = exportedSchema('AgentConversationEventEnvelopeSchema');

    for (const sequence of [1, 0, '0', '-1', '01', '+1', '1.0']) {
      expect(() => schema.parse({ ...userMessageEvent, sequence })).toThrow();
    }
  });

  it('rejects unknown event types, versions, mismatched payloads, and timestamps', () => {
    const schema = exportedSchema('AgentConversationEventEnvelopeSchema');

    expect(() =>
      schema.parse({ ...userMessageEvent, eventType: 'unknown_event' }),
    ).toThrow();
    expect(() => schema.parse({ ...userMessageEvent, schemaVersion: 2 })).toThrow();
    expect(() =>
      schema.parse({
        ...userMessageEvent,
        payload: { code: 'wrong_payload', content: 'not a message' },
      }),
    ).toThrow();
    expect(() =>
      schema.parse({ ...userMessageEvent, createdAt: 'yesterday' }),
    ).toThrow();
    expect(() =>
      schema.parse({ ...userMessageEvent, organizationId: 'attacker-org' }),
    ).toThrow();
  });

  it('validates versioned event content independently before persistence assigns envelope fields', () => {
    const schema = exportedSchema('AgentConversationEventContentSchema');

    expect(
      schema.parse({
        eventType: 'assistant_message',
        schemaVersion: 1,
        payload: { messageId: 'message-2', content: '재고는 10개입니다.' },
      }),
    ).toEqual({
      eventType: 'assistant_message',
      schemaVersion: 1,
      payload: { messageId: 'message-2', content: '재고는 10개입니다.' },
    });
    expect(() =>
      schema.parse({
        eventType: 'assistant_message',
        schemaVersion: 1,
        payload: { code: 'wrong_payload', content: 'not a message' },
      }),
    ).toThrow();
    expect(() =>
      schema.parse({
        eventType: 'assistant_message',
        schemaVersion: 2,
        payload: { messageId: 'message-2', content: 'unsupported' },
      }),
    ).toThrow();
  });

  it('requires durable message and tool-call correlation for tool results', () => {
    const schema = exportedSchema('AgentConversationEventContentSchema');
    expect(schema.parse({
      eventType: 'state_snapshot',
      schemaVersion: 1,
      payload: {
        snapshotType: 'tool_result',
        snapshotVersion: 1,
          data: {
            messageId: 'tool-message-1',
            toolCallId: 'tool-call-1',
            result: {
              kind: 'notice',
              title: '완료',
              body: '도구 실행이 완료되었습니다.',
              tone: 'info',
              textFallback: '도구 실행이 완료되었습니다.',
            },
        },
      },
    }).payload.data).toMatchObject({
      messageId: 'tool-message-1',
      toolCallId: 'tool-call-1',
    });
    expect(() => schema.parse({
      eventType: 'state_snapshot',
      schemaVersion: 1,
      payload: {
        snapshotType: 'tool_result',
        snapshotVersion: 1,
        data: {
          result: {
            kind: 'notice',
            title: '완료',
            body: '도구 실행이 완료되었습니다.',
            tone: 'info',
            textFallback: '도구 실행이 완료되었습니다.',
          },
        },
      },
    })).toThrow();
  });

  it('models assistant message streams as one start, ordered deltas, and one end', () => {
    const schema = exportedSchema('AgentConversationEventContentSchema');
    for (const payload of [
      { phase: 'start', messageId: 'assistant-1' },
      { phase: 'delta', messageId: 'assistant-1', content: '첫 ' },
      { phase: 'delta', messageId: 'assistant-1', content: '응답' },
      { phase: 'end', messageId: 'assistant-1' },
    ]) {
      expect(schema.parse({
        eventType: 'assistant_message', schemaVersion: 1, payload,
      }).payload).toEqual(payload);
    }
    expect(() => schema.parse({
      eventType: 'assistant_message', schemaVersion: 1,
      payload: { phase: 'end', messageId: 'assistant-1', content: 'forged' },
    })).toThrow();
    expect(() => schema.parse({
      eventType: 'assistant_message', schemaVersion: 1,
      payload: { phase: 'delta', messageId: 'assistant-1' },
    })).toThrow();
  });

  it('returns bounded replay with opaque cursors and lossless decimal sequences', () => {
    const schema = exportedSchema('AgentConversationReplaySchema');

    expect(schema.parse(replay)).toEqual(replay);
    expect(
      schema.parse({
        sessionId: 'session-1',
        events: [],
        nextCursor: null,
        lastSequence: '0',
      }),
    ).toBeTruthy();

    for (const lastSequence of [-1, '-1', '01', 1]) {
      expect(() => schema.parse({ ...replay, lastSequence })).toThrow();
    }
    expect(() => schema.parse({ ...replay, nextCursor: 'short' })).toThrow();
  });

  it('accepts only an opaque browser replay cursor and no decoded authority', () => {
    const schema = exportedSchema('AgentConversationReplayRequestSchema');

    expect(
      schema.parse({
        copilotThreadId: 'thread-1',
        cursor: 'opaque-replay-cursor',
      }),
    ).toEqual({
      copilotThreadId: 'thread-1',
      cursor: 'opaque-replay-cursor',
    });
    expect(
      schema.parse({ copilotThreadId: 'thread-1', cursor: null }),
    ).toBeTruthy();

    for (const decodedAuthority of [
      { afterSequence: '1' },
      { sequence: '1' },
      { organizationId: 'attacker-org' },
      { userId: 'attacker-user' },
      { sessionId: 'claimed-session' },
    ]) {
      expect(() =>
        schema.parse({
          copilotThreadId: 'thread-1',
          cursor: 'opaque-replay-cursor',
          ...decodedAuthority,
        }),
      ).toThrow();
    }
  });

  it('keeps connection authorization read-only and session-scoped', () => {
    const schema = AgentInteraction.AguiConnectionAuthorizationSchema;

    expect(schema.parse(connectionAuthorization)).toEqual(connectionAuthorization);
    expect(
      schema.parse({
        ...connectionAuthorization,
        replay: { ...replay, nextCursor: 'opaque-replay-cursor' },
        liveJoinToken: null,
        liveJoinExpiresAt: null,
      }),
    ).toBeTruthy();

    for (const invalidAuthorization of [
      { ...connectionAuthorization, contextEpoch: 0 },
      { ...connectionAuthorization, liveJoinToken: 'short' },
      { ...connectionAuthorization, liveJoinExpiresAt: 'later' },
      { ...connectionAuthorization, executionId: 'execution-1' },
      { ...connectionAuthorization, sessionTaskId: 'task-1' },
      { ...connectionAuthorization, modelIdentity: 'gpt-5' },
      { ...connectionAuthorization, policySnapshotId: 'policy-1' },
      { ...connectionAuthorization, capabilityIds: ['inventory.read'] },
      { ...connectionAuthorization, interactionClass: 'official_task' },
    ]) {
      expect(() => schema.parse(invalidAuthorization)).toThrow();
    }
  });

  it('carries only the canonical current execution grant needed after a gateway restart', () => {
    const parsed = AgentInteraction.AguiConnectionAuthorizationSchema.parse({
      ...connectionAuthorization,
      currentExecution: {
        agentDefinitionKey: 'operator',
        sessionId: 'session-1',
        executionId: '11111111-1111-4111-8111-111111111111',
        copilotThreadId: 'thread-1',
        aguiRunId: 'run-1',
        status: 'running',
        attempt: 1,
      },
    });

    expect(parsed.currentExecution).toEqual(expect.objectContaining({
      executionId: '11111111-1111-4111-8111-111111111111',
      status: 'running',
      attempt: 1,
    }));
    expect(() => AgentInteraction.AguiConnectionAuthorizationSchema.parse({
      ...connectionAuthorization,
      currentExecution: {
        ...parsed.currentExecution,
        runtimeType: 'private-runtime',
      },
    })).toThrow();
  });

  it('removes all retired dual-lifecycle production identifiers', () => {
    const productionSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const retiredIdentifiers = [
      /\bInteractionClass(?:Schema)?\b/,
      /\bInteractionThreadTarget(?:Schema)?\b/,
      /\bThreadBinding(?:Schema)?\b/,
      /\binteractionClass\b/,
      /\bidleExpiresAt\b/,
      /\bAguiThreadArchiveCommand(?:Schema)?\b/,
      /\bAguiRunPreparation(?:Schema)?\b/,
      /\bpreparationToken\b/,
      /\bsupportsQuickAsk\b/,
      /\bthreadTargets\b/,
    ];

    for (const retiredIdentifier of retiredIdentifiers) {
      expect(productionSource).not.toMatch(retiredIdentifier);
    }
  });
});

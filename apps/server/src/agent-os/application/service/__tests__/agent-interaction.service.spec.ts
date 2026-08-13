import { describe, expect, it, vi } from 'vitest';
import type {
  AgentConversationRecord,
  AgentMessageRecord,
  AgentRunRecord,
  AgentRunRequestRecord,
} from '../../../domain/agent-os.types';
import { AgentInteractionService } from '../agent-interaction.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-08-10T00:00:00.000Z');

function conversationRecord(
  overrides: Partial<AgentConversationRecord> = {},
): AgentConversationRecord {
  return {
    id: 'conversation-1',
    organizationId: ORGANIZATION_ID,
    title: '추천 근거를 설명해줘',
    status: 'active',
    createdByUserId: USER_ID,
    rootRequestId: null,
    lastMessageAt: NOW,
    metadata: { surface: 'sourcing_dashboard', agentType: 'sourcing' },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function messageRecord(
  role: AgentMessageRecord['role'],
  overrides: Partial<AgentMessageRecord> = {},
): AgentMessageRecord {
  return {
    id: role === 'user' ? 'message-user' : 'message-assistant',
    organizationId: ORGANIZATION_ID,
    conversationId: 'conversation-1',
    role,
    content: role === 'user' ? '추천 근거를 설명해줘' : '근거가 있는 답변',
    agentInstanceId: null,
    requestId: null,
    runId: null,
    metadata: {},
    createdAt: NOW,
    ...overrides,
  };
}

function requestRecord(): AgentRunRequestRecord {
  return {
    id: 'request-1',
    organizationId: ORGANIZATION_ID,
    agentInstanceId: 'instance-1',
    taskSessionId: 'session-1',
    conversationId: 'conversation-1',
    initiatedByMessageId: 'message-user',
    parentRequestId: null,
    delegatedByRunId: null,
    playbookKey: 'sourcing_workspace_question_v1',
    planStepKey: 'sourcing_agent',
    displayName: 'Sourcing Agent',
    statusReason: null,
    dependencyKeys: [],
    source: 'sourcing_dashboard',
    triggerDetail: null,
    reason: null,
    idempotencyKey: null,
    priority: 0,
    sourceWorkflowRunId: null,
    sourceWorkflowNodeId: null,
    sourceResourceType: 'sourcing_workspace',
    sourceResourceId: 'entry',
    requestedByUserId: USER_ID,
    requestedByActorType: 'user',
    requestedByActorId: USER_ID,
    payload: {},
    status: 'succeeded',
    scheduledFor: NOW,
    claimedAt: NOW,
    claimedBy: 'agent-runner-inline',
    attempts: 1,
    maxAttempts: 1,
    finishedAt: NOW,
    coalescedIntoRequestId: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: NOW,
    updatedAt: NOW,
    taskKey: 'conversation:conversation-1:message:message-user',
    agentType: 'sourcing',
    adapterType: 'codex_cli',
    latestRunId: 'run-1',
  };
}

function runRecord(
  overrides: Partial<AgentRunRecord> = {},
): AgentRunRecord {
  return {
    id: 'run-1',
    organizationId: ORGANIZATION_ID,
    agentInstanceId: 'instance-1',
    requestId: 'request-1',
    taskSessionId: 'session-1',
    retryOfRunId: null,
    status: 'succeeded',
    attempt: 1,
    invocationSource: 'sourcing_dashboard',
    adapterType: 'codex_cli',
    model: 'gpt-5.6-sol',
    provider: 'codex_cli',
    taskKey: 'conversation:conversation-1:message:message-user',
    startedAt: NOW,
    finishedAt: NOW,
    errorCode: null,
    errorMessage: null,
    output: { text: '근거가 있는 답변' },
    lastEventSeq: 3,
    ...overrides,
  };
}

function interactionInput(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: ORGANIZATION_ID,
    userId: USER_ID,
    agentType: 'sourcing' as const,
    surface: 'sourcing_dashboard' as const,
    content: '추천 근거를 설명해줘',
    sourceResourceType: 'sourcing_workspace' as const,
    sourceResourceId: 'entry',
    executionMode: 'inline' as const,
    maxAttempts: 1 as const,
    ...overrides,
  };
}

function buildService() {
  const repository = {
    createConversation: vi.fn().mockResolvedValue(conversationRecord()),
    findConversationById: vi.fn().mockResolvedValue(conversationRecord()),
    createMessage: vi
      .fn()
      .mockResolvedValueOnce(messageRecord('user'))
      .mockResolvedValueOnce(messageRecord('assistant')),
    updateConversationRootRequest: vi.fn().mockResolvedValue(undefined),
    findRunRequestById: vi.fn().mockResolvedValue(requestRecord()),
    findRunByRequestId: vi.fn().mockResolvedValue(runRecord()),
  };
  const runner = {
    runByType: vi.fn().mockResolvedValue({
      ok: true,
      requestId: 'request-1',
      agentInstanceId: 'instance-1',
      status: 'pending',
    }),
    executeRequest: vi.fn().mockResolvedValue({
      executed: true,
      requestId: 'request-1',
      runId: 'run-1',
    }),
  };
  return {
    repository,
    runner,
    service: new AgentInteractionService(repository as never, runner as never),
  };
}

describe('AgentInteractionService', () => {
  it('runs one direct sourcing interaction inline and stores both messages', async () => {
    const { service, repository, runner } = buildService();

    const result = await service.interact(interactionInput());

    expect(runner.runByType).toHaveBeenCalledWith(
      'sourcing',
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        sourceType: 'sourcing_dashboard',
        conversationId: 'conversation-1',
        initiatedByMessageId: 'message-user',
        playbookKey: 'sourcing_workspace_question_v1',
        maxAttempts: 1,
      }),
    );
    expect(runner.executeRequest).toHaveBeenCalledTimes(1);
    expect(repository.createMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        conversationId: 'conversation-1',
        role: 'assistant',
        requestId: 'request-1',
        runId: 'run-1',
        content: '근거가 있는 답변',
      }),
    );
    expect(repository.updateConversationRootRequest).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      conversationId: 'conversation-1',
      rootRequestId: 'request-1',
    });
    expect(result).toMatchObject({
      status: 'succeeded',
      runId: 'run-1',
      provider: 'codex_cli',
      model: 'gpt-5.6-sol',
    });
  });

  it('does not attach a dashboard message to another users conversation', async () => {
    const { service, repository } = buildService();
    repository.findConversationById.mockResolvedValue({
      ...conversationRecord(),
      createdByUserId: 'different-user',
    });

    await expect(
      service.interact(
        interactionInput({ conversationId: 'conversation-1' }),
      ),
    ).rejects.toMatchObject({ code: 'conversation_not_accessible' });
    expect(repository.createMessage).not.toHaveBeenCalled();
  });

  it('records an explicitly classified fallback assistant message', async () => {
    const { service, repository } = buildService();

    await service.recordAssistantMessage({
      organizationId: ORGANIZATION_ID,
      conversationId: 'conversation-1',
      requestId: 'request-1',
      runId: 'run-1',
      content: '조회 결과만 제공합니다.',
      metadata: { fallback: true },
    });

    expect(repository.createMessage).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      conversationId: 'conversation-1',
      role: 'assistant',
      requestId: 'request-1',
      runId: 'run-1',
      content: '조회 결과만 제공합니다.',
      metadata: { fallback: true },
    });
  });
});

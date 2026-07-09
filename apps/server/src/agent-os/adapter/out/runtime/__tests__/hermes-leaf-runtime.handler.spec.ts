import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentRuntimeExecutionContext } from '../../../../application/port/out/runtime/agent-runtime.port';
import type { AgentOsRepositoryPort } from '../../../../application/port/out/repository/agent-os-repository.port';
import type { AgentRuntimeHandlerRegistry } from '../../../../application/service/agent-runtime-handler-registry.service';
import type { OperatorContextBuilder } from '../../../../application/service/operator-context-builder.service';
import { AgentOsRuntimeError } from '../../../../domain/agent-os.errors';
import type { HermesOperatorRuntimeAdapter } from '../hermes-operator-runtime.adapter';
import { HermesLeafRuntimeHandler } from '../hermes-leaf-runtime.handler';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function runtimeContext(
  overrides: Partial<AgentRuntimeExecutionContext> = {},
): AgentRuntimeExecutionContext {
  const { input: inputOverrides, ...contextOverrides } = overrides;
  return {
    organizationId: 'org-1',
    agentInstanceId: 'agent-sourcing-1',
    agentType: 'sourcing',
    requestId: 'request-sourcing-1',
    runId: 'run-sourcing-1',
    taskSessionId: 'session-sourcing-1',
    taskKey: 'sourcing',
    adapterType: 'hermes',
    model: 'gpt-5.5',
    modelPlan: { primary: 'gpt-5.5' },
    promptPath: 'agent-config/prompts/agents/sourcing.md',
    input: {
      conversationId: 'conversation-1',
      sourceUrl: 'https://detail.1688.com/offer/123.html',
      requestedByUserId: 'user-1',
      ...(inputOverrides ?? {}),
    },
    trustLevel: 1,
    runtimeConfig: {},
    ...contextOverrides,
  };
}

function makeHandler() {
  const registry = {
    register: vi.fn(),
  } as unknown as AgentRuntimeHandlerRegistry;
  const hermesRuntime = {
    decide: vi.fn().mockResolvedValue({
      provider: 'hermes',
      rawOutput: 'done',
      stderr: '',
      durationMs: 100,
    }),
  } as unknown as HermesOperatorRuntimeAdapter;
  const repository = {
    listRunEvents: vi.fn().mockResolvedValue([]),
    getTaskSession: vi.fn().mockResolvedValue({
      metadata: { runtimeThreadId: 'leaf-session-existing' },
    }),
    updateTaskSessionMetadata: vi.fn().mockResolvedValue({}),
  } as unknown as AgentOsRepositoryPort;
  const contextBuilder = {
    build: vi.fn().mockResolvedValue({
      conversation: { id: 'conversation-1' },
      activeUserMessage: '1688 URL을 수집해줘',
      runGraph: { nodes: [], artifacts: [], toolInvocations: [] },
    }),
  } as unknown as OperatorContextBuilder;

  return {
    registry,
    hermesRuntime,
    repository,
    contextBuilder,
    handler: new HermesLeafRuntimeHandler(
      registry,
      hermesRuntime,
      repository,
      contextBuilder,
    ),
  };
}

function runEvent(
  overrides: Partial<
    Awaited<ReturnType<AgentOsRepositoryPort['listRunEvents']>>[number]
  > = {},
): Awaited<ReturnType<AgentOsRepositoryPort['listRunEvents']>>[number] {
  return {
    id: 'event-1',
    organizationId: 'org-1',
    runId: 'run-sourcing-1',
    agentInstanceId: 'agent-sourcing-1',
    seq: 1,
    type: 'leaf.debug',
    level: 'info',
    stream: null,
    message: null,
    data: {},
    logRef: null,
    createdAt: new Date('2026-06-23T00:00:00.000Z'),
    ...overrides,
  };
}

describe('HermesLeafRuntimeHandler', () => {
  it('registers only configured non-Operator leaf agent types', () => {
    process.env.AGENT_OS_HERMES_LEAF_AGENT_TYPES = 'sourcing,listing,manager';
    const { handler, registry } = makeHandler();

    handler.onModuleInit();

    expect(registry.register).toHaveBeenCalledWith('sourcing', handler);
    expect(registry.register).toHaveBeenCalledWith('listing', handler);
    expect(registry.register).not.toHaveBeenCalledWith('manager', handler);
  });

  it('fails closed when Hermes Leaf exits without agent_os_finalize_task', async () => {
    process.env.AGENT_OS_HERMES_MODEL = 'gpt-5.5';
    const { handler, repository } = makeHandler();
    vi.mocked(repository.listRunEvents).mockResolvedValue([]);

    await expect(handler.execute(runtimeContext())).rejects.toMatchObject({
      name: 'AgentOsRuntimeError',
      code: 'operator_runtime_finalization_missing',
    });
  });

  it('fails the run when Hermes Leaf finalizes with failed status', async () => {
    process.env.AGENT_OS_HERMES_MODEL = 'gpt-5.5';
    const { handler, repository } = makeHandler();
    vi.mocked(repository.listRunEvents).mockResolvedValue([
      {
        id: 'event-finalize-1',
        type: 'agent_os.task_finalized',
        data: {
          finalizationTool: 'agent_os_finalize_task',
          status: 'failed',
          artifactIds: [],
          summary: {},
          error: { message: 'scrape failed' },
        },
      },
    ] as Awaited<ReturnType<AgentOsRepositoryPort['listRunEvents']>>);

    await expect(handler.execute(runtimeContext())).rejects.toMatchObject({
      name: 'AgentOsRuntimeError',
      code: 'operator_runtime_failed',
      message: 'scrape failed',
    });
  });

  it('returns only KidItem-finalized output when Hermes Leaf succeeds', async () => {
    process.env.AGENT_OS_HERMES_MODEL = 'gpt-5.5';
    const { handler, hermesRuntime, repository } = makeHandler();
    vi.mocked(repository.listRunEvents).mockResolvedValue([
      {
        id: 'event-finalize-1',
        type: 'agent_os.task_finalized',
        data: {
          finalizationTool: 'agent_os_finalize_task',
          status: 'succeeded',
          artifactIds: ['artifact-sourcing-1'],
          summary: { message: 'collected' },
        },
      },
    ] as Awaited<ReturnType<AgentOsRepositoryPort['listRunEvents']>>);

    await expect(handler.execute(runtimeContext())).resolves.toEqual({
      provider: 'hermes',
      output: {
        status: 'succeeded',
        artifactIds: ['artifact-sourcing-1'],
        summary: { message: 'collected' },
        finalizationEventId: 'event-finalize-1',
      },
      logExcerpt: 'done',
    });
    expect(hermesRuntime.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'sourcing',
        conversationId: 'conversation-1',
        enableKidItemMcp: true,
        model: 'gpt-5.5',
        prompt: expect.stringContaining('Leaf Agent'),
      }),
    );
  });

  it('reconciles a Hermes Leaf timeout after KidItem finalization', async () => {
    process.env.AGENT_OS_HERMES_MODEL = 'gpt-5.5';
    const { handler, hermesRuntime, repository } = makeHandler();
    vi.mocked(hermesRuntime.decide).mockRejectedValue(
      new AgentOsRuntimeError(
        'operator_runtime_timeout',
        'Hermes Operator runtime timed out.',
      ),
    );
    vi.mocked(repository.listRunEvents).mockResolvedValue([
      runEvent({
        id: 'event-finalize-timeout-1',
        type: 'agent_os.task_finalized',
        data: {
          finalizationTool: 'agent_os_finalize_task',
          status: 'succeeded',
          artifactIds: ['artifact-sourcing-1'],
          summary: { message: 'leaf completed before timeout' },
        },
      }),
    ]);

    await expect(handler.execute(runtimeContext())).resolves.toEqual({
      provider: 'hermes',
      output: {
        status: 'succeeded',
        artifactIds: ['artifact-sourcing-1'],
        summary: { message: 'leaf completed before timeout' },
        finalizationEventId: 'event-finalize-timeout-1',
      },
      logExcerpt: '',
    });
  });

  it('resumes and persists Hermes session ids for Leaf turns', async () => {
    const { handler, hermesRuntime, repository } = makeHandler();
    vi.mocked(repository.getTaskSession).mockResolvedValue({
      metadata: { runtimeThreadId: 'leaf-session-existing' },
    } as Awaited<ReturnType<AgentOsRepositoryPort['getTaskSession']>>);
    vi.mocked(hermesRuntime.decide).mockResolvedValue({
      provider: 'hermes',
      rawOutput: 'finalized through MCP',
      stderr: '',
      durationMs: 51,
      sessionId: 'leaf-session-next',
    });
    vi.mocked(repository.listRunEvents).mockResolvedValue([
      runEvent({
        type: 'agent_os.task_finalized',
        data: {
          finalizationTool: 'agent_os_finalize_task',
          status: 'succeeded',
          artifactIds: [],
          summary: { message: 'leaf done' },
        },
      }),
    ]);

    await handler.execute(runtimeContext());

    expect(hermesRuntime.decide).toHaveBeenCalledWith(
      expect.objectContaining({ resumeSessionId: 'leaf-session-existing' }),
    );
    expect(repository.updateTaskSessionMetadata).toHaveBeenCalledWith({
      organizationId: 'org-1',
      taskSessionId: 'session-sourcing-1',
      metadata: { runtimeThreadId: 'leaf-session-next' },
    });
  });

  it('returns Hermes usage fields for Leaf runtime cost events', async () => {
    const { handler, hermesRuntime, repository } = makeHandler();
    vi.mocked(hermesRuntime.decide).mockResolvedValue({
      provider: 'hermes',
      rawOutput: 'finalized through MCP',
      stderr: '',
      durationMs: 64,
      sessionId: 'leaf-usage-session',
      inputTokens: 200,
      outputTokens: 50,
      cachedInputTokens: 20,
      costMicros: 4300n,
    });
    vi.mocked(repository.listRunEvents).mockResolvedValue([
      runEvent({
        type: 'agent_os.task_finalized',
        data: {
          finalizationTool: 'agent_os_finalize_task',
          status: 'succeeded',
          artifactIds: [],
          summary: { message: 'leaf done' },
        },
      }),
    ]);

    const result = await handler.execute(runtimeContext());

    expect(result).toMatchObject({
      provider: 'hermes',
      inputTokens: 200,
      outputTokens: 50,
      cachedInputTokens: 20,
      costMicros: 4300n,
    });
  });
});

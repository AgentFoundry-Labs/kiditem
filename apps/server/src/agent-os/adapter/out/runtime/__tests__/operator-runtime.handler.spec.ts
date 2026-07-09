import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentRuntimeExecutionContext } from '../../../../application/port/out/runtime/agent-runtime.port';
import type { AgentOsRepositoryPort } from '../../../../application/port/out/repository/agent-os-repository.port';
import type { OperatorContextBuilder } from '../../../../application/service/operator-context-builder.service';
import { OperatorDecisionExecutor } from '../../../../application/service/operator-decision-executor.service';
import { OperatorDecisionParser } from '../../../../application/service/operator-decision-parser.service';
import type { AgentRuntimeHandlerRegistry } from '../../../../application/service/agent-runtime-handler-registry.service';
import { AgentTaskDelegationService } from '../../../../application/service/agent-task-delegation.service';
import { AgentOsRuntimeError } from '../../../../domain/agent-os.errors';
import type { HermesOperatorRuntimeAdapter } from '../hermes-operator-runtime.adapter';
import type { OpenAiResponsesOperatorRuntimeAdapter } from '../openai-responses-operator-runtime.adapter';
import { OperatorRuntimeHandler } from '../operator-runtime.handler';

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
    agentInstanceId: 'agent-operator-1',
    agentType: 'manager',
    requestId: 'request-operator-1',
    runId: 'run-operator-1',
    taskSessionId: 'session-1',
    taskKey: 'conversation:conversation-1',
    adapterType: 'claude_local',
    model: 'gpt-5.1-codex',
    modelPlan: { primary: 'gpt-5.1-codex' },
    promptPath: 'agent-config/prompts/agents/manager.md',
    input: {
      conversationId: 'conversation-1',
      requestedByUserId: 'user-1',
      userMessage: '실리콘 식판 찾아줘',
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
  const delegation = {
    delegate: vi.fn().mockResolvedValue({
      ok: true,
      requestId: 'request-sourcing-1',
      agentType: 'sourcing',
      status: 'pending',
    }),
  } as unknown as AgentTaskDelegationService;
  const contextBuilder = {
    build: vi.fn().mockResolvedValue({
      instructionText: 'Return strict JSON.',
      conversation: { id: 'conversation-1', title: '실리콘 식판', rootRequestId: 'request-operator-1' },
      rootRequest: {
        id: 'request-operator-1',
        agentType: 'manager',
        status: 'claimed',
        playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
        planStepKey: 'operator',
        displayName: 'Operator',
        payload: {},
      },
      activeUserMessage: '실리콘 식판 찾아줘',
      recentMessages: [],
      runGraph: { nodes: [], artifacts: [], toolInvocations: [] },
      liveReadiness: {
        checks: [],
        allReady: false,
        runnableCapabilities: ['operator_runtime'],
        blockedCapabilities: ['channels.submit_coupang_listing'],
      },
      allowedTargetAgents: [],
      allowedPlaybooks: [],
      capabilitySummaries: [],
      policy: {
        allowedDecisionTypes: ['delegate', 'ask_user', 'refuse'],
        allowedTargetAgentTypes: ['sourcing', 'order'],
        outputFormat: 'strict_json_object',
      },
    }),
  } as unknown as OperatorContextBuilder;
  const parser = {
    parse: vi.fn().mockReturnValue({
      decisionType: 'delegate',
      targetAgentType: 'sourcing',
      playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
      taskInput: { keyword: '실리콘 식판' },
      userVisibleRationale: '소싱 에이전트가 시장 신호를 확인해야 합니다.',
    }),
  } as unknown as OperatorDecisionParser;
  const executor = {
    execute: vi.fn().mockResolvedValue({
      status: 'delegated',
      delegatedRequestId: 'request-sourcing-1',
      targetAgentType: 'sourcing',
      planStepKey: 'sourcing_agent',
    }),
  } as unknown as OperatorDecisionExecutor;
  const openAiRuntime = {
    decide: vi.fn().mockResolvedValue({
      provider: 'openai_responses',
      rawOutput: '{"decisionType":"delegate"}',
      responseId: 'resp-1',
      model: 'gpt-5.1',
      durationMs: 42,
      inputTokens: 100,
      outputTokens: 20,
    }),
  } as unknown as OpenAiResponsesOperatorRuntimeAdapter;
  const hermesRuntime = {
    decide: vi.fn().mockResolvedValue({
      provider: 'hermes',
      rawOutput: '{"decisionType":"delegate"}',
      stderr: '',
      durationMs: 42,
    }),
  } as unknown as HermesOperatorRuntimeAdapter;
  const repository = {
    appendRunEvent: vi.fn().mockResolvedValue({}),
    listRunEvents: vi.fn().mockResolvedValue([]),
    getTaskSession: vi.fn().mockResolvedValue({
      metadata: { runtimeThreadId: 'hermes-session-existing' },
    }),
    updateTaskSessionMetadata: vi.fn().mockResolvedValue({}),
  } as unknown as AgentOsRepositoryPort;

  return {
    registry,
    delegation,
    contextBuilder,
    parser,
    executor,
    openAiRuntime,
    hermesRuntime,
    repository,
    handler: new OperatorRuntimeHandler(
      registry,
      delegation,
      contextBuilder,
      parser,
      executor,
      openAiRuntime,
      hermesRuntime,
      repository,
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
    runId: 'run-operator-1',
    agentInstanceId: 'agent-operator-1',
    seq: 1,
    type: 'operator.debug',
    level: 'info',
    stream: null,
    message: null,
    data: {},
    logRef: null,
    createdAt: new Date('2026-06-23T00:00:00.000Z'),
    ...overrides,
  };
}

describe('OperatorRuntimeHandler', () => {
  it('fails fast instead of using deterministic fallback when Hermes Leaf mode is configured without Operator runtime', async () => {
    process.env.AGENT_OS_HERMES_LEAF_AGENT_TYPES = 'sourcing,listing';
    delete process.env.AGENT_OS_OPERATOR_RUNTIME;
    const { handler, delegation } = makeHandler();

    await expect(handler.execute(runtimeContext())).rejects.toMatchObject({
      name: 'AgentOsRuntimeError',
      code: 'operator_runtime_required',
    });
    expect(delegation.delegate).not.toHaveBeenCalled();
  });

  it('uses Hermes Operator runtime when explicitly selected', async () => {
    process.env.AGENT_OS_OPERATOR_RUNTIME = 'hermes';
    process.env.AGENT_OS_HERMES_PATH = '/opt/homebrew/bin/hermes';
    process.env.AGENT_OS_HERMES_MODEL = 'anthropic/claude-sonnet-4';
    process.env.AGENT_OS_HERMES_PROVIDER = 'openai-codex';
    process.env.AGENT_OS_HERMES_HOME = '/tmp/kiditem-hermes-home';
    process.env.AGENT_OS_HERMES_TIMEOUT_MS = '12345';
    const {
      handler,
      delegation,
      contextBuilder,
      parser,
      executor,
      openAiRuntime,
      hermesRuntime,
      repository,
    } = makeHandler();

    const result = await handler.execute(runtimeContext());

    expect(delegation.delegate).not.toHaveBeenCalled();
    expect(contextBuilder.build).toHaveBeenCalledTimes(1);
    expect(openAiRuntime.decide).not.toHaveBeenCalled();
    expect(hermesRuntime.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        requestId: 'request-operator-1',
        runId: 'run-operator-1',
        agentInstanceId: 'agent-operator-1',
        agentType: 'manager',
        taskSessionId: 'session-1',
        requestedByUserId: 'user-1',
        prompt: expect.stringContaining('"conversation"'),
        hermesPath: '/opt/homebrew/bin/hermes',
        hermesHome: '/tmp/kiditem-hermes-home',
        timeoutMs: 12345,
        model: 'anthropic/claude-sonnet-4',
        provider: 'openai-codex',
      }),
    );
    expect(parser.parse).toHaveBeenCalledWith('{"decisionType":"delegate"}');
    expect(executor.execute).toHaveBeenCalledWith({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      parentRequestId: 'request-operator-1',
      delegatedByRunId: 'run-operator-1',
      operatorAgentInstanceId: 'agent-operator-1',
      requestedByUserId: 'user-1',
      decision: {
        decisionType: 'delegate',
        targetAgentType: 'sourcing',
        playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
        taskInput: { keyword: '실리콘 식판' },
        userVisibleRationale: '소싱 에이전트가 시장 신호를 확인해야 합니다.',
      },
    });
    expect(repository.appendRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'operator.runtime_completed',
        data: expect.objectContaining({
          provider: 'hermes',
          stdoutBytes: Buffer.byteLength('{"decisionType":"delegate"}'),
          stderrBytes: 0,
        }),
      }),
    );
    expect(result).toEqual({
      provider: 'hermes',
      output: {
        status: 'delegated',
        delegatedRequestId: 'request-sourcing-1',
        targetAgentType: 'sourcing',
        planStepKey: 'sourcing_agent',
      },
    });
  });

  it('uses Hermes tool-loop runtime and trusts only KidItem finalization events', async () => {
    process.env.AGENT_OS_OPERATOR_RUNTIME = 'hermes_tool_loop';
    process.env.AGENT_OS_HERMES_MODEL = 'gpt-5.5';
    process.env.AGENT_OS_HERMES_PROVIDER = 'openai-codex';
    const {
      handler,
      parser,
      executor,
      hermesRuntime,
      repository,
    } = makeHandler();
    vi.mocked(repository.listRunEvents).mockResolvedValue([
      {
        id: 'event-1',
        type: 'agent_os.task_finalized',
        data: {
          finalizationTool: 'agent_os_finalize_task',
          status: 'succeeded',
          artifactIds: ['artifact-sourcing-1', 'artifact-listing-1'],
          summary: {
            message: '소싱 후보와 리스팅 준비 패키지를 만들었습니다.',
          },
        },
      },
    ] as Awaited<ReturnType<AgentOsRepositoryPort['listRunEvents']>>);

    const result = await handler.execute(runtimeContext());

    const prompt = vi.mocked(hermesRuntime.decide).mock.calls[0]?.[0].prompt;
    expect(prompt).toContain('agent_os_finalize_task');
    expect(prompt).toContain('Hermes decides which Agent is needed');
    expect(prompt).not.toContain('For the first validation scenario');
    expect(prompt).not.toContain('orchestrate: 1688 URL -> Sourcing');
    expect(prompt).not.toContain('Return exactly one strict JSON OperatorDecision');
    expect(hermesRuntime.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        enableKidItemMcp: true,
        provider: 'openai-codex',
        model: 'gpt-5.5',
        prompt: expect.stringContaining('agent_os_finalize_task'),
      }),
    );
    expect(parser.parse).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
    expect(repository.listRunEvents).toHaveBeenCalledWith({
      organizationId: 'org-1',
      runId: 'run-operator-1',
      limit: 200,
    });
    expect(result).toEqual({
      provider: 'hermes_tool_loop',
      output: {
        status: 'succeeded',
        artifactIds: ['artifact-sourcing-1', 'artifact-listing-1'],
        summary: {
          message: '소싱 후보와 리스팅 준비 패키지를 만들었습니다.',
        },
        finalizationEventId: 'event-1',
      },
    });
  });

  it('resumes and persists Hermes session ids for tool-loop Operator turns', async () => {
    process.env.AGENT_OS_OPERATOR_RUNTIME = 'hermes_tool_loop';
    const { handler, hermesRuntime, repository } = makeHandler();
    vi.mocked(hermesRuntime.decide).mockResolvedValue({
      provider: 'hermes',
      rawOutput: 'finalized through MCP',
      stderr: '',
      durationMs: 84,
      sessionId: 'hermes-session-next',
    });
    vi.mocked(repository.listRunEvents).mockResolvedValue([
      runEvent({
        type: 'agent_os.task_finalized',
        data: {
          finalizationTool: 'agent_os_finalize_task',
          status: 'succeeded',
          artifactIds: [],
          summary: { message: 'done' },
        },
      }),
    ]);

    await handler.execute(runtimeContext());

    expect(hermesRuntime.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        resumeSessionId: 'hermes-session-existing',
      }),
    );
    expect(repository.updateTaskSessionMetadata).toHaveBeenCalledWith({
      organizationId: 'org-1',
      taskSessionId: 'session-1',
      metadata: { runtimeThreadId: 'hermes-session-next' },
    });
  });

  it('returns waiting_approval when Hermes requests user input through KidItem MCP', async () => {
    process.env.AGENT_OS_OPERATOR_RUNTIME = 'hermes_tool_loop';
    process.env.AGENT_OS_HERMES_MODEL = 'gpt-5.5';
    const { handler, repository } = makeHandler();
    vi.mocked(repository.listRunEvents).mockResolvedValue([
      {
        id: 'event-input-1',
        type: 'agent_os.task_finalized',
        data: {
          finalizationTool: 'agent_os_request_user_input',
          status: 'waiting_approval',
          artifactIds: [],
          summary: {
            question: '이 상품으로 진행할까요?',
            reason: '상품 선택 확인이 필요합니다.',
          },
        },
      },
    ] as Awaited<ReturnType<AgentOsRepositoryPort['listRunEvents']>>);

    await expect(handler.execute(runtimeContext())).resolves.toEqual({
      provider: 'hermes_tool_loop',
      output: {
        status: 'waiting_approval',
        artifactIds: [],
        summary: {
          question: '이 상품으로 진행할까요?',
          reason: '상품 선택 확인이 필요합니다.',
        },
        finalizationEventId: 'event-input-1',
      },
    });
  });

  it('reconciles a Hermes timeout after KidItem finalization', async () => {
    process.env.AGENT_OS_OPERATOR_RUNTIME = 'hermes_tool_loop';
    const { handler, hermesRuntime, repository } = makeHandler();
    vi.mocked(hermesRuntime.decide).mockRejectedValue(
      new AgentOsRuntimeError(
        'operator_runtime_timeout',
        'Hermes Operator runtime timed out.',
      ),
    );
    vi.mocked(repository.listRunEvents).mockResolvedValue([
      runEvent({
        id: 'event-finalize-1',
        type: 'agent_os.task_finalized',
        data: {
          finalizationTool: 'agent_os_finalize_task',
          status: 'succeeded',
          artifactIds: ['artifact-sourcing-1', 'artifact-listing-1'],
          summary: { message: 'completed before timeout' },
        },
      }),
    ]);

    await expect(handler.execute(runtimeContext())).resolves.toEqual({
      provider: 'hermes_tool_loop',
      output: {
        status: 'succeeded',
        artifactIds: ['artifact-sourcing-1', 'artifact-listing-1'],
        summary: { message: 'completed before timeout' },
        finalizationEventId: 'event-finalize-1',
      },
    });
    expect(repository.appendRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'operator.runtime_completed',
        data: expect.objectContaining({
          provider: 'hermes_tool_loop',
          reconciledAfterRuntimeError: true,
          runtimeErrorCode: 'operator_runtime_timeout',
        }),
      }),
    );
  });

  it('paginates run events before deciding Hermes tool-loop finalization is missing', async () => {
    process.env.AGENT_OS_OPERATOR_RUNTIME = 'hermes_tool_loop';
    const { handler, repository } = makeHandler();
    const firstPage = Array.from({ length: 200 }, (_, index) =>
      runEvent({
        id: `event-debug-${index + 1}`,
        seq: index + 1,
      }),
    );
    vi.mocked(repository.listRunEvents)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([
        runEvent({
          id: 'event-finalize-201',
          seq: 201,
          type: 'agent_os.task_finalized',
          data: {
            finalizationTool: 'agent_os_finalize_task',
            status: 'succeeded',
            artifactIds: ['artifact-late-1'],
            summary: { message: 'late finalization' },
          },
        }),
      ]);

    await expect(handler.execute(runtimeContext())).resolves.toMatchObject({
      output: {
        artifactIds: ['artifact-late-1'],
        finalizationEventId: 'event-finalize-201',
      },
    });
    expect(repository.listRunEvents).toHaveBeenNthCalledWith(2, {
      organizationId: 'org-1',
      runId: 'run-operator-1',
      limit: 200,
      cursorSeq: 200,
    });
  });

  it('fails closed when Hermes tool-loop exits without agent_os_finalize_task', async () => {
    process.env.AGENT_OS_OPERATOR_RUNTIME = 'hermes_tool_loop';
    const { handler, parser, executor, repository } = makeHandler();
    vi.mocked(repository.listRunEvents).mockResolvedValue([]);

    await expect(handler.execute(runtimeContext())).rejects.toMatchObject({
      name: 'AgentOsRuntimeError',
      code: 'operator_runtime_finalization_missing',
    });

    expect(parser.parse).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
    expect(repository.appendRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'operator.runtime_failed',
        data: {
          provider: 'hermes_tool_loop',
          errorName: 'AgentOsRuntimeError',
        },
      }),
    );
  });

  it('appends a Hermes runtime failure event when the adapter throws', async () => {
    process.env.AGENT_OS_OPERATOR_RUNTIME = 'hermes';
    const { handler, hermesRuntime, repository } = makeHandler();
    const error = new Error('Hermes failed');
    vi.mocked(hermesRuntime.decide).mockRejectedValue(error);

    await expect(handler.execute(runtimeContext())).rejects.toThrow(error);

    expect(repository.appendRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'operator.runtime_failed',
        data: {
          provider: 'hermes',
          errorName: 'Error',
        },
      }),
    );
  });

  it('appends a Hermes decision rejection event for invalid output', async () => {
    process.env.AGENT_OS_OPERATOR_RUNTIME = 'hermes';
    const { handler, hermesRuntime, parser, executor, repository } = makeHandler();
    vi.mocked(hermesRuntime.decide).mockResolvedValue({
      provider: 'hermes',
      rawOutput: 'not-json',
      stderr: '',
      durationMs: 42,
    });
    const error = new Error('Invalid decision');
    vi.mocked(parser.parse).mockImplementation(() => {
      throw error;
    });

    await expect(handler.execute(runtimeContext())).rejects.toThrow(error);

    expect(parser.parse).toHaveBeenCalledWith('not-json');
    expect(executor.execute).not.toHaveBeenCalled();
    expect(repository.appendRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'operator.decision_rejected',
        data: { errorName: 'Error' },
      }),
    );
  });

  it('rejects unsupported Operator runtimes before building provider context', async () => {
    process.env.AGENT_OS_OPERATOR_RUNTIME = 'unsupported_runtime';
    const { handler, contextBuilder, parser, executor, delegation } =
      makeHandler();

    await expect(handler.execute(runtimeContext())).rejects.toMatchObject({
      name: 'AgentOsRuntimeError',
      code: 'operator_runtime_unsupported',
    });

    expect(delegation.delegate).not.toHaveBeenCalled();
    expect(contextBuilder.build).not.toHaveBeenCalled();
    expect(parser.parse).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('uses OpenAI Responses Operator runtime when explicitly selected', async () => {
    process.env.AGENT_OS_OPERATOR_RUNTIME = 'openai_responses';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.AGENT_OS_OPENAI_RESPONSES_MODEL = 'gpt-5.1';
    process.env.AGENT_OS_OPENAI_RESPONSES_TIMEOUT_MS = '23456';
    process.env.AGENT_OS_OPENAI_RESPONSES_BASE_URL = 'https://api.example.test/v1';
    const {
      handler,
      contextBuilder,
      parser,
      executor,
      openAiRuntime,
      repository,
      delegation,
    } = makeHandler();

    const result = await handler.execute(runtimeContext());

    expect(delegation.delegate).not.toHaveBeenCalled();
    expect(contextBuilder.build).toHaveBeenCalledWith({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      requestId: 'request-operator-1',
      activeUserMessage: '실리콘 식판 찾아줘',
    });
    expect(openAiRuntime.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('"conversation"'),
        outputSchemaPath: expect.stringContaining(
          'agent-config/schemas/operator-decision.schema.json',
        ),
        model: 'gpt-5.1',
        apiKey: 'sk-test',
        baseUrl: 'https://api.example.test/v1',
        timeoutMs: 23456,
      }),
    );
    expect(vi.mocked(openAiRuntime.decide).mock.calls[0]?.[0].prompt).toContain(
      'manual_product_intake_from_url_v1',
    );
    expect(vi.mocked(openAiRuntime.decide).mock.calls[0]?.[0].prompt).toContain(
      'sourceUrl',
    );
    expect(vi.mocked(openAiRuntime.decide).mock.calls[0]?.[0].prompt).toContain(
      'confirmed_channel_listing_registration_v1',
    );
    expect(vi.mocked(openAiRuntime.decide).mock.calls[0]?.[0].prompt).toContain(
      'coupang_listing_submission_v1',
    );
    expect(vi.mocked(openAiRuntime.decide).mock.calls[0]?.[0].prompt).toContain(
      'purchase_order_submission_v1',
    );
    expect(vi.mocked(openAiRuntime.decide).mock.calls[0]?.[0].prompt).toContain(
      'listingPayloadJson',
    );
    expect(vi.mocked(openAiRuntime.decide).mock.calls[0]?.[0].prompt).toContain(
      'externalOrderPlatform',
    );
    expect(vi.mocked(openAiRuntime.decide).mock.calls[0]?.[0].prompt).toContain(
      'purchaseOrderId',
    );
    expect(vi.mocked(openAiRuntime.decide).mock.calls[0]?.[0].prompt).toContain(
      'Check context.liveReadiness.blockedCapabilities before delegating live commerce actions',
    );
    expect(vi.mocked(openAiRuntime.decide).mock.calls[0]?.[0].prompt).toContain(
      '"blockedCapabilities"',
    );
    expect(parser.parse).toHaveBeenCalledWith('{"decisionType":"delegate"}');
    expect(executor.execute).toHaveBeenCalledWith({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      parentRequestId: 'request-operator-1',
      delegatedByRunId: 'run-operator-1',
      operatorAgentInstanceId: 'agent-operator-1',
      requestedByUserId: 'user-1',
      decision: {
        decisionType: 'delegate',
        targetAgentType: 'sourcing',
        playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
        taskInput: { keyword: '실리콘 식판' },
        userVisibleRationale: '소싱 에이전트가 시장 신호를 확인해야 합니다.',
      },
    });
    expect(repository.appendRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'operator.runtime_started',
        data: { provider: 'openai_responses' },
      }),
    );
    expect(repository.appendRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'operator.runtime_completed',
        data: expect.objectContaining({
          provider: 'openai_responses',
          responseId: 'resp-1',
        }),
      }),
    );
    expect(result).toEqual({
      provider: 'openai_responses',
      output: {
        status: 'delegated',
        delegatedRequestId: 'request-sourcing-1',
        targetAgentType: 'sourcing',
        planStepKey: 'sourcing_agent',
      },
    });
  });

  it('keeps the deterministic delegation path when no Operator runtime is selected', async () => {
    delete process.env.AGENT_OS_OPERATOR_RUNTIME;
    const { handler, delegation, openAiRuntime } = makeHandler();

    const result = await handler.execute(runtimeContext());

    expect(openAiRuntime.decide).not.toHaveBeenCalled();
    expect(delegation.delegate).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'sourcing',
        conversationId: 'conversation-1',
        parentRequestId: 'request-operator-1',
      }),
    );
    expect(result.output).toMatchObject({
      status: 'delegated',
      delegatedRequestId: 'request-sourcing-1',
    });
  });

  it('delegates URL messages to manual URL intake in the deterministic path', async () => {
    delete process.env.AGENT_OS_OPERATOR_RUNTIME;
    const { handler, delegation } = makeHandler();

    const result = await handler.execute(
      runtimeContext({
        input: {
          conversationId: 'conversation-1',
          requestedByUserId: 'user-1',
          userMessage:
            '이 1688 URL을 소싱 후보로 수집해줘: https://detail.1688.com/offer/767987154308.html?offerId=767987154308',
        },
      }),
    );

    expect(delegation.delegate).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'sourcing',
        playbookKey: 'manual_product_intake_from_url_v1',
        planStepKey: 'scrape_url',
        payload: expect.objectContaining({
          action: 'manual_url_intake',
          sourceUrl:
            'https://detail.1688.com/offer/767987154308.html?offerId=767987154308',
          url: 'https://detail.1688.com/offer/767987154308.html?offerId=767987154308',
        }),
      }),
    );
    expect(result.output).toMatchObject({
      status: 'delegated',
      playbookKey: 'manual_product_intake_from_url_v1',
      delegatedRequestId: 'request-sourcing-1',
    });
  });

});

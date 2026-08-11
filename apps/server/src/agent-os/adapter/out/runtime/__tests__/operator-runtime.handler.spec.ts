import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentRuntimeExecutionContext } from '../../../../application/port/out/runtime/agent-runtime.port';
import type { AgentOsRepositoryPort } from '../../../../application/port/out/repository/agent-os-repository.port';
import type { OperatorContextBuilder } from '../../../../application/service/operator-context-builder.service';
import { OperatorDecisionExecutor } from '../../../../application/service/operator-decision-executor.service';
import { OperatorDecisionParser } from '../../../../application/service/operator-decision-parser.service';
import type { AgentRuntimeHandlerRegistry } from '../../../../application/service/agent-runtime-handler-registry.service';
import { AgentTaskDelegationService } from '../../../../application/service/agent-task-delegation.service';
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
    playbookKey: null,
    planStepKey: null,
    input: {
      conversationId: 'conversation-1',
      requestedByUserId: 'user-1',
      userMessage: '실리콘 식판 찾아줘',
      keyword: '실리콘 식판',
      ...(inputOverrides ?? {}),
    },
    trustLevel: 1,
    runtimeConfig: {},
    ...contextOverrides,
  };
}

function makeHandler() {
  const registry = { register: vi.fn() } as unknown as AgentRuntimeHandlerRegistry;
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
        id: 'request-operator-1', agentType: 'manager', status: 'claimed',
        playbookKey: 'sourcing_market_research_v2',
        planStepKey: 'operator', displayName: 'Operator', payload: {},
      },
      activeUserMessage: '실리콘 식판 찾아줘',
      recentMessages: [],
      runGraph: { nodes: [], artifacts: [], toolInvocations: [] },
      liveReadiness: {
        checks: [], allReady: false, runnableCapabilities: ['operator_runtime'],
        blockedCapabilities: ['channels.submit_coupang_listing'],
      },
      allowedTargetAgents: [], allowedPlaybooks: [], capabilitySummaries: [],
      policy: {
        allowedDecisionTypes: ['delegate', 'ask_user', 'refuse'],
        allowedTargetAgentTypes: ['sourcing', 'order'], outputFormat: 'strict_json_object',
      },
    }),
  } as unknown as OperatorContextBuilder;
  const parser = {
    parse: vi.fn().mockReturnValue({
      decisionType: 'delegate', targetAgentType: 'sourcing',
      playbookKey: 'sourcing_market_research_v2',
      taskInput: { keyword: '실리콘 식판' },
      userVisibleRationale: '소싱 에이전트가 시장 신호를 확인해야 합니다.',
    }),
  } as unknown as OperatorDecisionParser;
  const executor = {
    execute: vi.fn().mockResolvedValue({
      status: 'delegated', delegatedRequestId: 'request-sourcing-1',
      targetAgentType: 'sourcing', planStepKey: 'sourcing_agent',
    }),
  } as unknown as OperatorDecisionExecutor;
  const openAiRuntime = {
    decide: vi.fn().mockResolvedValue({
      provider: 'openai_responses', rawOutput: '{"decisionType":"delegate"}',
      responseId: 'resp-1', model: 'gpt-5.1', durationMs: 42,
      inputTokens: 100, outputTokens: 20,
    }),
  } as unknown as OpenAiResponsesOperatorRuntimeAdapter;
  const repository = {
    appendRunEvent: vi.fn().mockResolvedValue({}),
  } as unknown as AgentOsRepositoryPort;

  return {
    registry, delegation, contextBuilder, parser, executor, openAiRuntime, repository,
    handler: new OperatorRuntimeHandler(
      registry, delegation, contextBuilder, parser, executor, openAiRuntime, repository,
    ),
  };
}

describe('OperatorRuntimeHandler', () => {
  it.each(['hermes', 'hermes_tool_loop'])(
    'rejects retired Operator runtime %s before building provider context',
    async (runtime) => {
      process.env.AGENT_OS_OPERATOR_RUNTIME = runtime;
      const { handler, contextBuilder, parser, executor, delegation } = makeHandler();

      await expect(handler.execute(runtimeContext())).rejects.toMatchObject({
        name: 'AgentOsRuntimeError',
        code: 'operator_runtime_unsupported',
        message:
          `Unsupported Agent OS Operator runtime: ${runtime}. ` +
          'Use openai_responses or omit AGENT_OS_OPERATOR_RUNTIME for the deterministic path.',
      });

      expect(delegation.delegate).not.toHaveBeenCalled();
      expect(contextBuilder.build).not.toHaveBeenCalled();
      expect(parser.parse).not.toHaveBeenCalled();
      expect(executor.execute).not.toHaveBeenCalled();
    },
  );

  it('rejects unsupported Operator runtimes before building provider context', async () => {
    process.env.AGENT_OS_OPERATOR_RUNTIME = 'unsupported_runtime';
    const { handler, contextBuilder, parser, executor, delegation } = makeHandler();

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
    const { handler, contextBuilder, parser, executor, openAiRuntime, repository, delegation } = makeHandler();

    const result = await handler.execute(runtimeContext());

    expect(delegation.delegate).not.toHaveBeenCalled();
    expect(contextBuilder.build).toHaveBeenCalledWith({
      organizationId: 'org-1', conversationId: 'conversation-1',
      requestId: 'request-operator-1', activeUserMessage: '실리콘 식판 찾아줘',
    });
    expect(openAiRuntime.decide).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('manual_product_intake_from_url_v2'),
      outputSchemaPath: expect.stringContaining('agent-config/schemas/operator-decision.schema.json'),
      model: 'gpt-5.1', apiKey: 'sk-test',
      baseUrl: 'https://api.example.test/v1', timeoutMs: 23456,
    }));
    expect(parser.parse).toHaveBeenCalledWith('{"decisionType":"delegate"}');
    expect(executor.execute).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1', conversationId: 'conversation-1',
      parentRequestId: 'request-operator-1', delegatedByRunId: 'run-operator-1',
    }));
    expect(repository.appendRunEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'operator.runtime_completed',
      data: expect.objectContaining({ provider: 'openai_responses', responseId: 'resp-1' }),
    }));
    expect(result).toEqual({
      provider: 'openai_responses',
      output: {
        status: 'delegated', delegatedRequestId: 'request-sourcing-1',
        targetAgentType: 'sourcing', planStepKey: 'sourcing_agent',
      },
    });
  });

  it('keeps the deterministic delegation path when no Operator runtime is selected', async () => {
    delete process.env.AGENT_OS_OPERATOR_RUNTIME;
    const { handler, delegation, openAiRuntime } = makeHandler();

    const result = await handler.execute(runtimeContext());

    expect(openAiRuntime.decide).not.toHaveBeenCalled();
    expect(delegation.delegate).toHaveBeenCalledWith(expect.objectContaining({
      agentType: 'sourcing', conversationId: 'conversation-1', parentRequestId: 'request-operator-1',
    }));
    expect(result.output).toMatchObject({
      status: 'delegated', delegatedRequestId: 'request-sourcing-1',
    });
  });

  it('blocks deterministic sourcing delegation when no keyword was supplied', async () => {
    delete process.env.AGENT_OS_OPERATOR_RUNTIME;
    const { handler, delegation } = makeHandler();

    const result = await handler.execute(runtimeContext({
      input: {
        conversationId: 'conversation-1',
        requestedByUserId: 'user-1',
        userMessage: '추천해줘',
        keyword: '',
      },
    }));

    expect(result).toEqual({
      provider: 'kiditem-operator',
      output: { status: 'blocked', reason: 'sourcing_keyword_required' },
    });
    expect(delegation.delegate).not.toHaveBeenCalled();
  });

  it('delegates URL messages to manual URL intake in the deterministic path', async () => {
    delete process.env.AGENT_OS_OPERATOR_RUNTIME;
    const { handler, delegation } = makeHandler();

    const result = await handler.execute(runtimeContext({
      input: {
        conversationId: 'conversation-1', requestedByUserId: 'user-1',
        userMessage: '이 1688 URL을 소싱 후보로 수집해줘: https://detail.1688.com/offer/767987154308.html?offerId=767987154308',
      },
    }));

    expect(delegation.delegate).toHaveBeenCalledWith(expect.objectContaining({
      agentType: 'sourcing', playbookKey: 'manual_product_intake_from_url_v2',
      planStepKey: 'scrape_url', payload: expect.objectContaining({
        action: 'manual_url_intake',
        sourceUrl: 'https://detail.1688.com/offer/767987154308.html?offerId=767987154308',
        url: 'https://detail.1688.com/offer/767987154308.html?offerId=767987154308',
      }),
    }));
    expect(result.output).toMatchObject({
      status: 'delegated', playbookKey: 'manual_product_intake_from_url_v2',
      delegatedRequestId: 'request-sourcing-1',
    });
  });
});

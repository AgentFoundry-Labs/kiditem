import { EventType } from '@ag-ui/core';
import { describe, expect, it, vi } from 'vitest';
import { AgentAguiRuntimeRegistry } from '../../../../application/service/agent-agui-runtime-registry.service';
import { OpenAiResponsesAguiRuntimeAdapter } from '../openai-responses-agui-runtime.adapter';

describe('OpenAiResponsesAguiRuntimeAdapter', () => {
  it.each([true, false])('invalidates the exact AG-UI grant and stops it by handle or start intent (%s)', async (withHandle) => {
    const registry = new AgentAguiRuntimeRegistry();
    const cleanup = {
      invalidate: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue({ status: 'cancelled' as const }),
    };
    const runtime = new OpenAiResponsesAguiRuntimeAdapter(
      registry,
      { decide: vi.fn() } as never,
      cleanup,
    );
    await expect(runtime.cleanup({
      signal: new AbortController().signal,
      organizationId: 'org-1', sessionId: 'session-1', runtimeType: 'copilotkit_agui',
      executionId: 'execution-1', attemptId: 'attempt-1', startIntentId: 'intent-1',
      handle: withHandle ? {
        runtimeType: 'copilotkit_agui', executionId: 'execution-1', attemptId: 'attempt-1',
        externalRunId: 'run-1', encryptedHandleRef: 'grant-1', generation: 2,
      } : null,
    })).resolves.toEqual({
      state: 'clean', executionAuthority: 'irrevocably_revoked', credentials: 'irrevocably_revoked',
      handle: 'removed', filesystem: 'not_owned',
    });
    expect(cleanup.invalidate).toHaveBeenCalledWith({
      organizationId: 'org-1', sessionId: 'session-1', executionId: 'execution-1',
      attemptId: 'attempt-1', startIntentId: 'intent-1',
    });
    expect(cleanup.stop).toHaveBeenCalledWith(expect.objectContaining({
      startIntentId: 'intent-1', handle: withHandle ? expect.anything() : null,
    }));
  });
  it('registers the production AG-UI runtime and completes a policy-routed read loop', async () => {
    const registry = new AgentAguiRuntimeRegistry();
    const responses = {
      decide: vi.fn()
        .mockResolvedValueOnce({
          provider: 'openai_responses', rawOutput: JSON.stringify({
            kind: 'capability', content: null,
            capabilityKey: 'analytics.readOverview', capabilityInputJson: '{"period":"today"}',
          }), model: 'gpt-5.4', responseId: 'response-1', durationMs: 1,
          inputTokens: 10, outputTokens: 5,
        })
        .mockResolvedValueOnce({
          provider: 'openai_responses', rawOutput: JSON.stringify({
            kind: 'answer', content: '오늘 주문은 8건입니다.',
            capabilityKey: null, capabilityInputJson: null,
          }), model: 'gpt-5.4', responseId: 'response-2', durationMs: 1,
          inputTokens: 12, outputTokens: 6,
        }),
    };
    const runtime = new OpenAiResponsesAguiRuntimeAdapter(registry, responses as never);
    runtime.onModuleInit();
    const invokeCapability = vi.fn().mockResolvedValue({
      resourceType: 'analytics_overview', outputSummary: { sales: { orders: 8 } },
      interactionUiResult: {
        kind: 'notice', tone: 'info', title: '조회 완료', body: '주문을 확인했습니다.',
        textFallback: '주문을 확인했습니다.',
      },
    });
    const recordUsage = vi.fn();
    const events = [];

    for await (const event of registry.resolve('copilotkit_agui')!.run({
      organizationId: 'org-1', userId: 'user-1', sessionId: 'session-1',
      sessionTaskId: 'task-1', executionId: 'execution-1',
      copilotThreadId: 'thread-1', aguiRunId: 'run-1',
      agentDefinitionKey: 'operator', runtimeType: 'copilotkit_agui',
      modelIdentity: 'gpt-5.4',
      capabilityKeys: ['analytics.readOverview'],
      messages: [{ id: 'message-1', role: 'user', content: '오늘 주문 알려줘' }],
      dashboardContext: {}, invokeCapability, recordUsage,
    })) events.push(event);

    expect(events.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_END,
      EventType.TOOL_CALL_RESULT,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
    expect(invokeCapability).toHaveBeenCalledWith('analytics.readOverview', { period: 'today' });
    expect(JSON.parse((events.find((event) => event.type === EventType.TOOL_CALL_RESULT) as { content: string }).content))
      .toEqual(expect.objectContaining({ kind: 'notice', title: '조회 완료' }));
    expect(recordUsage).toHaveBeenCalledTimes(2);
    expect(responses.decide).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-5.4' }));
  });
});

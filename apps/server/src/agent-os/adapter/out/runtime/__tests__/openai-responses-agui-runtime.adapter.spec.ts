import { EventType } from '@ag-ui/core';
import { describe, expect, it, vi } from 'vitest';
import { AgentAguiRuntimeRegistry } from '../../../../application/service/agent-agui-runtime-registry.service';
import { OpenAiResponsesAguiRuntimeAdapter } from '../openai-responses-agui-runtime.adapter';

describe('OpenAiResponsesAguiRuntimeAdapter', () => {
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
    expect(recordUsage).toHaveBeenCalledTimes(2);
    expect(responses.decide).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-5.4' }));
  });
});

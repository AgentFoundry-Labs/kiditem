import { describe, expect, it, vi } from 'vitest';
import { OrderAgentRuntimeHandler } from '../order-agent-runtime.handler';

const PURCHASE_ORDER_ID = '0187e942-9098-7382-9a22-c5b821f2f5d1';

function context(input: Record<string, unknown>) {
  return {
    organizationId: 'org-1',
    agentInstanceId: 'agent-order-1',
    agentType: 'order',
    requestId: 'request-1',
    runId: 'run-1',
    taskSessionId: 'session-1',
    taskKey: 'submit-po',
    adapterType: 'claude_local',
    model: 'gpt-test',
    modelPlan: { primary: 'gpt-test' },
    promptPath: 'agent-config/prompts/agents/order.md',
    input,
    trustLevel: 5,
    runtimeConfig: {},
  };
}

describe('OrderAgentRuntimeHandler', () => {
  it('routes approved purchase order submission through Tool Router', async () => {
    const registry = { register: vi.fn() };
    const toolRouter = {
      invoke: vi.fn().mockResolvedValue({
        status: 'waiting_approval',
        invocation: { id: 'tool-submit-po-1' },
        artifacts: [],
      }),
    };
    const handler = new OrderAgentRuntimeHandler(
      registry as never,
      toolRouter as never,
    );

    handler.onModuleInit();
    const result = await handler.execute(
      context({
        action: 'submit_purchase_order',
        conversationId: 'conversation-1',
        requestedByUserId: 'user-1',
        purchaseOrderId: PURCHASE_ORDER_ID,
        externalOrderPlatform: ' ALIBABA_1688 ',
        externalOrderId: ' 1688-ORDER-1 ',
        externalOrderUrl: ' https://trade.1688.com/order/1688-ORDER-1.html ',
      }),
    );

    expect(registry.register).toHaveBeenCalledWith('order', handler);
    expect(toolRouter.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        agentInstanceId: 'agent-order-1',
        agentType: 'order',
        requestId: 'request-1',
        runId: 'run-1',
        requestedByUserId: 'user-1',
        capabilityKey: 'supply.submit_purchase_order',
        input: {
          purchaseOrderId: PURCHASE_ORDER_ID,
          externalOrderPlatform: 'ALIBABA_1688',
          externalOrderId: '1688-ORDER-1',
          externalOrderUrl: 'https://trade.1688.com/order/1688-ORDER-1.html',
        },
      }),
    );
    expect(result).toEqual({
      provider: 'kiditem-supply',
      output: {
        action: 'submit_purchase_order',
        toolInvocationIds: ['tool-submit-po-1'],
        artifactIds: [],
        status: 'waiting_approval',
      },
    });
  });

  it('fails the runtime when Tool Router returns a failed purchase order invocation', async () => {
    const registry = { register: vi.fn() };
    const toolRouter = {
      invoke: vi.fn().mockResolvedValue({
        status: 'failed',
        invocation: {
          id: 'tool-submit-po-1',
          errorCode: 'policy_denied',
          errorMessage: 'External purchase submission is denied.',
        },
        artifacts: [],
      }),
    };
    const handler = new OrderAgentRuntimeHandler(
      registry as never,
      toolRouter as never,
    );

    await expect(
      handler.execute(
        context({
          action: 'submit_purchase_order',
          purchaseOrderId: PURCHASE_ORDER_ID,
        }),
      ),
    ).rejects.toMatchObject({
      name: 'AgentOsRuntimeError',
      code: 'policy_denied',
      message: 'External purchase submission is denied.',
    });
  });
});

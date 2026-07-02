import { describe, expect, it, vi } from 'vitest';
import { ChannelRegistrationRuntimeHandler } from '../channel-registration-runtime.handler';

const MASTER_ID = '00000000-0000-4000-8000-000000000001';
const CHANNEL_ACCOUNT_ID = '00000000-0000-4000-8000-000000000002';

function context(input: Record<string, unknown>) {
  return {
    organizationId: 'org-1',
    agentInstanceId: 'agent-channel-1',
    agentType: 'channel_registration',
    requestId: 'request-1',
    runId: 'run-1',
    taskSessionId: 'session-1',
    taskKey: 'confirmed-listing',
    adapterType: 'claude_local',
    model: 'gpt-test',
    modelPlan: { primary: 'gpt-test' },
    promptPath: 'agent-config/prompts/agents/channel-registration.md',
    input,
    trustLevel: 5,
    runtimeConfig: {},
  };
}

describe('ChannelRegistrationRuntimeHandler', () => {
  it('routes confirmed listing registration through approval-gated Tool Router', async () => {
    const registry = { register: vi.fn() };
    const toolRouter = {
      invoke: vi.fn().mockResolvedValue({
        status: 'waiting_approval',
        invocation: { id: 'tool-channel-1' },
        artifacts: [],
      }),
    };
    const handler = new ChannelRegistrationRuntimeHandler(
      registry as never,
      toolRouter as never,
    );

    handler.onModuleInit();
    const result = await handler.execute(
      context({
        action: 'confirmed_listing_registration',
        conversationId: 'conversation-1',
        requestedByUserId: 'user-1',
        masterId: MASTER_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        externalId: ' COUPANG-720445 ',
        productBarcode: ' 8806384882841 ',
        channelName: ' 쿠팡 판매명 ',
        channelPrice: 12900,
      }),
    );

    expect(registry.register).toHaveBeenCalledWith('channel_registration', handler);
    expect(toolRouter.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        agentInstanceId: 'agent-channel-1',
        agentType: 'channel_registration',
        requestId: 'request-1',
        runId: 'run-1',
        requestedByUserId: 'user-1',
        capabilityKey: 'channels.register_confirmed_listing',
        input: {
          masterId: MASTER_ID,
          channelAccountId: CHANNEL_ACCOUNT_ID,
          externalId: 'COUPANG-720445',
          productBarcode: '8806384882841',
          channelName: '쿠팡 판매명',
          channelPrice: 12900,
        },
      }),
    );
    expect(result).toEqual({
      provider: 'kiditem-channel-registration',
      output: {
        action: 'confirmed_listing_registration',
        toolInvocationIds: ['tool-channel-1'],
        artifactIds: [],
        status: 'waiting_approval',
      },
    });
  });

  it('routes Coupang listing submission through approval-gated Tool Router', async () => {
    const registry = { register: vi.fn() };
    const toolRouter = {
      invoke: vi.fn().mockResolvedValue({
        status: 'waiting_approval',
        invocation: { id: 'tool-channel-submit-1' },
        artifacts: [],
      }),
    };
    const handler = new ChannelRegistrationRuntimeHandler(
      registry as never,
      toolRouter as never,
    );

    const result = await handler.execute(
      context({
        action: 'coupang_listing_submit',
        conversationId: 'conversation-1',
        requestedByUserId: 'user-1',
        masterId: MASTER_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        productBarcode: ' 8806384882841 ',
        listingPayload: {
          vendorId: 'A00012345',
          sellerProductName: '쿠팡 판매명',
          requested: true,
          items: [{ itemName: '단품', salePrice: 12900 }],
        },
      }),
    );

    expect(toolRouter.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        agentInstanceId: 'agent-channel-1',
        agentType: 'channel_registration',
        requestId: 'request-1',
        runId: 'run-1',
        requestedByUserId: 'user-1',
        capabilityKey: 'channels.submit_coupang_listing',
        input: {
          masterId: MASTER_ID,
          channelAccountId: CHANNEL_ACCOUNT_ID,
          productBarcode: '8806384882841',
          listingPayload: {
            vendorId: 'A00012345',
            sellerProductName: '쿠팡 판매명',
            requested: true,
            items: [{ itemName: '단품', salePrice: 12900 }],
          },
        },
      }),
    );
    expect(result).toEqual({
      provider: 'kiditem-channel-registration',
      output: {
        action: 'coupang_listing_submit',
        toolInvocationIds: ['tool-channel-submit-1'],
        artifactIds: [],
        status: 'waiting_approval',
      },
    });
  });

  it('fails the runtime when Tool Router returns a failed channel invocation', async () => {
    const registry = { register: vi.fn() };
    const toolRouter = {
      invoke: vi.fn().mockResolvedValue({
        status: 'failed',
        invocation: {
          id: 'tool-channel-submit-1',
          errorCode: 'policy_denied',
          errorMessage: 'Coupang listing submission is denied.',
        },
        artifacts: [],
      }),
    };
    const handler = new ChannelRegistrationRuntimeHandler(
      registry as never,
      toolRouter as never,
    );

    await expect(
      handler.execute(
        context({
          action: 'coupang_listing_submit',
          masterId: MASTER_ID,
          channelAccountId: CHANNEL_ACCOUNT_ID,
          listingPayload: { vendorId: 'A00012345' },
        }),
      ),
    ).rejects.toMatchObject({
      name: 'AgentOsRuntimeError',
      code: 'policy_denied',
      message: 'Coupang listing submission is denied.',
    });
  });
});

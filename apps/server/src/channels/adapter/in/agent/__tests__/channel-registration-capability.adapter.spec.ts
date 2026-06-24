import { describe, expect, it, vi } from 'vitest';
import type { AgentCapabilityRegistry } from '../../../../agent-os/application/service/agent-capability-registry.service';
import { MarketplaceRegistrationService } from '../../../../application/service/marketplace-registration.service';
import { ChannelRegistrationCapabilityAdapter } from '../channel-registration-capability.adapter';

const MASTER_ID = '00000000-0000-4000-8000-000000000001';
const CHANNEL_ACCOUNT_ID = '00000000-0000-4000-8000-000000000002';

describe('ChannelRegistrationCapabilityAdapter', () => {
  it('registers confirmed marketplace listing creation as approval-gated Channels capability', async () => {
    const register = vi.fn();
    const registry = { register } as unknown as AgentCapabilityRegistry;
    const marketplaceRegistration = {
      registerConfirmedListing: vi.fn().mockResolvedValue({
        id: 'listing-1',
        masterId: MASTER_ID,
        channel: 'coupang',
        channelAccountId: CHANNEL_ACCOUNT_ID,
        externalId: 'COUPANG-720445',
        channelName: '쿠팡 판매명',
        channelPrice: 12900,
        status: 'active',
      }),
    } as unknown as MarketplaceRegistrationService;
    const adapter = new ChannelRegistrationCapabilityAdapter(
      registry,
      marketplaceRegistration,
    );

    adapter.onModuleInit();

    expect(register).toHaveBeenCalledTimes(2);
    const handler = register.mock.calls
      .map((call) => call[0])
      .find((candidate) => candidate.key === 'channels.register_confirmed_listing');
    expect(handler).toMatchObject({
      key: 'channels.register_confirmed_listing',
      ownerDomain: 'channels',
      executionKind: 'workflow',
      sideEffects: ['db_write'],
      approvalRisk: 'high',
    });
    expect(
      handler.idempotencyKey({
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        agentInstanceId: 'agent-channel-1',
        agentType: 'channel_registration',
        requestId: 'request-1',
        runId: 'run-1',
        input: {
          masterId: MASTER_ID,
          channelAccountId: CHANNEL_ACCOUNT_ID,
          externalId: 'COUPANG-720445',
        },
      }),
    ).toBe(
      `org-1:channels.register_confirmed_listing:${CHANNEL_ACCOUNT_ID}:COUPANG-720445`,
    );

    const result = await handler.execute({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      agentInstanceId: 'agent-channel-1',
      agentType: 'channel_registration',
      requestId: 'request-1',
      runId: 'run-1',
      requestedByUserId: 'user-1',
      input: {
        masterId: MASTER_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        externalId: ' COUPANG-720445 ',
        productBarcode: ' 8806384882841 ',
        channelName: ' 쿠팡 판매명 ',
        channelPrice: 12900,
      },
    });

    expect(marketplaceRegistration.registerConfirmedListing).toHaveBeenCalledWith(
      'org-1',
      {
        masterId: MASTER_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        externalId: 'COUPANG-720445',
        productBarcode: '8806384882841',
        channelName: '쿠팡 판매명',
        channelPrice: 12900,
      },
    );
    expect(result).toEqual({
      resourceType: 'channel_listing',
      resourceId: 'listing-1',
      outputSummary: {
        listingId: 'listing-1',
        masterId: MASTER_ID,
        channel: 'coupang',
        channelAccountId: CHANNEL_ACCOUNT_ID,
        externalId: 'COUPANG-720445',
        channelName: '쿠팡 판매명',
        channelPrice: 12900,
        status: 'active',
      },
      artifacts: [
        {
          artifactType: 'channel_listing_registration',
          targetDomain: 'channels',
          targetModel: 'ChannelListing',
          targetId: 'listing-1',
          title: '등록상품 연결 완료',
          href: '/product-pipeline/registered-products',
          summary: {
            listingId: 'listing-1',
            masterId: MASTER_ID,
            channel: 'coupang',
            channelAccountId: CHANNEL_ACCOUNT_ID,
            externalId: 'COUPANG-720445',
            status: 'active',
          },
        },
      ],
    });
  });

  it('registers full Coupang listing submission as an approval-gated external write capability', async () => {
    const register = vi.fn();
    const registry = { register } as unknown as AgentCapabilityRegistry;
    const marketplaceRegistration = {
      submitCoupangListing: vi.fn().mockResolvedValue({
        listingId: 'listing-1',
        sellerProductId: '427011919',
        masterId: MASTER_ID,
        channel: 'coupang',
        channelAccountId: CHANNEL_ACCOUNT_ID,
        externalId: '427011919',
        status: 'pending_approval',
      }),
    } as unknown as MarketplaceRegistrationService;
    const adapter = new ChannelRegistrationCapabilityAdapter(
      registry,
      marketplaceRegistration,
    );

    adapter.onModuleInit();

    expect(register).toHaveBeenCalledTimes(2);
    const handler = register.mock.calls[1][0];
    expect(handler).toMatchObject({
      key: 'channels.submit_coupang_listing',
      ownerDomain: 'channels',
      executionKind: 'workflow',
      sideEffects: ['external_write', 'db_write'],
      approvalRisk: 'high',
    });
    expect(
      handler.idempotencyKey({
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        agentInstanceId: 'agent-channel-1',
        agentType: 'channel_registration',
        requestId: 'request-1',
        runId: 'run-1',
        input: {
          masterId: MASTER_ID,
          channelAccountId: CHANNEL_ACCOUNT_ID,
          listingPayload: {
            vendorId: 'A00012345',
            sellerProductName: '쿠팡 판매명',
            requested: true,
          },
        },
      }),
    ).toMatch(
      /^org-1:channels\.submit_coupang_listing:00000000-0000-4000-8000-000000000002:00000000-0000-4000-8000-000000000001:/,
    );

    const result = await handler.execute({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      agentInstanceId: 'agent-channel-1',
      agentType: 'channel_registration',
      requestId: 'request-1',
      runId: 'run-1',
      requestedByUserId: 'user-1',
      input: {
        masterId: MASTER_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        productBarcode: ' 8806384882841 ',
        listingPayload: {
          vendorId: 'A00012345',
          sellerProductName: '쿠팡 판매명',
          requested: true,
          items: [{ itemName: '단품', salePrice: 12900 }],
        },
      },
    });

    expect(marketplaceRegistration.submitCoupangListing).toHaveBeenCalledWith(
      'org-1',
      {
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
    );
    expect(result).toEqual({
      resourceType: 'channel_listing',
      resourceId: 'listing-1',
      outputSummary: {
        listingId: 'listing-1',
        sellerProductId: '427011919',
        masterId: MASTER_ID,
        channel: 'coupang',
        channelAccountId: CHANNEL_ACCOUNT_ID,
        externalId: '427011919',
        status: 'pending_approval',
      },
      artifacts: [
        {
          artifactType: 'coupang_listing_submission',
          targetDomain: 'channels',
          targetModel: 'ChannelListing',
          targetId: 'listing-1',
          title: '쿠팡 상품 등록 제출 완료',
          href: '/product-pipeline/registered-products',
          summary: {
            listingId: 'listing-1',
            sellerProductId: '427011919',
            masterId: MASTER_ID,
            channel: 'coupang',
            channelAccountId: CHANNEL_ACCOUNT_ID,
            externalId: '427011919',
            status: 'pending_approval',
          },
        },
      ],
    });
  });
});

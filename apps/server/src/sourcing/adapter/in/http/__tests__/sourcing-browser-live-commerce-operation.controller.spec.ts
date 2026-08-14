import { describe, expect, it, vi } from 'vitest';
import { SourcingBrowserLiveCommerceOperationController } from '../sourcing-browser-live-commerce-operation.controller';

describe('SourcingBrowserLiveCommerceOperationController', () => {
  it('routes a fixed browser live result endpoint through the fenced owner service', async () => {
    const liveCommerce = {
      ingest: vi.fn().mockResolvedValue({
        businessDate: '2026-08-14',
        source: 'douyin',
        broadcastCount: 1,
        productCount: 2,
        duplicate: false,
      }),
    };
    const controller = new SourcingBrowserLiveCommerceOperationController(liveCommerce as never);
    const body = {
      source: 'douyin' as const,
      pageUrl: 'https://live.douyin.com/123',
      broadcast: { broadcastId: 'broadcast-1' },
      products: [{ productId: 'product-1', rank: 1 }],
    };

    await controller.ingestResults(
      '00000000-0000-4000-8000-000000000010',
      body,
      'org-1',
      'attempt-token-1',
    );

    expect(liveCommerce.ingest).toHaveBeenCalledWith({
      organizationId: 'org-1',
      operationRunId: '00000000-0000-4000-8000-000000000010',
      attemptToken: 'attempt-token-1',
      batch: body,
    });
  });
});

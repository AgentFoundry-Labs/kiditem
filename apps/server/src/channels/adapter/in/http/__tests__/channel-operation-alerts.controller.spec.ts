import { describe, expect, it, vi } from 'vitest';
import { ChannelSyncService } from '../../../../application/service/channel-sync.service';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  organizationId: ORGANIZATION_ID,
  membershipId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  role: 'owner',
  type: 'human',
  email: 'owner@example.com',
};

function makeOperationAlerts() {
  return {
    start: vi.fn().mockResolvedValue({}),
    succeed: vi.fn().mockResolvedValue({}),
    fail: vi.fn().mockResolvedValue({}),
  };
}

function makeChannelSyncService(operationAlerts: ReturnType<typeof makeOperationAlerts>) {
  return new ChannelSyncService(
    {} as never,
    {} as never,
    {} as never,
    operationAlerts as never,
  );
}

describe('ChannelSyncService operation alerts', () => {
  it('wraps product sync in an organization-scoped operation alert', async () => {
    const operationAlerts = makeOperationAlerts();
    const service = makeChannelSyncService(operationAlerts);
    vi.spyOn(service, 'syncProducts').mockResolvedValue({
      synced: 3,
      errors: 1,
      details: ['Listing 123: no matching ChannelListing'],
    });

    const result = await service.syncProductsWithAlert(ORGANIZATION_ID, USER.id);

    expect(result).toEqual({
      synced: 3,
      errors: 1,
      details: ['Listing 123: no matching ChannelListing'],
    });
    expect(operationAlerts.start).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        actorUserId: USER.id,
        operationKey: 'coupang-sync:products',
        type: 'coupang_product_sync',
        title: '쿠팡 상품 동기화',
        sourceType: 'coupang_sync',
        sourceId: 'products',
        href: '/inventory',
      }),
    );
    expect(operationAlerts.succeed).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      'coupang-sync:products',
      expect.objectContaining({
        href: '/inventory',
        severity: 'warning',
        metadata: {
          synced: 3,
          errors: 1,
          details: ['Listing 123: no matching ChannelListing'],
        },
      }),
    );
    expect(operationAlerts.fail).not.toHaveBeenCalled();
  });

  it('closes order sync alert as failed when the sync throws', async () => {
    const operationAlerts = makeOperationAlerts();
    const service = makeChannelSyncService(operationAlerts);
    vi.spyOn(service, 'syncOrders').mockRejectedValue(new Error('Coupang timeout'));

    await expect(
      service.syncOrdersWithAlert(
        ORGANIZATION_ID,
        USER.id,
        new Date('2026-05-01T00:00:00.000Z'),
        new Date('2026-05-02T00:00:00.000Z'),
      ),
    ).rejects.toThrow('Coupang timeout');

    expect(operationAlerts.start).toHaveBeenCalledWith(
      expect.objectContaining({
        operationKey: 'coupang-sync:orders',
        type: 'coupang_order_sync',
        href: '/orders',
        metadata: {
          from: '2026-05-01T00:00:00.000Z',
          to: '2026-05-02T00:00:00.000Z',
        },
      }),
    );
    expect(operationAlerts.fail).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      'coupang-sync:orders',
      expect.objectContaining({
        href: '/orders',
        metadata: { error: 'Coupang timeout' },
      }),
    );
  });
});

import { describe, expect, it, vi } from 'vitest';
import { ChannelReconciliationController } from '../channel-reconciliation.controller';
import { ChannelSyncController } from '../channel-sync.controller';

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

describe('ChannelSyncController operation alerts', () => {
  it('wraps product sync in an organization-scoped operation alert', async () => {
    const syncService = {
      checkHealth: vi.fn(),
      syncProducts: vi.fn().mockResolvedValue({
        synced: 3,
        errors: 1,
        details: ['Listing 123: no matching ChannelListing'],
      }),
      syncOrders: vi.fn(),
      syncInventory: vi.fn(),
    };
    const operationAlerts = makeOperationAlerts();
    const controller = new ChannelSyncController(
      syncService as never,
      operationAlerts as never,
    );

    const result = await controller.syncProducts(ORGANIZATION_ID, USER);

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
    const syncService = {
      checkHealth: vi.fn(),
      syncProducts: vi.fn(),
      syncOrders: vi.fn().mockRejectedValue(new Error('Coupang timeout')),
      syncInventory: vi.fn(),
    };
    const operationAlerts = makeOperationAlerts();
    const controller = new ChannelSyncController(
      syncService as never,
      operationAlerts as never,
    );

    await expect(
      controller.syncOrders(
        { from: '2026-05-01T00:00:00.000Z', to: '2026-05-02T00:00:00.000Z' },
        ORGANIZATION_ID,
        USER,
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

describe('ChannelReconciliationController operation alerts', () => {
  it('wraps image-listing queue rebuild in an operation alert', async () => {
    const service = {
      scanFromRows: vi.fn(),
      syncFromImageSyncedListings: vi.fn().mockResolvedValue({
        runId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        totalCount: 5,
        alreadyLinkedCount: 2,
        autoLinkedCount: 1,
        needsReviewCount: 1,
        conflictCount: 1,
        errorCount: 0,
        optionLinkedCount: 3,
        optionLinkAmbiguousCount: 0,
        optionLinkNoCandidateCount: 1,
      }),
      getSummary: vi.fn(),
      listItems: vi.fn(),
      linkItem: vi.fn(),
      ignoreItem: vi.fn(),
    };
    const operationAlerts = makeOperationAlerts();
    const controller = new ChannelReconciliationController(
      service as never,
      operationAlerts as never,
    );

    await controller.syncFromImageListings(ORGANIZATION_ID, USER);

    expect(operationAlerts.start).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        actorUserId: USER.id,
        operationKey: 'channel-reconciliation:sync-from-image-listings',
        type: 'channel_reconciliation_sync',
        title: '이미지 동기화 데이터 점검',
        sourceType: 'channel_reconciliation',
        sourceId: 'sync-from-image-listings',
        href: '/product-hub/matching',
      }),
    );
    expect(operationAlerts.succeed).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      'channel-reconciliation:sync-from-image-listings',
      expect.objectContaining({
        href: '/product-hub/matching',
        severity: 'warning',
        metadata: expect.objectContaining({
          runId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
          totalCount: 5,
          needsReviewCount: 1,
          conflictCount: 1,
        }),
      }),
    );
  });
});

import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SourcingWorkspaceSnapshotController } from '../sourcing-workspace-snapshot.controller';

describe('SourcingWorkspaceSnapshotController', () => {
  it('saves client-writable scopes through the organization-scoped service', async () => {
    const snapshots = {
      saveToday: vi.fn().mockResolvedValue(row('today_recommendations')),
    };
    const controller = new SourcingWorkspaceSnapshotController(snapshots as never);

    const result = await controller.saveToday(
      { scope: 'today_recommendations' },
      { payload: { recommendations: [] } },
      'org-1',
    );

    expect(snapshots.saveToday).toHaveBeenCalledWith('org-1', 'today_recommendations', {
      recommendations: [],
    });
    expect(result.snapshot.scope).toBe('today_recommendations');
    expect(result.snapshot.businessDate).toBe('2026-06-24');
  });

  it('does not let clients overwrite server-generated scopes', async () => {
    const snapshots = {
      saveToday: vi.fn(),
    };
    const controller = new SourcingWorkspaceSnapshotController(snapshots as never);

    await expect(
      controller.saveToday({ scope: 'sourcing_market_model' }, { payload: {} }, 'org-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(snapshots.saveToday).not.toHaveBeenCalled();
  });

  it('does not let clients replace interest or 1688 aggregate snapshots', async () => {
    const snapshots = {
      saveToday: vi.fn(),
    };
    const controller = new SourcingWorkspaceSnapshotController(snapshots as never);

    await expect(
      controller.saveToday({ scope: 'interest_tracking' }, { payload: {} }, 'org-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.saveToday({ scope: '1688_new_products' }, { payload: {} }, 'org-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(snapshots.saveToday).not.toHaveBeenCalled();
  });

  it('uses the atomic server append for 1688 items', async () => {
    const snapshots = {
      append1688NewProductItems: vi.fn().mockResolvedValue(row('1688_new_products')),
    };
    const controller = new SourcingWorkspaceSnapshotController(snapshots as never);

    const result = await controller.append1688NewProductItems({
      source: '1688_keyword',
      keyword: '슬라임',
      items: [{ offerId: 'offer-1', title: '슬라임', sourceUrl: 'https://detail.1688.com/offer/1.html' }],
    }, 'org-1');

    expect(snapshots.append1688NewProductItems).toHaveBeenCalledWith('org-1', expect.objectContaining({
      source: '1688_keyword',
    }));
    expect(result.snapshot.scope).toBe('1688_new_products');
  });

  it('still allows reading server-generated scopes', async () => {
    const snapshots = {
      getToday: vi.fn().mockResolvedValue(row('sourcing_market_model')),
    };
    const controller = new SourcingWorkspaceSnapshotController(snapshots as never);

    const result = await controller.getToday({ scope: 'sourcing_market_model' }, 'org-1');

    expect(snapshots.getToday).toHaveBeenCalledWith('org-1', 'sourcing_market_model');
    expect(result.snapshot?.scope).toBe('sourcing_market_model');
  });
});

function row(scope: string) {
  const now = new Date('2026-06-24T12:00:00.000Z');

  return {
    id: `${scope}-snapshot`,
    scope,
    businessDate: new Date('2026-06-24T00:00:00.000Z'),
    payload: {},
    createdAt: now,
    updatedAt: now,
  };
}

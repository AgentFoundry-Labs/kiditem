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

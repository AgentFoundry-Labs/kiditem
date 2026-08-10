import { describe, expect, it, vi } from 'vitest';
import { SourcingWorkspaceController } from '../sourcing-workspace.controller';

describe('SourcingWorkspaceController', () => {
  it('uses the authenticated organization for recommendation refresh and Wing ingest', async () => {
    const recommendations = {
      latest: vi.fn(async () => ({ status: 'ready' })),
      refresh: vi.fn(async () => ({ status: 'ready' })),
    };
    const wing = { ingest: vi.fn(async () => ({ kind: 'committed' })) };
    const controller = new SourcingWorkspaceController(recommendations as never, wing as never);
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const user = { id: '00000000-0000-4000-8000-000000000002' };

    await controller.listRecommendations({ surface: 'entry', limit: 20 }, organizationId);
    await controller.refreshRecommendations(organizationId);
    await controller.ingestCoupangObservations(
      {
        idempotencyKey: '00000000-0000-4000-8000-000000000003',
        items: [],
      } as never,
      organizationId,
      user as never,
    );

    expect(recommendations.latest).toHaveBeenCalledWith({ organizationId, surface: 'entry', limit: 20 });
    expect(recommendations.refresh).toHaveBeenCalledWith({ organizationId, limit: 50 });
    expect(wing.ingest).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, actorUserId: user.id }),
    );
  });
});

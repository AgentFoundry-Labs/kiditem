import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RebuildReadinessGuard } from '../rebuild-readiness.guard';

const organizationId = '00000000-0000-4000-8000-000000000001';

function context(path: string) {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ path, authUser: { organizationId } }),
    }),
  } as never;
}

describe('RebuildReadinessGuard', () => {
  it('blocks ordinary operations while the organization requires authoritative imports', async () => {
    const prisma = {
      systemSetting: {
        findUnique: vi.fn(async () => ({
          value: { state: 'snapshot_required', target: 'staging', originRunId: '12345' },
        })),
      },
    };
    const guard = new RebuildReadinessGuard(prisma as never);

    await expect(guard.canActivate(context('/api/orders')))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.systemSetting.findUnique).toHaveBeenCalledWith({
      where: {
        organizationId_key: {
          organizationId,
          key: 'inventory.rebuild.status',
        },
      },
      select: { value: true },
    });
  });

  it.each([
    '/api/auth/me',
    '/api/readiness/rebuild',
    '/api/inventory/sellpia-sync/import',
    '/api/channels/accounts/account-1/catalog-imports/coupang-wing',
    '/api/ads/extension/sync',
  ])('allows rebuild-critical path %s while snapshot is required', async (path) => {
    const prisma = {
      systemSetting: {
        findUnique: vi.fn(async () => ({ value: { state: 'snapshot_required' } })),
      },
    };
    const guard = new RebuildReadinessGuard(prisma as never);

    await expect(guard.canActivate(context(path))).resolves.toBe(true);
  });

  it('allows ordinary operations when no rebuild is active or it is ready', async () => {
    for (const value of [null, { value: { state: 'ready' } }]) {
      const prisma = { systemSetting: { findUnique: vi.fn(async () => value) } };
      const guard = new RebuildReadinessGuard(prisma as never);
      await expect(guard.canActivate(context('/api/orders'))).resolves.toBe(true);
    }
  });
});

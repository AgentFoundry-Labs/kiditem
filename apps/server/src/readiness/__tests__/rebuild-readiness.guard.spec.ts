import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RebuildReadinessGuard } from '../rebuild-readiness.guard';

const organizationId = '00000000-0000-4000-8000-000000000001';

function context(
  path: string,
  input: { method?: string; body?: Record<string, unknown> } = {},
) {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({
        path,
        method: input.method ?? 'GET',
        body: input.body ?? {},
        authUser: { organizationId },
      }),
    }),
  } as never;
}

describe('RebuildReadinessGuard', () => {
  it('blocks ordinary operations while the organization requires authoritative imports', async () => {
    const prisma = {
      systemSetting: {
        findUnique: vi.fn(async () => ({
          value: { state: 'snapshot_required', target: 'office', originRunId: '12345' },
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
    ['GET', '/api/auth/me'],
    ['GET', '/api/readiness/rebuild'],
    ['POST', '/api/inventory/sellpia-sync/import'],
    ['GET', '/api/inventory/sellpia-sync/import-runs'],
    ['POST', '/api/channels/accounts/account-1/catalog-imports/coupang-wing'],
  ] as const)('allows rebuild-critical request %s %s while snapshot is required', async (method, path) => {
    const prisma = {
      systemSetting: {
        findUnique: vi.fn(async () => ({ value: { state: 'snapshot_required' } })),
      },
    };
    const guard = new RebuildReadinessGuard(prisma as never);

    await expect(guard.canActivate(context(path, { method }))).resolves.toBe(true);
  });

  it('allows only the exact GET channel-account collection needed by the Wing import UI', async () => {
    const prisma = {
      systemSetting: {
        findUnique: vi.fn(async () => ({
          value: { state: 'snapshot_required', originRunId: '12345' },
        })),
      },
    };
    const guard = new RebuildReadinessGuard(prisma as never);

    await expect(guard.canActivate(context('/api/channels/accounts', { method: 'GET' })))
      .resolves.toBe(true);
    for (const [method, path] of [
      ['POST', '/api/channels/accounts'],
      ['PATCH', '/api/channels/accounts'],
      ['GET', '/api/channels/accounts/account-1'],
      ['GET', '/api/channels/listings'],
    ] as const) {
      await expect(guard.canActivate(context(path, { method })))
        .rejects.toBeInstanceOf(ServiceUnavailableException);
    }
  });

  it('allows ordinary operations when no rebuild is active or it is ready', async () => {
    for (const value of [null, { value: { state: 'ready' } }]) {
      const prisma = { systemSetting: { findUnique: vi.fn(async () => value) } };
      const guard = new RebuildReadinessGuard(prisma as never);
      await expect(guard.canActivate(context('/api/orders'))).resolves.toBe(true);
    }
  });
});

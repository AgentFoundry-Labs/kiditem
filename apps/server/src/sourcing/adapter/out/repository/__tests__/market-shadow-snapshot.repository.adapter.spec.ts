import { describe, expect, it, vi } from 'vitest';
import { MARKET_SHADOW_SNAPSHOT_SCOPE } from '../../../../application/port/out/repository/market-shadow-snapshot.repository.port';
import { MarketShadowSnapshotRepositoryAdapter } from '../market-shadow-snapshot.repository.adapter';
import type { PrismaService } from '../../../../../prisma/prisma.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const BUSINESS_DATE = new Date('2026-07-15T00:00:00.000Z');
const CREATED_AT = new Date('2026-07-15T01:00:00.000Z');

describe('MarketShadowSnapshotRepositoryAdapter', () => {
  it('claims an organization business date once under an organization-scoped advisory lock', async () => {
    const rawCalls: unknown[][] = [];
    const findUnique = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue(row({ payload: { status: 'collecting' } }));
    const tx = {
      $queryRaw: (...args: unknown[]) => {
        rawCalls.push(args);
        return Promise.resolve([{ lock: '' }]);
      },
      sourcingWorkspaceSnapshot: { findUnique, create },
    };
    const prisma = {
      $transaction: (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
    } as unknown as PrismaService;
    const adapter = new MarketShadowSnapshotRepositoryAdapter(prisma);

    const result = await adapter.claimDaily({
      organizationId: ORGANIZATION_ID,
      businessDate: BUSINESS_DATE,
      payload: { status: 'collecting' },
    });

    expect(result).toEqual({
      claimed: true,
      row: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        businessDate: BUSINESS_DATE,
        payload: { status: 'collecting' },
      }),
    });
    expect(rawCalls).toHaveLength(1);
    expect((rawCalls[0][0] as readonly string[]).join('?')).toContain(
      'WHERE organization_id = ?::uuid',
    );
    expect(rawCalls[0].slice(1)).toEqual([
      `${MARKET_SHADOW_SNAPSHOT_SCOPE}:${ORGANIZATION_ID}:2026-07-15`,
      ORGANIZATION_ID,
      ORGANIZATION_ID,
    ]);
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        organizationId_scope_businessDate: {
          organizationId: ORGANIZATION_ID,
          scope: MARKET_SHADOW_SNAPSHOT_SCOPE,
          businessDate: BUSINESS_DATE,
        },
      },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        organizationId: ORGANIZATION_ID,
        scope: MARKET_SHADOW_SNAPSHOT_SCOPE,
        businessDate: BUSINESS_DATE,
        payload: { status: 'collecting' },
      },
    });
  });

  it.each(['collecting', 'complete', 'failed'])(
    'does not reclaim an existing %s snapshot',
    async (status) => {
      const existing = row({ payload: { status } });
      const create = vi.fn();
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([{ lock: '' }]),
        sourcingWorkspaceSnapshot: {
          findUnique: vi.fn().mockResolvedValue(existing),
          create,
        },
      };
      const prisma = {
        $transaction: (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
      } as unknown as PrismaService;
      const adapter = new MarketShadowSnapshotRepositoryAdapter(prisma);

      const result = await adapter.claimDaily({
        organizationId: ORGANIZATION_ID,
        businessDate: BUSINESS_DATE,
        payload: { status: 'collecting' },
      });

      expect(result).toEqual({ claimed: false, row: expect.objectContaining({ payload: { status } }) });
      expect(create).not.toHaveBeenCalled();
    },
  );

  it('rejects a non-JSON payload before creating the claim row', async () => {
    const create = vi.fn();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ lock: '' }]),
      sourcingWorkspaceSnapshot: {
        findUnique: vi.fn().mockResolvedValue(null),
        create,
      },
    };
    const prisma = {
      $transaction: (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
    } as unknown as PrismaService;
    const adapter = new MarketShadowSnapshotRepositoryAdapter(prisma);

    await expect(
      adapter.claimDaily({
        organizationId: ORGANIZATION_ID,
        businessDate: BUSINESS_DATE,
        payload: { status: 'collecting', unsupported: undefined },
      }),
    ).rejects.toThrow('Market shadow snapshot payload must contain only JSON values');
    expect(create).not.toHaveBeenCalled();
  });

  it('finalizes only the claimed organization scope and reports a missing claim explicitly', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({ id: 'snapshot-1' })
      .mockResolvedValueOnce(null);
    const update = vi.fn().mockResolvedValue(row({ payload: { status: 'complete' } }));
    const prisma = {
      sourcingWorkspaceSnapshot: { findUnique, update },
    } as unknown as PrismaService;
    const adapter = new MarketShadowSnapshotRepositoryAdapter(prisma);

    const finalized = await adapter.finalizeDaily({
      organizationId: ORGANIZATION_ID,
      businessDate: BUSINESS_DATE,
      payload: { status: 'complete' },
    });

    expect(finalized.payload).toEqual({ status: 'complete' });
    expect(update).toHaveBeenCalledWith({
      where: {
        organizationId_scope_businessDate: {
          organizationId: ORGANIZATION_ID,
          scope: MARKET_SHADOW_SNAPSHOT_SCOPE,
          businessDate: BUSINESS_DATE,
        },
      },
      data: { payload: { status: 'complete' } },
    });

    await expect(
      adapter.finalizeDaily({
        organizationId: OTHER_ORGANIZATION_ID,
        businessDate: BUSINESS_DATE,
        payload: { status: 'complete' },
      }),
    ).rejects.toThrow('Market shadow snapshot was not claimed for 2026-07-15');
  });

  it('lists only the organization shadow scope within the requested date range', async () => {
    const findMany = vi.fn().mockResolvedValue([
      row({ businessDate: new Date('2026-07-15T00:00:00.000Z') }),
      row({ businessDate: new Date('2026-07-14T00:00:00.000Z') }),
    ]);
    const prisma = {
      sourcingWorkspaceSnapshot: { findMany },
    } as unknown as PrismaService;
    const adapter = new MarketShadowSnapshotRepositoryAdapter(prisma);
    const fromBusinessDate = new Date('2026-06-16T00:00:00.000Z');

    const rows = await adapter.listRecent({
      organizationId: ORGANIZATION_ID,
      fromBusinessDate,
      toBusinessDate: BUSINESS_DATE,
      limit: 30,
    });

    expect(rows.map((item) => item.businessDate.toISOString().slice(0, 10))).toEqual([
      '2026-07-15',
      '2026-07-14',
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        scope: MARKET_SHADOW_SNAPSHOT_SCOPE,
        businessDate: {
          gte: fromBusinessDate,
          lte: BUSINESS_DATE,
        },
      },
      orderBy: { businessDate: 'desc' },
      take: 30,
    });
  });
});

function row(
  overrides: Partial<{
    id: string;
    organizationId: string;
    scope: string;
    businessDate: Date;
    payload: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
  }> = {},
) {
  return {
    id: 'snapshot-1',
    organizationId: ORGANIZATION_ID,
    scope: MARKET_SHADOW_SNAPSHOT_SCOPE,
    businessDate: BUSINESS_DATE,
    payload: {},
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

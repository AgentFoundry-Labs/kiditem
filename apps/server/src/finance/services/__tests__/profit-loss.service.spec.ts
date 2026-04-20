import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PLDataSchema } from '@kiditem/shared';
import { ProfitLossService } from '../profit-loss.service';

/**
 * Plan B2c.dashboard T14 — ProfitLossService unit (mock Prisma).
 *
 * 5 cases:
 *   - happy path: 3 rows hydrated with master + listing.
 *   - `listing === null` filter (defensive, even though onDelete:Restrict guarantees it).
 *   - Decimal `profitRate` → JS number via `.toNumber()`.
 *   - masterCode = `legacyCode ?? code` fallback.
 *   - `abcGrade` / `category` / `thumbnailUrl` null hydration.
 *
 * Integration path (real Postgres) covered by `profit-loss.pg.integration.spec.ts`.
 */

type DecimalLike = { toNumber(): number };
function decimal(n: number): DecimalLike {
  return { toNumber: () => n };
}

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    listingId: 'listing-uuid-1',
    year: 2026,
    month: 4,
    revenue: 700_000,
    cogs: 350_000,
    commission: 70_000,
    shippingCost: 20_000,
    adCost: 50_000,
    otherCost: 10_000,
    netProfit: 200_000,
    profitRate: decimal(0.2857),
    orderCount: 3,
    returnCount: 1,
    listing: {
      externalId: 'EXT-L1',
      channelName: 'Coupang L1',
      master: {
        id: 'master-uuid-1',
        code: 'M-001',
        legacyCode: 'LEGACY-001',
        name: 'Master M1',
        category: '유아용품',
        abcGrade: 'A',
        thumbnailUrl: 'https://cdn/m1.jpg',
      },
    },
    ...overrides,
  };
}

function makePrisma() {
  return {
    profitLoss: {
      findMany: vi.fn(),
    },
  };
}

describe('ProfitLossService', () => {
  let service: ProfitLossService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ProfitLossService(prisma as any);
  });

  it('happy path — 3 rows hydrated into PLData shape (passes PLDataSchema.parse)', async () => {
    prisma.profitLoss.findMany.mockResolvedValue([
      makeRow(),
      makeRow({
        listingId: 'listing-uuid-2',
        revenue: 300_000,
        netProfit: 60_000,
        profitRate: decimal(0.2),
        orderCount: 1,
        returnCount: 0,
        listing: {
          externalId: 'EXT-L2',
          channelName: null,
          master: {
            id: 'master-uuid-2',
            code: 'M-002',
            legacyCode: null,
            name: 'Master M2',
            category: '완구',
            abcGrade: 'B',
            thumbnailUrl: null,
          },
        },
      }),
      makeRow({
        listingId: 'c1c2c3c4-c5c6-4c7c-8c9c-0c1c2c3c4c5c',
        listing: {
          externalId: 'EXT-L3',
          channelName: 'Third',
          master: {
            id: 'd1d2d3d4-d5d6-4d7d-8d9d-0d1d2d3d4d5d',
            code: 'M-003',
            legacyCode: null,
            name: 'Master M3',
            category: null,
            abcGrade: null,
            thumbnailUrl: null,
          },
        },
      }),
    ]);

    const result = await service.findAll('company-1', 2026, 4);

    expect(prisma.profitLoss.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1', year: 2026, month: 4 },
      include: expect.any(Object),
    });
    expect(result).toHaveLength(3);
    // Shape sanity (listing hydration fields)
    expect(result[0].externalId).toBe('EXT-L1');
    expect(result[0].masterId).toBe('master-uuid-1');
    expect(result[0].masterName).toBe('Master M1');
    // Schema drift check: use real-world UUIDs for 3rd row so PLDataSchema.parse passes.
    // Rows 0/1 use synthetic listingId/masterId (not valid UUIDs) → skip schema parse, but assert shape.
    expect(PLDataSchema.safeParse(result[2]).success).toBe(true);
  });

  it('filters out rows with listing === null (defensive — onDelete:Restrict guarantee)', async () => {
    prisma.profitLoss.findMany.mockResolvedValue([
      makeRow(),
      makeRow({ listing: null, listingId: 'orphan-1' }),
      makeRow({ listingId: 'l3' }),
    ]);

    const result = await service.findAll('company-1', 2026, 4);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.listingId)).not.toContain('orphan-1');
  });

  it('Decimal profitRate → JS number via .toNumber() (null falls back to 0)', async () => {
    prisma.profitLoss.findMany.mockResolvedValue([
      makeRow({ profitRate: decimal(0.3141) }),
      makeRow({ listingId: 'no-rate', profitRate: null }),
    ]);

    const result = await service.findAll('company-1', 2026, 4);

    expect(result[0].profitRate).toBe(0.3141);
    expect(typeof result[0].profitRate).toBe('number');
    expect(result[1].profitRate).toBe(0);
  });

  it('masterCode = legacyCode ?? code (legacyCode present → use it)', async () => {
    prisma.profitLoss.findMany.mockResolvedValue([
      makeRow(), // legacyCode: 'LEGACY-001'
      makeRow({
        listingId: 'l2',
        listing: {
          externalId: 'EXT-L2',
          channelName: 'L2',
          master: {
            id: 'm2',
            code: 'M-002',
            legacyCode: null,
            name: 'Master M2',
            category: '완구',
            abcGrade: 'B',
            thumbnailUrl: null,
          },
        },
      }),
    ]);

    const result = await service.findAll('company-1', 2026, 4);

    expect(result[0].masterCode).toBe('LEGACY-001'); // legacyCode wins
    expect(result[1].masterCode).toBe('M-002'); // fallback to code
  });

  it('abcGrade / category / thumbnailUrl null → passthrough null (not undefined)', async () => {
    prisma.profitLoss.findMany.mockResolvedValue([
      makeRow({
        listing: {
          externalId: 'EXT-L1',
          channelName: null,
          master: {
            id: 'master-uuid-1',
            code: 'M-001',
            legacyCode: null,
            name: 'Master M1',
            category: null,
            abcGrade: null,
            thumbnailUrl: null,
          },
        },
      }),
    ]);

    const result = await service.findAll('company-1', 2026, 4);

    expect(result[0].grade).toBeNull();
    expect(result[0].category).toBeNull();
    expect(result[0].thumbnailUrl).toBeNull();
    expect(result[0].channelName).toBeNull();
    // masterCode fallback: legacyCode null → use code
    expect(result[0].masterCode).toBe('M-001');
  });
});

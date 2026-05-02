import { describe, expect, it, vi } from 'vitest';
import { ReadinessService } from '../readiness.service';

const ORGANIZATION_ID = '00000000-0000-0000-0000-0000000c0001';

describe('ReadinessService', () => {
  it('includes the KST reference date when querying @db.Date business dates', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T01:00:00.000Z'));

    const expectedDates = [
      '2026-04-18',
      '2026-04-19',
      '2026-04-20',
      '2026-04-21',
      '2026-04-22',
      '2026-04-23',
      '2026-04-24',
      '2026-04-25',
      '2026-04-26',
      '2026-04-27',
      '2026-04-28',
      '2026-04-29',
      '2026-04-30',
      '2026-05-01',
    ];
    const row = (businessDate: string) => ({
      businessDate: new Date(`${businessDate}T00:00:00.000Z`),
      lastObservedAt: new Date('2026-05-02T01:00:00.000Z'),
    });

    const prisma = {
      channelAccountDailyKpiSnapshot: {
        findMany: vi.fn(async ({ where }) => {
          if (where.source === 'wing') {
            return expectedDates.map(row);
          }
          return expectedDates.filter((d) => d !== '2026-04-18').map(row);
        }),
        findFirst: vi.fn(async () => ({
          businessDate: new Date('2026-05-02T00:00:00.000Z'),
          lastObservedAt: new Date('2026-05-02T01:00:00.000Z'),
        })),
      },
      masterProduct: {
        count: vi.fn(async () => 1752),
        findFirst: vi.fn(async () => ({ updatedAt: new Date('2026-05-02T01:00:00.000Z') })),
      },
    };

    const service = new ReadinessService(prisma as never);
    const status = await service.getStatus(ORGANIZATION_ID);

    const wingQuery = prisma.channelAccountDailyKpiSnapshot.findMany.mock.calls[0][0];
    const adsQuery = prisma.channelAccountDailyKpiSnapshot.findMany.mock.calls[1][0];
    expect(wingQuery.where.businessDate).toEqual({
      gte: new Date('2026-04-18T00:00:00.000Z'),
      lte: new Date('2026-05-01T00:00:00.000Z'),
    });
    expect(adsQuery.where.businessDate.lte).toEqual(new Date('2026-05-01T00:00:00.000Z'));

    const wingSales = status.checks.find((check) => check.key === 'wing_sales');
    const coupangAds = status.checks.find((check) => check.key === 'coupang_ads');
    expect(wingSales?.status).toBe('ok');
    expect(coupangAds?.status).toBe('stale');
    expect(coupangAds?.missingDates).toEqual(['2026-04-18']);
  });
});

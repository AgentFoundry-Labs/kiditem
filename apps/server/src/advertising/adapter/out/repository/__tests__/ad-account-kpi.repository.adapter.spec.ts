import { describe, expect, it, vi } from 'vitest';
import { AdAccountKpiRepositoryAdapter } from '../ad-account-kpi.repository.adapter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

function buildAdapter() {
  const queryRaw = vi.fn().mockResolvedValue([]);
  const channelAccount = {
    findFirst: vi.fn().mockResolvedValue({ id: ACCOUNT_ID }),
  };
  const adapter = new AdAccountKpiRepositoryAdapter({
    $queryRaw: queryRaw,
    channelAccount,
  } as never);
  return { adapter, queryRaw };
}

describe('AdAccountKpiRepositoryAdapter complete-day range', () => {
  it('reads exactly seven business dates ending yesterday KST', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T03:00:00.000Z'));
    try {
      const { adapter, queryRaw } = buildAdapter();
      await adapter.findCoupangAdsDaily(ORGANIZATION_ID, '7d');

      const query = queryRaw.mock.calls[0][0] as {
        strings: readonly string[];
        values: readonly unknown[];
      };
      expect(query.strings.join(' ')).toContain('business_date >=');
      expect(query.strings.join(' ')).toContain('business_date <=');
      expect(query.values).toEqual(
        expect.arrayContaining([
          new Date('2026-07-17T00:00:00.000Z'),
          new Date('2026-07-23T00:00:00.000Z'),
        ]),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses an explicit custom date range unchanged', async () => {
    const { adapter, queryRaw } = buildAdapter();
    const dateRange = {
      from: new Date('2026-06-01T00:00:00.000Z'),
      to: new Date('2026-06-30T00:00:00.000Z'),
    };

    await adapter.findCoupangAdsDaily(
      ORGANIZATION_ID,
      'month',
      dateRange,
    );

    const query = queryRaw.mock.calls[0][0] as {
      values: readonly unknown[];
    };
    expect(query.values).toEqual(
      expect.arrayContaining([dateRange.from, dateRange.to]),
    );
  });
});

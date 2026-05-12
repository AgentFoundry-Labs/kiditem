import { describe, it, expect, vi } from 'vitest';
import { AdStrategyContextRepositoryAdapter } from '../ad-strategy-context.repository.adapter';
import type { AdsConfig } from '../../../../domain/model/strategy-types';

// Equivalence snapshot for `AdStrategyContextRepositoryAdapter.loadStrategyContext`.
//
// Purpose: pin the structural shape of the `StrategyContext` returned by the
// adapter so the back-reference refactor — where the adapter no longer reaches
// into `AdConfigService` and instead receives `config` as a parameter — cannot
// silently change the output. The critical regression-guard is the
// referential-equality assertion on the `config` field: if anyone re-introduces
// a back-reference that rebuilds/clones the config, that `toBe` check fails.
//
// This is a unit-style spec with a hand-crafted Prisma mock; it only walks the
// happy path with empty fixtures. Detailed SQL semantics are covered by the
// integration specs (`ad-strategy-flow.pg.integration.spec.ts`).
describe('AdStrategyContextRepositoryAdapter — loadStrategyContext equivalence snapshot', () => {
  const buildPrismaMock = () => ({
    channelListingDailySnapshot: {
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    channelListing: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    masterProduct: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    productOption: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    channelListingOption: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    inventory: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  });

  it('returns the StrategyContext keys agreed with the strategy services', async () => {
    const prismaMock = buildPrismaMock();
    const adapter = new AdStrategyContextRepositoryAdapter(prismaMock as any);
    const config = Object.freeze({ marker: 'TEST_CONFIG' }) as unknown as AdsConfig;

    const result = await adapter.loadStrategyContext('org-1', 2026, 5, config);

    expect(Object.keys(result).sort()).toEqual(
      [
        'adGroups',
        'adIssuesAdGroups',
        'channelStateByListing',
        'config',
        'gradeMap',
        'listings',
        'profitRateByListing',
        'trafficByListing',
      ].sort(),
    );
  });

  it('returns the exact `config` reference passed in (back-reference regression guard)', async () => {
    const prismaMock = buildPrismaMock();
    const adapter = new AdStrategyContextRepositoryAdapter(prismaMock as any);
    const config = Object.freeze({ marker: 'TEST_CONFIG' }) as unknown as AdsConfig;

    const result = await adapter.loadStrategyContext('org-1', 2026, 5, config);

    // Referential equality — if anyone re-introduces an AdConfigService back-
    // reference inside the adapter that rebuilds/clones the config, this fails.
    expect(result.config).toBe(config);
  });

  it('produces empty Maps / arrays when the underlying tables are empty', async () => {
    const prismaMock = buildPrismaMock();
    const adapter = new AdStrategyContextRepositoryAdapter(prismaMock as any);
    const config = Object.freeze({ marker: 'TEST_CONFIG' }) as unknown as AdsConfig;

    const result = await adapter.loadStrategyContext('org-1', 2026, 5, config);

    expect(result.adGroups).toEqual([]);
    expect(result.adIssuesAdGroups).toEqual([]);
    expect(result.listings).toEqual([]);
    expect(result.profitRateByListing).toBeInstanceOf(Map);
    expect(result.profitRateByListing.size).toBe(0);
    expect(result.channelStateByListing).toBeInstanceOf(Map);
    expect(result.channelStateByListing.size).toBe(0);
    expect(result.gradeMap).toBeInstanceOf(Map);
    expect(result.gradeMap.size).toBe(0);
    expect(result.trafficByListing).toBeInstanceOf(Map);
    expect(result.trafficByListing.size).toBe(0);
    // `config` still passes through unchanged on the empty-fixture path.
    expect(result.config).toBe(config);
  });
});

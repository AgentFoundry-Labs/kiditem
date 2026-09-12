import { describe, expect, it, vi } from 'vitest';
import { PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH } from '@kiditem/shared/product-abc';
import {
  allocateIntegerKrw,
  batchUpdateFactAllocations,
  ProfitabilityAdImportRepositoryAdapter,
  profitabilityCoverageForKstYesterday,
} from '../profitability-ad-import.repository.adapter';

describe('ProfitabilityAdImportRepositoryAdapter', () => {
  it('plans the latest twelve calendar months through KST yesterday', () => {
    const coverage = profitabilityCoverageForKstYesterday(
      new Date('2026-09-07T03:00:00.000Z'),
    );

    expect(coverage).toMatchObject({
      from: '2025-10-01',
      to: '2026-09-06',
      months: [
        '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03',
        '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
      ],
    });
    expect(coverage.periods).toHaveLength(12);
    expect(coverage.periods.at(-1)).toMatchObject({
      month: '2026-09',
      from: '2026-09-01',
      to: '2026-09-06',
    });
    expect(coverage.periods.at(-1)?.businessDates).toEqual([
      '2026-09-01', '2026-09-02', '2026-09-03',
      '2026-09-04', '2026-09-05', '2026-09-06',
    ]);
  });

  it('rolls the twelve-bucket window at the KST month boundary', () => {
    const coverage = profitabilityCoverageForKstYesterday(
      new Date('2026-09-01T03:00:00.000Z'),
    );

    expect(coverage).toMatchObject({ from: '2025-09-01', to: '2026-08-31' });
    expect(coverage.months).toHaveLength(12);
    expect(coverage.months[0]).toBe('2025-09');
    expect(coverage.months.at(-1)).toBe('2026-08');
    expect(coverage.periods.at(-1)?.businessDates).toHaveLength(31);
  });

  it('keeps leap-day and current-partial-month day counts exact', () => {
    const coverage = profitabilityCoverageForKstYesterday(
      new Date('2024-03-01T03:00:00.000Z'),
    );

    expect(coverage).toMatchObject({ from: '2023-03-01', to: '2024-02-29' });
    expect(coverage.periods.at(-1)).toMatchObject({
      month: '2024-02',
      from: '2024-02-01',
      to: '2024-02-29',
    });
    expect(coverage.periods.at(-1)?.businessDates).toHaveLength(29);
    expect(coverage.periods.every((period) =>
      period.businessDates.at(-1) === period.to)).toBe(true);
  });

  it('conserves listing-day KRW and breaks equal remainders by lowercase master id', () => {
    expect(allocateIntegerKrw(10, [
      { masterProductId: 'b', weight: 1 },
      { masterProductId: 'a', weight: 1 },
      { masterProductId: 'c', weight: 1 },
    ])).toEqual([
      { masterProductId: 'a', allocatedSpend: 4 },
      { masterProductId: 'b', allocatedSpend: 3 },
      { masterProductId: 'c', allocatedSpend: 3 },
    ]);
  });

  it('returns zero shares for zero spend without changing the recipe basis', () => {
    expect(allocateIntegerKrw(0, [
      { masterProductId: 'a', weight: 2 },
    ])).toEqual([{ masterProductId: 'a', allocatedSpend: 0 }]);
  });

  it('writes allocations in bounded set-based batches', async () => {
    const executeRaw = vi.fn()
      .mockResolvedValueOnce(1_000)
      .mockResolvedValueOnce(1);
    const updates = Array.from({ length: 1_001 }, (_, index) => ({
      id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
      allocatedSpend: BigInt(index),
      observedTargetDayCount: 31,
    }));

    await batchUpdateFactAllocations(
      { $executeRaw: executeRaw } as never,
      {
        organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        sourceImportRunId: '22222222-2222-4222-8222-222222222222',
        mappingGeneration: 3n,
      },
      updates,
    );

    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(executeRaw.mock.calls[0]?.[0].strings.join(' ')).toContain(
      'UPDATE channel_ad_listing_product_monthly_facts',
    );
    expect(executeRaw.mock.calls[0]?.[0].strings.join(' ')).toContain('FROM (VALUES');
    expect(executeRaw.mock.calls[1]?.[0].strings.join(' ')).toContain(
      'UPDATE channel_ad_listing_product_monthly_facts',
    );
  });

  it('keeps the bounded source snapshot metadata-only and defers facts to exact read', async () => {
    const run = {
      id: '11111111-1111-4111-8111-111111111111',
      organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sourceType: 'coupang_ad_profitability',
      status: 'completed',
      attemptToken: '22222222-2222-4222-8222-222222222222',
      plan: {
        mappingGeneration: '3',
        adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
        accounts: [],
      },
      expiresAt: new Date('2026-09-04T01:00:00.000Z'),
      publicationSequence: 4n,
      mappingGeneration: 3n,
      adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
      coverageStartDate: new Date('2025-09-01T00:00:00.000Z'),
      coverageEndDate: new Date('2026-08-31T00:00:00.000Z'),
      importedAt: new Date('2026-09-04T00:00:00.000Z'),
      lastVerifiedAt: new Date('2026-09-04T00:00:00.000Z'),
      verificationCount: 1,
      rowCount: 12,
      parserVersion: 'profitability-report-v1',
      contentChecksum: 'a'.repeat(64),
      contentByteCount: 12,
      providerBackedEmptyProof: true,
      coveredMonths: ['2025-09', '2026-08'],
      qualityReport: {
        contract: 'profitability-report-v1',
        parserVersion: 'profitability-report-v1',
        sourceType: 'coupang_ad_profitability',
        reportProduct: 'billboard_product',
        reportUrl: 'https://advertising.coupang.com/marketing-reporting/billboard/reports/pa',
        mappingGeneration: '3',
        adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
        coveredMonths: ['2025-09', '2026-08'],
        plannedAccountCount: 0,
        plannedSliceCount: 0,
        receiptCount: 12,
        targetFactCount: 0,
        matchedTargetCount: 0,
        unmatchedTargetCount: 0,
        allocatableTargetCount: 0,
        unallocatableTargetCount: 0,
        monthlyAllocationFactCount: 0,
        reportIdCount: 12,
        campaignCount: 0,
        expectedRowCount: 0,
        collectedRowCount: 0,
        responseBytes: 1,
        providerSpendKrw: 0,
        allocatedSpendKrw: 0,
        unmatchedSpendKrw: 0,
        unallocatableSpendKrw: 0,
      },
      errorCode: null,
      errorMessage: null,
      createdAt: new Date('2026-09-04T00:00:00.000Z'),
      updatedAt: new Date('2026-09-04T00:00:00.000Z'),
    };
    const tx = {
      sourceImportRun: {
        findFirst: vi.fn().mockResolvedValue(run),
        findMany: vi.fn().mockResolvedValue([run]),
      },
      channelAdTargetDailySnapshot: { findMany: vi.fn() },
      channelAdListingProductMonthlyFact: { findMany: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const adapter = new ProfitabilityAdImportRepositoryAdapter(
      prisma as never,
      {} as never,
    );

    const snapshot = await adapter.readSourceSnapshot({
      organizationId: run.organizationId,
      limit: 12,
    });

    expect(snapshot.completeGenerations).toHaveLength(1);
    expect(snapshot.latestComplete).not.toHaveProperty('attemptToken');
    expect(snapshot.completeGenerations[0]).toMatchObject({
      sourceImportRunId: run.id,
      publicationSequence: '4',
      mappingGeneration: '3',
      adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
      frozenRecipePolicy: {
        version: 'WHOLE_RECIPE_QUANTITY_V1',
        allocation: 'INTEGER_KRW_LARGEST_REMAINDER',
        tieBreak: 'MASTER_PRODUCT_ID_ASC_LOWERCASE',
      },
    });
    expect(snapshot.latestAttempt).not.toHaveProperty('attemptToken');
    expect(snapshot.completeGenerations[0]).not.toHaveProperty('facts');
    expect(snapshot.completeGenerations[0]).not.toHaveProperty('sourceImportRunProvenance');
    expect(tx.channelAdTargetDailySnapshot.findMany).not.toHaveBeenCalled();
    expect(tx.channelAdListingProductMonthlyFact.findMany).not.toHaveBeenCalled();

    await expect(adapter.readSourceSnapshot({
      organizationId: run.organizationId,
      limit: 12,
    })).resolves.toMatchObject({
      completeGenerations: [expect.objectContaining({ sourceImportRunId: run.id })],
    });

    run.qualityReport = { ...run.qualityReport, unmatchedSpendKrw: -1 };
    await expect(adapter.readSourceSnapshot({
      organizationId: run.organizationId,
      limit: 12,
    })).rejects.toThrow('SOURCE_QUALITY_REPORT_MALFORMED');
  });

  it('projects only generation fields while preserving the exact read payload', async () => {
    const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const sourceImportRunId = '11111111-1111-4111-8111-111111111111';
    const channelAccountId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const channelListingId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const listingOptionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const masterProductId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const run = {
      id: sourceImportRunId,
      organizationId,
      sourceType: 'coupang_ad_profitability',
      status: 'completed',
      publicationSequence: 4n,
      mappingGeneration: 3n,
      adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
      coverageStartDate: new Date('2026-01-01T00:00:00.000Z'),
      coverageEndDate: new Date('2026-01-31T00:00:00.000Z'),
      importedAt: new Date('2026-02-01T00:00:00.000Z'),
      parserVersion: 'profitability-report-v1',
      rowCount: 1,
      coveredMonths: ['2026-01'],
      plan: {
        mappingGeneration: '3',
        adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
        accounts: [],
      },
      qualityReport: {
        contract: 'profitability-report-v1',
        parserVersion: 'profitability-report-v1',
        sourceType: 'coupang_ad_profitability',
        reportProduct: 'billboard_product',
        reportUrl: 'https://advertising.coupang.com/marketing-reporting/billboard/reports/pa',
        mappingGeneration: '3',
        adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
        coveredMonths: ['2026-01'],
        plannedAccountCount: 0,
        plannedSliceCount: 0,
        receiptCount: 1,
        targetFactCount: 1,
        matchedTargetCount: 1,
        unmatchedTargetCount: 0,
        allocatableTargetCount: 1,
        unallocatableTargetCount: 0,
        monthlyAllocationFactCount: 1,
        reportIdCount: 1,
        campaignCount: 0,
        expectedRowCount: 1,
        collectedRowCount: 1,
        responseBytes: 1,
        providerSpendKrw: 10,
        allocatedSpendKrw: 10,
        unmatchedSpendKrw: 0,
        unallocatableSpendKrw: 0,
      },
    };
    const target = {
      channelAccountId,
      listingId: channelListingId,
      listingOptionId,
      businessDate: new Date('2026-01-02T00:00:00.000Z'),
      externalId: 'external-listing',
      externalOptionId: 'external-option',
      adSpend: 10,
      adRevenue: 20,
      impressions: 30,
      clicks: 40,
      orders: 5,
      conversions: 6,
    };
    const fact = {
      channelAccountId,
      channelListingId,
      masterProductId,
      month: new Date('2026-01-01T00:00:00.000Z'),
      coveredStartDate: new Date('2026-01-01T00:00:00.000Z'),
      coveredEndDate: new Date('2026-01-31T00:00:00.000Z'),
      wholeRecipeWeight: 1,
      allocatedSpend: 10n,
      observedTargetDayCount: 31,
      mappingGeneration: 3n,
    };
    const targetFindMany = vi.fn().mockResolvedValue([target]);
    const factFindMany = vi.fn().mockResolvedValue([fact]);
    const tx = {
      sourceImportRun: { findFirst: vi.fn().mockResolvedValue(run) },
      channelAdTargetDailySnapshot: { findMany: targetFindMany },
      channelAdListingProductMonthlyFact: { findMany: factFindMany },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const adapter = new ProfitabilityAdImportRepositoryAdapter(prisma as never, {} as never);

    await expect(adapter.readGeneration({ organizationId, sourceImportRunId })).resolves.toMatchObject({
      facts: [{
        channelAccountId,
        channelListingId,
        channelListingOptionId: listingOptionId,
        businessDate: '2026-01-02',
        externalId: 'external-listing',
        externalOptionId: 'external-option',
        adSpend: 10,
        adRevenue: 20,
        impressions: 30,
        clicks: 40,
        orders: 5,
        conversions: 6,
        matched: true,
        allocationStatus: 'ALLOCATABLE',
      }],
      allocations: [{
        channelAccountId,
        channelListingId,
        masterProductId,
        month: '2026-01',
        coveredStartDate: '2026-01-01',
        coveredEndDate: '2026-01-31',
        wholeRecipeWeight: 1,
        allocatedSpend: 10,
        observedTargetDayCount: 31,
        mappingGeneration: '3',
      }],
    });
    expect(targetFindMany).toHaveBeenCalledWith({
      where: { organizationId, sourceImportRunId },
      orderBy: [{ businessDate: 'asc' }, { channelAccountId: 'asc' }, { targetKey: 'asc' }],
      take: 100_001,
      select: {
        channelAccountId: true,
        listingId: true,
        listingOptionId: true,
        businessDate: true,
        externalId: true,
        externalOptionId: true,
        adSpend: true,
        adRevenue: true,
        impressions: true,
        clicks: true,
        orders: true,
        conversions: true,
      },
    });
    expect(factFindMany).toHaveBeenCalledWith({
      where: { organizationId, sourceImportRunId },
      orderBy: [{ month: 'asc' }, { channelAccountId: 'asc' }, { channelListingId: 'asc' }, { masterProductId: 'asc' }],
      take: 100_001,
      select: {
        channelAccountId: true,
        channelListingId: true,
        masterProductId: true,
        month: true,
        coveredStartDate: true,
        coveredEndDate: true,
        wholeRecipeWeight: true,
        allocatedSpend: true,
        observedTargetDayCount: true,
        mappingGeneration: true,
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: 'RepeatableRead',
      }),
    );
  });

  it('treats exact KST-yesterday coverage as fresh, then preserves it as STALE after failure', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T03:00:00.000Z'));
    const complete = {
      id: '11111111-1111-4111-8111-111111111111',
      organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sourceType: 'coupang_ad_profitability',
      status: 'completed',
      publicationSequence: 4n,
      mappingGeneration: 3n,
      adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
      parserVersion: 'profitability-report-v1',
      rowCount: 0,
      coveredMonths: [
        '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03',
        '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
      ],
      coverageStartDate: new Date('2025-10-01T00:00:00.000Z'),
      coverageEndDate: new Date('2026-09-06T00:00:00.000Z'),
      importedAt: new Date('2026-09-04T00:00:00.000Z'),
      updatedAt: new Date('2026-09-04T00:00:00.000Z'),
      createdAt: new Date('2026-09-04T00:00:00.000Z'),
      plan: {
        mappingGeneration: '3',
        adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
        accounts: [],
      },
      qualityReport: {
        contract: 'profitability-report-v1',
        parserVersion: 'profitability-report-v1',
        sourceType: 'coupang_ad_profitability',
        reportProduct: 'billboard_product',
        reportUrl: 'https://advertising.coupang.com/marketing-reporting/billboard/reports/pa',
        mappingGeneration: '3',
        adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
        coveredMonths: [
          '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03',
          '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
        ],
        plannedAccountCount: 0,
        plannedSliceCount: 0,
        receiptCount: 0,
        targetFactCount: 0,
        matchedTargetCount: 0,
        unmatchedTargetCount: 0,
        allocatableTargetCount: 0,
        unallocatableTargetCount: 0,
        monthlyAllocationFactCount: 0,
        reportIdCount: 0,
        campaignCount: 0,
        expectedRowCount: 0,
        collectedRowCount: 0,
        responseBytes: 0,
        providerSpendKrw: 0,
        allocatedSpendKrw: 0,
        unmatchedSpendKrw: 0,
        unallocatableSpendKrw: 0,
      },
    };
    const failed = {
      ...complete,
      id: '22222222-2222-4222-8222-222222222222',
      status: 'failed',
      publicationSequence: null,
      errorCode: 'PROVIDER_FAILED',
      expiresAt: new Date('2026-09-04T01:00:00.000Z'),
      createdAt: new Date('2026-09-04T00:01:00.000Z'),
      plan: {
        mappingGeneration: '3',
        adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
        accounts: [],
      },
      attemptToken: '33333333-3333-4333-8333-333333333333',
    };
    const findFirst = vi.fn()
      .mockResolvedValueOnce(complete)
      .mockResolvedValueOnce(complete);
    const tx = { sourceImportRun: { findFirst } };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const adapter = new ProfitabilityAdImportRepositoryAdapter(prisma as never, {} as never);

    await expect(adapter.readSourceStatus({ organizationId: complete.organizationId })).resolves.toMatchObject({
      latestAttempt: { state: 'COMPLETE' },
      latestComplete: { sourceImportRunId: complete.id, coveredThrough: '2026-09-06' },
      ready: true,
    });

    findFirst
      .mockReset()
      .mockResolvedValueOnce(failed)
      .mockResolvedValueOnce(complete);
    await expect(adapter.readSourceStatus({ organizationId: failed.organizationId })).resolves.toMatchObject({
      latestAttempt: { state: 'FAILED', errorCode: 'PROVIDER_FAILED' },
      latestComplete: { sourceImportRunId: complete.id, coveredThrough: '2026-09-06' },
      ready: false,
    });
    vi.useRealTimers();
  });
});

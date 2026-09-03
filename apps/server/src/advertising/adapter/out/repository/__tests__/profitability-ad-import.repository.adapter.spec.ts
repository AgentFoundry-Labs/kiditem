import { describe, expect, it, vi } from 'vitest';
import { PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH } from '@kiditem/shared/product-abc';
import {
  allocateIntegerKrw,
  batchUpdateFactAllocations,
  ProfitabilityAdImportRepositoryAdapter,
} from '../profitability-ad-import.repository.adapter';

describe('ProfitabilityAdImportRepositoryAdapter', () => {
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

  it('reports STALE when a newer RUNNING or FAILED attempt follows the latest COMPLETE', async () => {
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
      coveredMonths: ['2025-09', '2026-08'],
      coverageStartDate: new Date('2025-09-01T00:00:00.000Z'),
      coverageEndDate: new Date('2026-08-31T00:00:00.000Z'),
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
        coveredMonths: ['2025-09', '2026-08'],
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
    const tx = {
      sourceImportRun: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(failed)
          .mockResolvedValueOnce(complete),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const adapter = new ProfitabilityAdImportRepositoryAdapter(prisma as never, {} as never);

    await expect(adapter.readSourceStatus({ organizationId: failed.organizationId })).resolves.toMatchObject({
      latestAttempt: { state: 'FAILED', errorCode: 'PROVIDER_FAILED' },
      latestComplete: { sourceImportRunId: complete.id },
      status: 'STALE',
    });
  });
});

import { ProductTransactionalReadRepositoryAdapter } from '../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { describe, expect, it, vi } from 'vitest';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH } from '@kiditem/shared/product-abc';
import { AdvertisingProfitabilityReadModule } from '../advertising/advertising-profitability-read.module';
import { SellpiaProductSalesModule } from '../analytics/sellpia-product-sales/sellpia-product-sales.module';
import { SellpiaProfitabilitySourceModule } from '../analytics/sellpia-product-sales/sellpia-profitability-source.module';
import { MASTER_PRODUCT_PROFITABILITY_READ_PORT } from './application/port/in/master-product-profitability-read.port';
import { MasterProductProfitabilityReadService } from './application/service/master-product-profitability-read.service';
import { ProductCollectionRuntimeModule } from '../products/product-collection-runtime.module';
import { ProfitabilityEvidenceModule } from './profitability-evidence.module';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000002';
const SELLPIA_RUN_ID = '00000000-0000-4000-8000-000000000010';
const ADVERTISING_RUN_ID = '00000000-0000-4000-8000-000000000011';
const LISTING_ID = '00000000-0000-4000-8000-000000000031';
const MULTI_MASTER_PRODUCT_ID = '00000000-0000-4000-8000-000000000003';
const INVALID_MAPPING_PRODUCT_ID = '00000000-0000-4000-8000-000000000004';

const MONTHS = [
  '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02',
  '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08',
];

function monthEnd(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(year!, month!, 0)).toISOString().slice(0, 10);
}

function sellpiaGeneration(overrides: Record<string, unknown> = {}) {
  return {
    sourceImportRunId: SELLPIA_RUN_ID,
    publicationSequence: '7',
    mappingGeneration: '3',
    coverage: { from: '2025-09-01', to: '2026-08-31', coveredMonths: MONTHS },
    capturedAt: '2026-09-02T00:00:00.000Z',
    quality: {
      contract: 'sellpia-profitability-v2',
      parserVersion: 'sellpia-profitability-v2',
      correctedCostEvidence: true,
      contentChecksum: 'a'.repeat(64),
      contentByteCount: 1,
      includedRowCount: MONTHS.length,
      excludedRowCount: 0,
      mappedRowCount: MONTHS.length,
      unmappedRowCount: 0,
      warningCount: 0,
      mappingGeneration: '3',
      provenance: {
        source: 'sellpia_stat_prd_profit',
        costBasis: 'ORDER_TIME_SUPPLY_COST',
        vatIncluded: true,
      },
    },
    ...overrides,
  };
}

function sellpiaCatalog(overrides: Record<string, unknown> = {}) {
  const generation = sellpiaGeneration();
  return {
    latestAttempt: {
      attemptId: SELLPIA_RUN_ID,
      state: 'COMPLETE',
      expiresAt: '2026-09-02T01:00:00.000Z',
      capturedAt: '2026-09-02T00:00:00.000Z',
      generation: '7',
      errorCode: null,
      errorMessage: null,
      plan: { from: '2025-09-01', to: '2026-08-31', coveredMonths: MONTHS },
    },
    completeGenerations: [generation],
    ...overrides,
  };
}

function sellpiaFacts(overrides: Record<string, unknown> = {}) {
  const generation = sellpiaGeneration();
  return {
    generation,
    facts: MONTHS.map((yearMonth) => ({
      sourceImportRunId: SELLPIA_RUN_ID,
      sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000020',
      masterProductId: PRODUCT_ID,
      productCode: 'SKU-1',
      optionCode: '',
      yearMonth,
      coverageStartDate: `${yearMonth}-01`,
      coverageEndDate: monthEnd(yearMonth),
      revenue: 100_000,
      orderTimeSupplyCost: 40_000,
      costBasis: 'ORDER_TIME_SUPPLY_COST',
      vatIncluded: true,
      capturedAt: '2026-09-02T00:00:00.000Z',
    })),
    unmappedFacts: [],
    ...overrides,
  };
}

function advertisingSummary(overrides: Record<string, unknown> = {}) {
  return {
    sourceImportRunId: ADVERTISING_RUN_ID,
    sourceType: 'coupang_ad_profitability',
    organizationId: ORGANIZATION_ID,
    publicationSequence: '9',
    coverageStartDate: '2025-09-01',
    coveredThrough: '2026-08-31',
    // A generation confirms the day it requested unless a test holds one back.
    requestedThrough: overrides.coveredThrough ?? '2026-08-31',
    capturedAt: '2026-09-02T00:00:00.000Z',
    mappingGeneration: '3',
    adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
    frozenRecipePolicy: {
      version: 'WHOLE_RECIPE_QUANTITY_V1',
      allocation: 'INTEGER_KRW_LARGEST_REMAINDER',
      tieBreak: 'MASTER_PRODUCT_ID_ASC_LOWERCASE',
      mappingGeneration: '3',
      adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
    },
    qualitySummary: {
      contract: 'profitability-report-v1',
      parserVersion: 'profitability-report-v1',
      plannedAccountCount: 1,
      plannedSliceCount: 12,
      receiptCount: 12,
      targetFactCount: 12,
      matchedTargetCount: 12,
      unmatchedTargetCount: 0,
      allocatableTargetCount: 12,
      unallocatableTargetCount: 0,
      monthlyAllocationFactCount: 12,
      reportIdCount: 12,
      campaignCount: 0,
      expectedRowCount: 12,
      collectedRowCount: 12,
      responseBytes: 1,
      providerSpendKrw: 12_000,
      allocatedSpendKrw: 12_000,
      unmatchedSpendKrw: 0,
      unallocatableSpendKrw: 0,
    },
    ...overrides,
  };
}

function advertisingSnapshot(overrides: Record<string, unknown> = {}) {
  const summary = advertisingSummary();
  return {
    latestAttempt: {
      attemptId: ADVERTISING_RUN_ID,
      sourceImportRunId: ADVERTISING_RUN_ID,
      state: 'COMPLETE',
      startedAt: '2026-09-02T00:00:00.000Z',
      capturedAt: '2026-09-02T00:00:00.000Z',
      expiresAt: '2026-09-02T01:00:00.000Z',
      errorCode: null,
      errorMessage: null,
      mappingGeneration: '3',
      adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
      coverageStartDate: '2025-09-01',
      coverageEndDate: '2026-08-31',
    },
    latestComplete: summary,
    completeGenerations: [summary],
    ready: true,
    ...overrides,
  };
}

function advertisingGeneration(overrides: Record<string, unknown> = {}) {
  const summary = advertisingSummary();
  return {
    summary,
    allocations: MONTHS.map((month) => ({
      channelAccountId: '00000000-0000-4000-8000-000000000030',
      channelListingId: '00000000-0000-4000-8000-000000000031',
      masterProductId: PRODUCT_ID,
      month,
      coveredStartDate: `${month}-01`,
      coveredEndDate: monthEnd(month),
      wholeRecipeWeight: 1,
      allocatedSpend: 1_000,
      observedTargetDayCount: new Date(
        Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
      ).getUTCDate(),
      mappingGeneration: '3',
    })),
    ...overrides,
  };
}

function makeService(input: {
  sellpiaCatalog?: unknown;
  sellpiaFacts?: unknown;
  advertisingSnapshot?: unknown;
  advertisingGeneration?: unknown;
  products?: unknown[];
  mappingGeneration?: bigint | string | null;
} = {}) {
  const sellpia = {
    readGenerationCatalog: vi.fn().mockResolvedValue(input.sellpiaCatalog ?? sellpiaCatalog()),
    readGenerationFacts: vi.fn().mockResolvedValue(input.sellpiaFacts ?? sellpiaFacts()),
  };
  const advertising = {
    readSourceSnapshot: vi.fn().mockResolvedValue(input.advertisingSnapshot ?? advertisingSnapshot()),
    readGeneration: vi.fn().mockResolvedValue(
      input.advertisingGeneration === undefined
        ? advertisingGeneration()
        : input.advertisingGeneration,
    ),
  };
  const transaction = vi.fn();
  const prisma = {
    masterProduct: {
      findMany: vi.fn().mockResolvedValue(
        input.products ?? [{
          id: PRODUCT_ID,
          code: 'KID00000001',
          name: 'Product 1',
          optionName: null,
          barcode: null,
          purchasePrice: 100,
          imageUrls: [],
        }],
      ),
    },
    channelListing: {
      findMany: vi.fn().mockResolvedValue([{
        id: LISTING_ID,
        rawJson: { saleStartedAt: '2025-09-01' },
        options: [{
          inventoryComponents: [{
            quantity: 1,
            masterProductId: PRODUCT_ID,
          }],
        }],
      }]),
    },
    $queryRaw: vi.fn().mockResolvedValue([{
      listingId: LISTING_ID,
      source: null,
      saleStartedAt: '2025-09-01',
    }]),
    masterProductAbcFormulaState: {
      findUnique: vi.fn().mockResolvedValue(
        input.mappingGeneration === null
          ? null
          : { mappingGeneration: input.mappingGeneration ?? 3n },
      ),
    },
    $transaction: transaction,
  };
  transaction.mockImplementation((callback: (tx: typeof prisma) => unknown) => callback(prisma));
  return {
    service: new MasterProductProfitabilityReadService(
      sellpia as never,
      advertising as never,
      prisma as never,
     new ProductTransactionalReadRepositoryAdapter()) as unknown as { load(input: { organizationId: string; targetCutoff: string }): Promise<any> },
    sellpia,
    advertising,
    prisma,
  };
}

describe('ProfitabilityEvidence', () => {
  it('uses at most twelve completed months ending at the target cutoff', async () => {
    const { service, sellpia, advertising, prisma } = makeService();

    const result = await service.load({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-08-31',
    });

    expect(result.products[0].formulaReadyFacts.monthlyFacts.map((row: any) => row.yearMonth))
      .toEqual(MONTHS);
    expect(sellpia.readGenerationFacts).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      sourceImportRunId: SELLPIA_RUN_ID,
      yearMonths: MONTHS,
    }));
    expect(advertising.readGeneration).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      sourceImportRunId: ADVERTISING_RUN_ID,
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'RepeatableRead' },
    );
  });

  it('keeps a full collection-slice fact readable without crediting product observation days', async () => {
    const { service } = makeService();

    const result = await service.load({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-08-31',
    });

    expect(result.products[0]).toMatchObject({
      validObservationDays: 365,
      formulaReadyFacts: {
        monthlyFacts: expect.arrayContaining([
          expect.objectContaining({
            yearMonth: '2026-08',
            coverageStartDate: '2026-08-01',
            coverageEndDate: '2026-08-31',
            coveredDays: 31,
            recognizedRevenue: 100_000,
            orderTimeSupplyCost: 40_000,
          }),
        ]),
      },
    });
  });

  it('retains legacy cost amounts but blocks official evaluation evidence', async () => {
    const legacy = sellpiaGeneration({
      quality: {
        ...sellpiaGeneration().quality,
        contract: 'sellpia-profitability-v1',
        parserVersion: 'sellpia-profitability-v1',
        correctedCostEvidence: false,
      },
    });
    const { service } = makeService({
      sellpiaCatalog: sellpiaCatalog({ completeGenerations: [legacy] }),
      sellpiaFacts: sellpiaFacts({ generation: legacy }),
    });

    const result = await service.load({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-08-31',
    });

    expect(result.products[0]).toMatchObject({
      evaluationPeriodComplete: false,
      formulaReadyFacts: {
        monthlyFacts: expect.arrayContaining([
          expect.objectContaining({ recognizedRevenue: 100_000, orderTimeSupplyCost: 40_000 }),
        ]),
      },
    });
  });

  it('selects the declared partial cutoff interval and counts its exact days', async () => {
    const sellpiaGenerationWithPartialCutoff = sellpiaGeneration({
      coverage: {
        from: '2025-09-01',
        to: '2026-08-15',
        coveredMonths: MONTHS,
      },
    });
    const sellpia = sellpiaFacts({
      generation: sellpiaGenerationWithPartialCutoff,
      facts: sellpiaFacts().facts.map((fact: { yearMonth: string }) => fact.yearMonth === '2026-08'
        ? { ...fact, coverageEndDate: '2026-08-15' }
        : fact),
    });
    const advertisingSummaryWithPartialCutoff = advertisingSummary({
      coveredThrough: '2026-08-15',
    });
    const advertising = advertisingGeneration({
      summary: advertisingSummaryWithPartialCutoff,
      allocations: advertisingGeneration().allocations.map((fact: { month: string }) => fact.month === '2026-08'
        ? { ...fact, coveredEndDate: '2026-08-15', observedTargetDayCount: 15 }
        : fact),
    });
    const { service } = makeService({
      sellpiaCatalog: {
        ...sellpiaCatalog({ completeGenerations: [sellpiaGenerationWithPartialCutoff] }),
        latestAttempt: {
          ...sellpiaCatalog().latestAttempt,
          plan: { from: '2025-09-01', to: '2026-08-15', coveredMonths: MONTHS },
        },
      },
      sellpiaFacts: sellpia,
      advertisingSnapshot: {
        ...advertisingSnapshot({ completeGenerations: [advertisingSummaryWithPartialCutoff] }),
        latestComplete: advertisingSummaryWithPartialCutoff,
        latestAttempt: {
          ...advertisingSnapshot().latestAttempt,
          coverageEndDate: '2026-08-15',
        },
      },
      advertisingGeneration: advertising,
    });

    const result = await service.load({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-08-15',
    });

    expect(result.products[0]).toMatchObject({
      evaluationPeriodComplete: true,
      validObservationDays: 349,
    });
    expect(result.products[0].formulaReadyFacts?.monthlyFacts.at(-1)).toMatchObject({
      yearMonth: '2026-08',
      coverageStartDate: '2026-08-01',
      coverageEndDate: '2026-08-15',
      coveredDays: 15,
    });
  });

  it('retains amounts but rejects a bucket whose fact boundary misses the declared cutoff', async () => {
    const sellpiaGenerationWithPartialCutoff = sellpiaGeneration({
      coverage: { from: '2025-09-01', to: '2026-08-15', coveredMonths: MONTHS },
    });
    const { service } = makeService({
      sellpiaCatalog: {
        ...sellpiaCatalog({ completeGenerations: [sellpiaGenerationWithPartialCutoff] }),
        latestAttempt: {
          ...sellpiaCatalog().latestAttempt,
          plan: { from: '2025-09-01', to: '2026-08-15', coveredMonths: MONTHS },
        },
      },
      sellpiaFacts: sellpiaFacts({
        generation: sellpiaGenerationWithPartialCutoff,
        facts: sellpiaFacts().facts.map((fact: { yearMonth: string }) => fact.yearMonth === '2026-08'
          ? { ...fact, coverageEndDate: '2026-08-14' }
          : fact),
      }),
      // The advertising generation the snapshot lists is the one read back.
      advertisingSnapshot: {
        ...advertisingSnapshot(),
        latestAttempt: { ...advertisingSnapshot().latestAttempt, coverageEndDate: '2026-08-15' },
        latestComplete: advertisingSummary({ coveredThrough: '2026-08-15' }),
        completeGenerations: [advertisingSummary({ coveredThrough: '2026-08-15' })],
      },
      advertisingGeneration: advertisingGeneration({
        summary: advertisingSummary({ coveredThrough: '2026-08-15' }),
        allocations: advertisingGeneration().allocations.map((fact: { month: string }) => fact.month === '2026-08'
          ? { ...fact, coveredEndDate: '2026-08-15', observedTargetDayCount: 15 }
          : fact),
      }),
    });

    const result = await service.load({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-08-15',
    });

    expect(result.products[0].evaluationPeriodComplete).toBe(false);
    expect(result.products[0].formulaReadyFacts?.monthlyFacts.at(-1)).toMatchObject({
      yearMonth: '2026-08',
      coverageEndDate: '2026-08-14',
      recognizedRevenue: 100_000,
    });
  });

  it('keeps a daily Sellpia source ending after the monthly ABC cutoff while bounding facts at month-end', async () => {
    const generation = sellpiaGeneration({
      coverage: {
        from: '2025-09-01',
        to: '2026-09-03',
        coveredMonths: [...MONTHS, '2026-09'],
      },
    });
    const { service } = makeService({
      sellpiaCatalog: {
        ...sellpiaCatalog({ completeGenerations: [generation] }),
        latestAttempt: {
          ...sellpiaCatalog().latestAttempt,
          plan: {
            from: '2025-09-01',
            to: '2026-09-03',
            coveredMonths: [...MONTHS, '2026-09'],
          },
        },
      },
      sellpiaFacts: sellpiaFacts({ generation }),
    });

    const result = await service.load({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-08-31',
    });

    expect(result.actualCutoff).toBe('2026-08-31');
    expect(result.sourceVector.sellpia.coverageEndDate).toBe('2026-09-03');
    expect(result.sources.sellpia).toMatchObject({
      ready: true,
      requiredCutoff: '2026-08-31',
      actualCutoff: '2026-09-03',
    });
    expect(result.products[0].formulaReadyFacts?.monthlyFacts.at(-1)).toMatchObject({
      yearMonth: '2026-08',
      coverageEndDate: '2026-08-31',
    });
  });

  it('counts only the shared partial-month coverage days', async () => {
    const facts = sellpiaFacts();
    const allocations = advertisingGeneration().allocations;
    const { service } = makeService({
      sellpiaFacts: {
        ...facts,
        facts: facts.facts.map((fact: { yearMonth: string }) =>
          fact.yearMonth === '2025-09'
            ? { ...fact, coverageStartDate: '2025-09-02' }
            : fact),
      },
      advertisingGeneration: advertisingGeneration({
        allocations: allocations.map((allocation: { month: string }) =>
          allocation.month === '2025-09'
            ? { ...allocation, coveredStartDate: '2025-09-02' }
            : allocation),
      }),
    });

    const result = await service.load({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-08-31',
    });

    expect(result.products[0].formulaReadyFacts.monthlyFacts[0]).toMatchObject({
      yearMonth: '2025-09',
      coverageStartDate: '2025-09-02',
      coverageEndDate: '2025-09-30',
      coveredDays: 29,
    });
  });

  it('keeps the previous complete pair as stale display evidence after a failed attempt', async () => {
    const snapshot = advertisingSnapshot({
      latestAttempt: {
        ...advertisingSnapshot().latestAttempt,
        attemptId: '00000000-0000-4000-8000-000000000099',
        sourceImportRunId: '00000000-0000-4000-8000-000000000099',
        state: 'FAILED',
        errorCode: 'PROVIDER_FAILED',
        errorMessage: 'provider unavailable',
      },
      ready: false,
    });
    const { service } = makeService({ advertisingSnapshot: snapshot });

    const result = await service.load({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-08-31',
    });

    expect(result.sources.advertising).toMatchObject({
      ready: true,
      latestAttempt: { state: 'FAILED', errorCode: 'PROVIDER_FAILED' },
      actualCutoff: '2026-08-31',
    });
    expect(result.sourceVector.advertising.sourceImportRunId).toBe(ADVERTISING_RUN_ID);
    expect(result.products[0].formulaReadyFacts).not.toBeNull();
  });

  it('excludes every month after the selected common cutoff', async () => {
    const julyAdvertising = advertisingSummary({ coveredThrough: '2026-07-31' });
    const { service } = makeService({
      advertisingSnapshot: advertisingSnapshot({
        latestComplete: julyAdvertising,
        completeGenerations: [julyAdvertising],
      }),
      advertisingGeneration: advertisingGeneration({ summary: julyAdvertising }),
    });

    const result = await service.load({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-08-31',
    });

    expect(result.actualCutoff).toBe('2026-07-31');
    expect(result.products[0].formulaReadyFacts.monthlyFacts.at(-1)?.yearMonth).toBe('2026-07');
  });

  it('does not infer NOT_APPLIED before advertising manifest coverage starts', async () => {
    const octoberAdvertising = advertisingSummary({ coverageStartDate: '2025-10-01' });
    const generation = advertisingGeneration({
      summary: octoberAdvertising,
      allocations: advertisingGeneration().allocations.filter(
        (allocation: { month: string }) => allocation.month !== '2025-09',
      ),
    });
    const { service } = makeService({
      advertisingSnapshot: advertisingSnapshot({
        latestComplete: octoberAdvertising,
        completeGenerations: [octoberAdvertising],
      }),
      advertisingGeneration: generation,
    });

    const result = await service.load({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-08-31',
    });

    expect(result.products[0].formulaReadyFacts.monthlyFacts[0]?.yearMonth).toBe('2025-10');
  });

  it('does not synthesize advertising zero when no complete advertising generation exists', async () => {
    const { service } = makeService({
      advertisingSnapshot: {
        latestAttempt: null,
        latestComplete: null,
        completeGenerations: [],
        ready: false,
      },
    });

    const result = await service.load({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-08-31',
    });

    expect(result.sources.advertising).toMatchObject({ ready: false, actualCutoff: null });
    expect(result.sources.sellpia).toMatchObject({
      ready: true,
      actualCutoff: '2026-08-31',
    });
    expect(result.sourceVector.advertising.sourceImportRunId).toBeNull();
    expect(result.products[0].formulaReadyFacts).toBeNull();
  });

  it('selects an older compatible pair when the newest source generations disagree on mapping', async () => {
    const olderSellpia = sellpiaGeneration({
      sourceImportRunId: '00000000-0000-4000-8000-000000000012',
      publicationSequence: '6',
      mappingGeneration: '3',
    });
    const newerSellpia = sellpiaGeneration({
      sourceImportRunId: '00000000-0000-4000-8000-000000000013',
      publicationSequence: '8',
      mappingGeneration: '4',
      quality: {
        ...sellpiaGeneration().quality,
        mappingGeneration: '4',
      },
    });
    const adSummary = advertisingSummary();
    const { service } = makeService({
      sellpiaCatalog: {
        ...sellpiaCatalog(),
        completeGenerations: [newerSellpia, olderSellpia],
      },
      sellpiaFacts: sellpiaFacts({
        generation: olderSellpia,
      }),
    });

    const result = await service.load({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-08-31',
    });

    expect(result.sourceVector.sellpia).toMatchObject({
      sourceImportRunId: olderSellpia.sourceImportRunId,
      publicationSequence: '6',
      mappingGeneration: '3',
    });
    expect(result.sourceVector.advertising).toMatchObject({
      sourceImportRunId: adSummary.sourceImportRunId,
      mappingGeneration: '3',
    });
    expect(result.sources.sellpia).toMatchObject({ ready: true, actualCutoff: '2026-08-31' });
  });

  it('does not mark a source pair ready when it is behind FormulaState mapping generation', async () => {
    const { service } = makeService({ mappingGeneration: 4n });

    const result = await service.load({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-08-31',
    });

    expect(result.mappingGeneration).toBeNull();
    expect(result.actualCutoff).toBeNull();
    expect(result.sources).toMatchObject({
      sellpia: { ready: false },
      advertising: { ready: false },
    });
    expect(result.products[0].formulaReadyFacts).toBeNull();
  });

  it('does not infer a product zero from a manifest-covered month without a product fact', async () => {
    const completeFacts = sellpiaFacts();
    const missingMonth = '2026-08';
    const { service } = makeService({
      sellpiaFacts: {
        ...completeFacts,
        facts: completeFacts.facts.filter((fact: { yearMonth: string }) => fact.yearMonth !== missingMonth),
      },
    });

    const result = await service.load({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-08-31',
    });
    const missing = result.products[0].formulaReadyFacts?.monthlyFacts
      .find((fact: { yearMonth: string }) => fact.yearMonth === missingMonth);

    expect(missing).toBeUndefined();
    expect(result.products[0].validObservationDays).toBe(334);
    expect(result.products[0].formulaReadyFacts?.monthlyFacts).toHaveLength(11);
  });

  it('does not establish observation for a mapped product without product facts', async () => {
    const completeFacts = sellpiaFacts({ facts: [] });
    const { service } = makeService({
      sellpiaFacts: completeFacts,
      products: [{
        id: PRODUCT_ID,
        code: 'KID00000001',
        name: 'Product 1',
        optionName: null,
        barcode: null,
        purchasePrice: 100,
        imageUrls: [],
      }],
    });

    const result = await service.load({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-08-31',
    });

    expect(result.products[0]).toMatchObject({
      mappingValid: true,
      validObservationDays: 0,
      formulaReadyFacts: null,
    });
  });

  it('preserves valid, multi-master, invalid-mapping, and unmapped fact semantics', async () => {
    const products = [
      {
        id: PRODUCT_ID,
        code: 'KID00000001',
        name: 'Product 1',
        optionName: null,
        barcode: null,
        purchasePrice: 100,
        imageUrls: [],
      },
      {
        id: MULTI_MASTER_PRODUCT_ID,
        code: 'KID00000002',
        name: 'Product 2',
        optionName: null,
        barcode: null,
        purchasePrice: 100,
        imageUrls: [],
      },
      {
        id: INVALID_MAPPING_PRODUCT_ID,
        code: 'KID00000003',
        name: 'Product 3',
        optionName: null,
        barcode: null,
        purchasePrice: 100,
        imageUrls: [],
      },
    ];
    const { service, sellpia, prisma } = makeService({ products });
    prisma.channelListing.findMany.mockResolvedValue([{
      id: LISTING_ID,
      rawJson: { saleStartedAt: '2025-09-01' },
      options: [{
        inventoryComponents: [
          {
            quantity: 1,
            masterProductId: PRODUCT_ID,
          },
          {
            quantity: 1,
            masterProductId: MULTI_MASTER_PRODUCT_ID,
          },
        ],
      }],
    }]);
    const completeFacts = sellpiaFacts();
    const multiMasterFacts = completeFacts.facts.map((fact: Record<string, unknown>) => ({
      ...fact,
      masterProductId: MULTI_MASTER_PRODUCT_ID,
      sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000021',
      productCode: 'SKU-MULTI',
    }));
    const invalidMappingFact = {
      ...completeFacts.facts[0],
      masterProductId: INVALID_MAPPING_PRODUCT_ID,
      sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000022',
      productCode: 'SKU-INVALID-MAPPING',
    };
    sellpia.readGenerationFacts.mockResolvedValue({
      generation: completeFacts.generation,
      facts: [...completeFacts.facts, ...multiMasterFacts, invalidMappingFact],
      unmappedFacts: [{
        sourceImportRunId: SELLPIA_RUN_ID,
        sellpiaInventorySkuId: null,
        masterProductId: null,
        productCode: 'SKU-UNMAPPED',
        optionCode: '',
        yearMonth: '2026-08',
        coverageStartDate: '2026-08-01',
        coverageEndDate: '2026-08-31',
        revenue: 100,
        orderTimeSupplyCost: 40,
        costBasis: 'ORDER_TIME_SUPPLY_COST',
        vatIncluded: true,
        capturedAt: '2026-09-02T00:00:00.000Z',
        reason: 'SOURCE_UNMAPPED',
      }],
    });

    const result = await service.load({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-08-31',
    });

    expect(sellpia.readGenerationFacts).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      sourceImportRunId: SELLPIA_RUN_ID,
      masterProductIds: [PRODUCT_ID, MULTI_MASTER_PRODUCT_ID],
      yearMonths: MONTHS,
    });
    expect(result.products.map((product: { masterProductId: string }) => product.masterProductId))
      .toEqual([PRODUCT_ID, MULTI_MASTER_PRODUCT_ID, INVALID_MAPPING_PRODUCT_ID]);
    expect(result.products[0].formulaReadyFacts.monthlyFacts).toHaveLength(MONTHS.length);
    expect(result.products[1].formulaReadyFacts.monthlyFacts).toHaveLength(MONTHS.length);
    expect(result.products[2]).toMatchObject({
      mappingValid: false,
      validObservationDays: 0,
      formulaReadyFacts: null,
    });
  });

  it('keeps zero allocated advertising spend as confirmed zero despite observed coverage days', async () => {
    const completeAdvertising = advertisingGeneration();
    const { service } = makeService({
      advertisingGeneration: {
        ...completeAdvertising,
        allocations: completeAdvertising.allocations.map((allocation: { allocatedSpend: number }) => ({
          ...allocation,
          allocatedSpend: 0,
          observedTargetDayCount: 31,
        })),
      },
    });

    const result = await service.load({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-08-31',
    });

    expect(result.products[0].formulaReadyFacts?.monthlyFacts[0]?.advertisingSpend).toBe(0);
  });

  it('requires the latest attempt to be COMPLETE and exposes Sellpia failure code', async () => {
    const failedAttempt = {
      ...sellpiaCatalog().latestAttempt,
      attemptId: '00000000-0000-4000-8000-000000000099',
      state: 'FAILED',
      errorCode: 'SELLPIA_PROVIDER_FAILED',
      errorMessage: 'provider unavailable',
    };
    const { service } = makeService({
      sellpiaCatalog: {
        ...sellpiaCatalog(),
        latestAttempt: failedAttempt,
      },
    });

    const result = await service.load({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-08-31',
    });

    expect(result.sources.sellpia).toMatchObject({
      ready: true,
      latestAttempt: { state: 'FAILED', errorCode: 'SELLPIA_PROVIDER_FAILED' },
    });
  });

  it('propagates malformed source failures instead of turning them into missing data', async () => {
    const { service } = makeService({
      sellpiaCatalog: Promise.reject(new Error('malformed manifest')),
    });

    await expect(service.load({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-08-31',
    })).rejects.toThrow('malformed manifest');
  });

  it('rejects when an exact advertising generation disappears after catalog selection', async () => {
    const { service } = makeService({ advertisingGeneration: null });

    await expect(service.load({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-08-31',
    })).rejects.toThrow('SOURCE_GENERATION_NOT_FOUND');
  });

  it('rejects an unsafe aggregate instead of rounding source money', async () => {
    const generationFacts = sellpiaFacts();
    const first = generationFacts.facts[0]!;
    const { service } = makeService({
      sellpiaFacts: {
        ...generationFacts,
        facts: [
          { ...first, revenue: Number.MAX_SAFE_INTEGER, orderTimeSupplyCost: 0 },
          {
            ...first,
            sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000021',
            productCode: 'SKU-2',
            revenue: Number.MAX_SAFE_INTEGER,
            orderTimeSupplyCost: 0,
          },
          ...generationFacts.facts.slice(1),
        ],
      },
    });

    await expect(service.load({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-08-31',
    })).rejects.toThrow('SOURCE_VALUE_OVERFLOW');
  });
});

describe('ProfitabilityEvidenceModule', () => {
  it('does not import the Sellpia screen/depletion module back into its evidence dependency', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, ProfitabilityEvidenceModule))
      .not.toContain(SellpiaProductSalesModule);
  });

  it('exports one Finance-owned evidence seam over the two exact source readers', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, ProfitabilityEvidenceModule)).toEqual([
      SellpiaProfitabilitySourceModule,
      AdvertisingProfitabilityReadModule,
      ProductCollectionRuntimeModule,
    ]);
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ProfitabilityEvidenceModule)).toEqual([
      MasterProductProfitabilityReadService,
      {
        provide: MASTER_PRODUCT_PROFITABILITY_READ_PORT,
        useExisting: MasterProductProfitabilityReadService,
      },
    ]);
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, ProfitabilityEvidenceModule)).toEqual([
      MASTER_PRODUCT_PROFITABILITY_READ_PORT,
    ]);
  });
});

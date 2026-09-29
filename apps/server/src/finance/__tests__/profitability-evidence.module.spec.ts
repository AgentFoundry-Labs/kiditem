import { ProductTransactionalReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { describe, expect, it, vi } from 'vitest';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { SellpiaProductSalesModule } from '../../analytics/sellpia-product-sales/sellpia-product-sales.module';
import { SellpiaProfitabilitySourceModule } from '../../analytics/sellpia-product-sales/sellpia-profitability-source.module';
import { MASTER_PRODUCT_PROFITABILITY_READ_PORT } from '../application/port/in/master-product-profitability-read.port';
import { MasterProductProfitabilityReadService } from '../application/service/master-product-profitability-read.service';
import { ProductCollectionRuntimeModule } from '../../products/product-collection-runtime.module';
import { ProfitabilityEvidenceModule } from '../profitability-evidence.module';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000002';
const SELLPIA_RUN_ID = '00000000-0000-4000-8000-000000000010';
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
    operationId: SELLPIA_RUN_ID,
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
      operationId: SELLPIA_RUN_ID,
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

function makeService(input: {
  sellpiaCatalog?: unknown;
  sellpiaFacts?: unknown;
  products?: unknown[];
  mappingGeneration?: bigint | string | null;
} = {}) {
  const sellpia = {
    readGenerationCatalog: vi.fn().mockResolvedValue(input.sellpiaCatalog ?? sellpiaCatalog()),
    readGenerationFacts: vi.fn().mockResolvedValue(input.sellpiaFacts ?? sellpiaFacts()),
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
      prisma as never,
     new ProductTransactionalReadRepositoryAdapter()) as unknown as { load(input: { organizationId: string; targetCutoff: string }): Promise<any> },
    sellpia,
    prisma,
  };
}

describe('ProfitabilityEvidence', () => {
  it('uses at most twelve completed months ending at the target cutoff', async () => {
    const { service, sellpia, prisma } = makeService();

    const result = await service.load({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-08-31',
    });

    expect(result.products[0].formulaReadyFacts.monthlyFacts.map((row: any) => row.yearMonth))
      .toEqual(MONTHS);
    expect(sellpia.readGenerationFacts).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      operationId: SELLPIA_RUN_ID,
      yearMonths: MONTHS,
    }));
    // ABC grades on Sellpia alone (KID-373): no advertising source or spend.
    expect(Object.keys(result.sources)).toEqual(['sellpia']);
    expect(Object.keys(result.sourceVector)).toEqual(['sellpia']);
    expect(result.products[0].formulaReadyFacts.monthlyFacts[0]).not.toHaveProperty('advertisingSpend');
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
    const { service } = makeService({
      sellpiaCatalog: {
        ...sellpiaCatalog({ completeGenerations: [sellpiaGenerationWithPartialCutoff] }),
        latestAttempt: {
          ...sellpiaCatalog().latestAttempt,
          plan: { from: '2025-09-01', to: '2026-08-15', coveredMonths: MONTHS },
        },
      },
      sellpiaFacts: sellpia,
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

  it('counts only the partial-month coverage days of the Sellpia fact', async () => {
    const facts = sellpiaFacts();
    const { service } = makeService({
      sellpiaFacts: {
        ...facts,
        facts: facts.facts.map((fact: { yearMonth: string }) =>
          fact.yearMonth === '2025-09'
            ? { ...fact, coverageStartDate: '2025-09-02' }
            : fact),
      },
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

  it('excludes every month after the selected Sellpia cutoff', async () => {
    const july = sellpiaGeneration({
      coverage: { from: '2025-09-01', to: '2026-07-31', coveredMonths: MONTHS.slice(0, -1) },
    });
    const { service } = makeService({
      sellpiaCatalog: sellpiaCatalog({ completeGenerations: [july] }),
      sellpiaFacts: sellpiaFacts({ generation: july }),
    });

    const result = await service.load({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-08-31',
    });

    expect(result.actualCutoff).toBe('2026-07-31');
    expect(result.products[0].formulaReadyFacts.monthlyFacts.at(-1)?.yearMonth).toBe('2026-07');
  });

  it('selects an older Sellpia generation when the newest one is on another mapping', async () => {
    const olderSellpia = sellpiaGeneration({
      operationId: '00000000-0000-4000-8000-000000000012',
      publicationSequence: '6',
      mappingGeneration: '3',
    });
    const newerSellpia = sellpiaGeneration({
      operationId: '00000000-0000-4000-8000-000000000013',
      publicationSequence: '8',
      mappingGeneration: '4',
      quality: {
        ...sellpiaGeneration().quality,
        mappingGeneration: '4',
      },
    });
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
      operationId: olderSellpia.operationId,
      publicationSequence: '6',
      mappingGeneration: '3',
    });
    expect(result.sources.sellpia).toMatchObject({ ready: true, actualCutoff: '2026-08-31' });
  });

  it('does not mark the Sellpia source ready when it is behind FormulaState mapping generation', async () => {
    const { service } = makeService({ mappingGeneration: 4n });

    const result = await service.load({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-08-31',
    });

    expect(result.mappingGeneration).toBeNull();
    expect(result.actualCutoff).toBeNull();
    expect(result.sources).toMatchObject({ sellpia: { ready: false } });
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
        operationId: SELLPIA_RUN_ID,
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
      operationId: SELLPIA_RUN_ID,
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

  it('exports one Finance-owned evidence seam over the Sellpia source reader', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, ProfitabilityEvidenceModule)).toEqual([
      SellpiaProfitabilitySourceModule,
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

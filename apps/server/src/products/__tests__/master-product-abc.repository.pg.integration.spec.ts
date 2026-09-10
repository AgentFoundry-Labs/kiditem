import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD } from '@kiditem/shared/product-abc';
import { AlertsRepository } from '../../alerts/alerts.repository';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { ProfitabilityAdImportRepositoryAdapter } from '../../advertising/adapter/out/repository/profitability-ad-import.repository.adapter';
import { SellpiaProfitabilitySourceService } from '../../analytics/sellpia-product-sales/sellpia-profitability-source.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { MasterProductAbcRepositoryAdapter } from '../adapter/out/repository/master-product-abc.repository.adapter';
import type {
  ProductAbcPublicationInput,
} from '../application/port/out/repository/master-product-abc.repository.port';

const CUTOFF = latestClosedKstDate();

describe('MasterProductAbcRepositoryAdapter (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let repository: MasterProductAbcRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new MasterProductAbcRepositoryAdapter(prisma as never);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('publishes the baseline atomically without creating history', async () => {
    const { productId, formulaVersionId, sources } = await fixture(prisma);
    const result = await repository.publish(publication({
      formulaVersionId,
      sourceFences: sources,
      targetProductIds: [productId],
      candidates: [candidate(productId, sources, 'A')],
    }));

    expect(result).toEqual({ outcome: 'PUBLISHED', publicationRevision: 1, changedProductCount: 1 });
    await expect(prisma.masterProductAbcFormulaState.findUniqueOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toMatchObject({
      formulaRevision: 1,
      publicationRevision: 1,
      officialCutoffDate: new Date(`${CUTOFF}T00:00:00.000Z`),
      publishedMappingGeneration: 0n,
    });
    await expect(prisma.masterProduct.findUniqueOrThrow({ where: { id: productId } }))
      .resolves.toMatchObject({ abcGrade: 'A' });
    await expect(prisma.masterProductAbcEvaluation.findUniqueOrThrow({
      where: { masterProductId_organizationId: { masterProductId: productId, organizationId: TEST_ORGANIZATION_ID } },
    })).resolves.toMatchObject({
      abcGrade: 'A',
      publicationRevision: 1,
      formulaRevision: 1,
      gradeBasisCutoffDate: new Date(`${CUTOFF}T00:00:00.000Z`),
      saleStartDate: new Date('2026-05-01T00:00:00.000Z'),
    });
    await expect(prisma.masterProductAbcGradeHistory.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(0);
  });

  it('records only a later A/B/C to A/B/C transition', async () => {
    const { productId, formulaVersionId, sources } = await fixture(prisma);
    await repository.publish(publication({
      formulaVersionId,
      sourceFences: sources,
      targetProductIds: [productId],
      candidates: [candidate(productId, sources, 'B')],
    }));
    const state = await repository.getFormulaState(TEST_ORGANIZATION_ID);

    await expect(repository.publish(publication({
      formulaVersionId,
      expectedPublicationRevision: state.publicationRevision,
      sourceFences: sources,
      targetProductIds: [productId],
      candidates: [candidate(productId, sources, 'A')],
    }))).resolves.toMatchObject({
      outcome: 'PUBLISHED',
      publicationRevision: 2,
    });
    await expect(prisma.masterProductAbcGradeHistory.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
      select: { oldGrade: true, newGrade: true, publicationRevision: true },
    })).resolves.toEqual([{ oldGrade: 'B', newGrade: 'A', publicationRevision: 2 }]);
  });

  it('does not count an unchanged official grade as changed', async () => {
    const { productId, formulaVersionId, sources } = await fixture(prisma);
    await repository.publish(publication({
      formulaVersionId,
      sourceFences: sources,
      targetProductIds: [productId],
      candidates: [candidate(productId, sources, 'A')],
    }));
    const state = await repository.getFormulaState(TEST_ORGANIZATION_ID);

    await expect(repository.publish(publication({
      formulaVersionId,
      expectedPublicationRevision: state.publicationRevision,
      sourceFences: sources,
      targetProductIds: [productId],
      candidates: [candidate(productId, sources, 'A')],
    }))).resolves.toEqual({
      outcome: 'PUBLISHED',
      publicationRevision: 2,
      changedProductCount: 0,
    });
  });

  it('does not create history for null-to-grade or grade-to-null changes', async () => {
    const { productId, formulaVersionId, sources } = await fixture(prisma);
    await repository.publish(publication({
      formulaVersionId,
      sourceFences: sources,
      targetProductIds: [productId],
      candidates: [candidate(productId, sources, 'A')],
    }));
    let state = await repository.getFormulaState(TEST_ORGANIZATION_ID);
    await prisma.masterProduct.update({ where: { id: productId }, data: { isActive: false } });

    await expect(repository.publish(publication({
      formulaVersionId,
      expectedPublicationRevision: state.publicationRevision,
      sourceFences: sources,
      targetProductIds: [],
      candidates: [],
    }))).resolves.toMatchObject({ outcome: 'PUBLISHED', publicationRevision: 2 });
    state = await repository.getFormulaState(TEST_ORGANIZATION_ID);
    expect(state.publicationRevision).toBe(2);
    await expect(prisma.masterProductAbcGradeHistory.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(0);
    await expect(prisma.masterProductAbcEvaluation.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(0);
    await expect(prisma.masterProduct.findUniqueOrThrow({ where: { id: productId } }))
      .resolves.toMatchObject({ abcGrade: null });
  });

  it('preserves an old official grade when a current product becomes insufficient', async () => {
    const { productId, formulaVersionId, sources } = await fixture(prisma);
    await repository.publish(publication({
      formulaVersionId,
      sourceFences: sources,
      targetProductIds: [productId],
      candidates: [candidate(productId, sources, 'A')],
    }));
    const state = await repository.getFormulaState(TEST_ORGANIZATION_ID);

    await expect(repository.publish(publication({
      formulaVersionId,
      expectedPublicationRevision: state.publicationRevision,
      sourceFences: sources,
      // The product still belongs to the current selling set, but the service
      // omits it because its valid observation days are below the threshold.
      targetProductIds: [productId],
      candidates: [],
    }))).resolves.toEqual({
      outcome: 'PUBLISHED',
      publicationRevision: 2,
      changedProductCount: 0,
    });
    await expect(prisma.masterProductAbcEvaluation.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(1);
    await expect(prisma.masterProductAbcEvaluation.findUniqueOrThrow({
      where: { masterProductId_organizationId: { masterProductId: productId, organizationId: TEST_ORGANIZATION_ID } },
    })).resolves.toMatchObject({
      abcGrade: 'A',
      publicationRevision: 1,
    });
    await expect(prisma.masterProductAbcGradeHistory.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(0);
    await expect(prisma.masterProduct.findUniqueOrThrow({ where: { id: productId } }))
      .resolves.toMatchObject({ abcGrade: 'A' });
  });

  it('waits for a source terminalization lock before comparing its source fence', async () => {
    const { productId, formulaVersionId, sources } = await fixture(prisma);
    const blocker = makeTestPrisma();
    await blocker.$connect();

    let release!: () => void;
    const releaseSignal = new Promise<void>((resolve) => { release = resolve; });
    let acquired!: () => void;
    const acquiredSignal = new Promise<void>((resolve) => { acquired = resolve; });
    const sourceRunId = sources.sellpia.selectedComplete.sourceImportRunId!;
    const sourceLockKey = `kiditem.sellpia-product-profitability:${TEST_ORGANIZATION_ID}`;

    const blockerTransaction = blocker.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${sourceLockKey}, 0::bigint))::text AS "lock"
      `);
      // Simulate a source owner terminalizing a newer generation while ABC is
      // waiting for the same lock. The source mutation commits before ABC can
      // re-read its fence.
      await tx.sourceImportRun.update({
        where: { id: sourceRunId },
        data: { publicationSequence: 999n },
      });
      acquired();
      await releaseSignal;
    });
    await acquiredSignal;

    const publicationPromise = repository.publish(publication({
      formulaVersionId,
      sourceFences: sources,
      targetProductIds: [productId],
      candidates: [candidate(productId, sources, 'A')],
    }));

    try {
      await expect(Promise.race([
        publicationPromise.then(() => 'PUBLISHED' as const),
        new Promise<'WAITING'>((resolve) => setTimeout(() => resolve('WAITING'), 50)),
      ])).resolves.toBe('WAITING');
    } finally {
      release();
      await blockerTransaction;
      await blocker.$disconnect();
    }

    await expect(publicationPromise).resolves.toEqual({ outcome: 'INPUT_CHANGED' });
  });

  it('rejects complete source generations from an older mapping generation', async () => {
    const { productId, formulaVersionId, sources } = await fixture(prisma);
    await prisma.masterProductAbcFormulaState.update({
      where: { organizationId: TEST_ORGANIZATION_ID },
      data: { mappingGeneration: 1n },
    });

    await expect(repository.publish(publication({
      formulaVersionId,
      mappingGeneration: '1',
      sourceFences: sources,
      targetProductIds: [productId],
      candidates: [],
    }))).resolves.toEqual({ outcome: 'INPUT_CHANGED' });
    await expect(prisma.masterProductAbcFormulaState.findUniqueOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toMatchObject({ publicationRevision: 0 });
  });

  it('rejects a changed mapped sale start date without partially publishing', async () => {
    const { productId, formulaVersionId, sources } = await fixture(prisma);
    const before = await repository.getFormulaState(TEST_ORGANIZATION_ID);
    await prisma.channelListing.updateMany({
      where: { organizationId: TEST_ORGANIZATION_ID, masterProductId: productId },
      data: { rawJson: { source: 'wing_app_data', saleStartedAt: '2026-06-01' } },
    });

    await expect(repository.publish(publication({
      formulaVersionId,
      sourceFences: sources,
      targetProductIds: [productId],
      candidates: [candidate(productId, sources, 'A')],
    }))).resolves.toEqual({ outcome: 'INPUT_CHANGED' });
    await expect(repository.getFormulaState(TEST_ORGANIZATION_ID)).resolves.toEqual(before);
    await expect(prisma.masterProductAbcEvaluation.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(0);
    await expect(prisma.masterProduct.findUniqueOrThrow({ where: { id: productId } }))
      .resolves.toMatchObject({ abcGrade: null });
  });

  it('rejects candidate provenance that does not match the selected source IDs', async () => {
    const { productId, formulaVersionId, sources } = await fixture(prisma);
    const mismatched = {
      ...candidate(productId, sources, 'A'),
      sellpiaSourceImportRunId: sources.advertising.selectedComplete.sourceImportRunId!,
    };

    await expect(repository.publish(publication({
      formulaVersionId,
      sourceFences: sources,
      targetProductIds: [productId],
      candidates: [mismatched],
    }))).resolves.toEqual({ outcome: 'INPUT_CHANGED' });
    await expect(prisma.masterProductAbcEvaluation.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(0);
  });

  it('rejects a candidate after the captured product stops selling', async () => {
    const { productId, formulaVersionId, sources } = await fixture(prisma);
    await prisma.masterProduct.update({
      where: { id: productId },
      data: { isActive: false },
    });

    await expect(repository.publish(publication({
      formulaVersionId,
      sourceFences: sources,
      targetProductIds: [productId],
      candidates: [candidate(productId, sources, 'A')],
    }))).resolves.toEqual({ outcome: 'INPUT_CHANGED' });
    await expect(prisma.masterProductAbcEvaluation.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(0);
  });

  // KID-46: a collection that is still running, or that failed, published no
  // generation. The complete generation it sits on top of stays valid.
  it.each(['running', 'failed'])(
    'publishes on a complete generation under a newer %s attempt',
    async (status) => {
      const { productId, formulaVersionId, sources } = await fixture(prisma);
      await prisma.sourceImportRun.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          sourceType: 'sellpia_product_profitability',
          status,
          idempotencyKey: `abc-${status}-${randomUUID()}`,
        },
      });

      await expect(repository.publish(publication({
        formulaVersionId,
        sourceFences: sources,
        targetProductIds: [productId],
        candidates: [candidate(productId, sources, 'A')],
      }))).resolves.toMatchObject({ outcome: 'PUBLISHED', publicationRevision: 1 });
      await expect(prisma.masterProduct.findUniqueOrThrow({ where: { id: productId } }))
        .resolves.toMatchObject({ abcGrade: 'A' });
    },
  );

  it('rejects a source generation replaced by a newer complete publication', async () => {
    const { productId, formulaVersionId, sources } = await fixture(prisma);
    await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'sellpia_product_profitability',
        status: 'completed',
        idempotencyKey: `abc-corrected-${randomUUID()}`,
        publicationSequence: 9_999n,
        mappingGeneration: 0n,
        coverageStartDate: new Date('2026-01-01T00:00:00.000Z'),
        coverageEndDate: new Date(`${CUTOFF}T00:00:00.000Z`),
      },
    });

    await expect(repository.publish(publication({
      formulaVersionId,
      sourceFences: sources,
      targetProductIds: [productId],
      candidates: [candidate(productId, sources, 'A')],
    }))).resolves.toEqual({ outcome: 'INPUT_CHANGED' });
  });

  it('rejects a candidate cutoff older than the official publication', async () => {
    const { productId, formulaVersionId, sources } = await fixture(prisma);
    await repository.publish(publication({
      formulaVersionId,
      sourceFences: sources,
      targetProductIds: [productId],
      candidates: [candidate(productId, sources, 'A')],
    }));
    const state = await repository.getFormulaState(TEST_ORGANIZATION_ID);

    await expect(repository.publish(publication({
      formulaVersionId,
      expectedPublicationRevision: state.publicationRevision,
      targetCutoff: '2026-07-31',
      actualCutoff: '2026-07-31',
      sourceFences: sources,
      targetProductIds: [productId],
      candidates: [{
        ...candidate(productId, sources, 'A'),
        gradeBasisCutoffDate: '2026-07-31',
      }],
    }))).resolves.toEqual({ outcome: 'INPUT_CHANGED' });
    await expect(repository.getFormulaState(TEST_ORGANIZATION_ID)).resolves.toMatchObject({
      publicationRevision: 1,
      officialCutoffDate: CUTOFF,
    });
  });

  it('allows only one concurrent command to publish a captured revision', async () => {
    const { productId, formulaVersionId, sources } = await fixture(prisma);
    const input = publication({
      formulaVersionId,
      sourceFences: sources,
      targetProductIds: [productId],
      candidates: [candidate(productId, sources, 'A')],
    });

    const outcomes = await Promise.all([
      repository.publish(input),
      repository.publish(input),
    ]);

    expect(outcomes.map(({ outcome }) => outcome).sort()).toEqual([
      'INPUT_CHANGED',
      'PUBLISHED',
    ]);
    await expect(repository.getFormulaState(TEST_ORGANIZATION_ID)).resolves.toMatchObject({
      publicationRevision: 1,
    });
    await expect(prisma.masterProductAbcEvaluation.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(1);
  });

  it('never mutates another organization while publishing', async () => {
    const foreign = await prisma.masterProduct.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        code: `FOREIGN-${randomUUID()}`,
        name: 'Foreign ABC product',
        abcGrade: 'C',
      },
    });
    const { productId, formulaVersionId, sources } = await fixture(prisma);

    await repository.publish(publication({
      formulaVersionId,
      sourceFences: sources,
      targetProductIds: [productId],
      candidates: [candidate(productId, sources, 'A')],
    }));

    await expect(prisma.masterProduct.findUniqueOrThrow({ where: { id: foreign.id } }))
      .resolves.toMatchObject({ abcGrade: 'C' });
    await expect(prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId: OTHER_ORGANIZATION_ID },
    })).resolves.toBeNull();
  });

  it.each([
    'formula revision',
    'publication revision',
    'mapping generation',
    'target set',
  ])('rejects changed %s without partial writes', async (changedFence) => {
    const { productId, formulaVersionId, sources } = await fixture(prisma);
    const before = await repository.getFormulaState(TEST_ORGANIZATION_ID);
    const input = publication({
      formulaVersionId,
      sourceFences: sources,
      targetProductIds: [productId],
      candidates: [candidate(productId, sources, 'A')],
      ...(changedFence === 'formula revision' ? { expectedFormulaRevision: 2 } : {}),
      ...(changedFence === 'publication revision' ? { expectedPublicationRevision: 4 } : {}),
      ...(changedFence === 'mapping generation' ? { mappingGeneration: '1' } : {}),
      ...(changedFence === 'target set' ? { targetProductIds: [] } : {}),
    });

    await expect(repository.publish(input)).resolves.toEqual({ outcome: 'INPUT_CHANGED' });
    await expect(repository.getFormulaState(TEST_ORGANIZATION_ID)).resolves.toEqual(before);
    await expect(prisma.masterProductAbcEvaluation.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(0);
    await expect(prisma.masterProduct.findUniqueOrThrow({ where: { id: productId } }))
      .resolves.toMatchObject({ abcGrade: null });
  });
});

async function fixture(prisma: PrismaClient): Promise<{
  productId: string;
  formulaVersionId: string;
  sources: ProductAbcPublicationInput['sourceFences'];
}> {
  const formulaVersion = await prisma.masterProductAbcFormulaVersion.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      formulaKey: 'PRODUCT_ABC_ABSOLUTE',
      version: 2,
      formulaJson: JSON.parse(JSON.stringify(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD)),
      formulaChecksum: '230d35436ffd2fd42bf4eb4ea3f0c99bd7474dcf5b7cf11f6ed235aff84cc64f',
    },
  });
  await prisma.masterProductAbcFormulaState.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      activeFormulaVersionId: formulaVersion.id,
      formulaRevision: 1,
      publicationRevision: 0,
      mappingGeneration: 0n,
    },
  });
  const product = await seedSellingProduct(prisma);
  const { sellpiaRunId, advertisingRunId } = await publishSources(prisma, product.skuCode);
  const [sellpiaRun, advertisingRun] = await Promise.all([
    prisma.sourceImportRun.findUniqueOrThrow({ where: { id: sellpiaRunId } }),
    prisma.sourceImportRun.findUniqueOrThrow({ where: { id: advertisingRunId } }),
  ]);
  return {
    productId: product.productId,
    formulaVersionId: formulaVersion.id,
    sources: {
      sellpia: { selectedComplete: sourceView(sellpiaRun) },
      advertising: { selectedComplete: sourceView(advertisingRun) },
    },
  };
}

function publication(overrides: Partial<ProductAbcPublicationInput>): ProductAbcPublicationInput {
  const sourceFences = overrides.sourceFences ?? {
    sellpia: { selectedComplete: sourceViewById('00000000-0000-0000-0000-000000000001') },
    advertising: { selectedComplete: sourceViewById('00000000-0000-0000-0000-000000000002') },
  };
  return {
    organizationId: TEST_ORGANIZATION_ID,
    expectedFormulaRevision: 1,
    expectedPublicationRevision: 0,
    formulaVersionId: '00000000-0000-0000-0000-000000000000',
    targetCutoff: CUTOFF,
    actualCutoff: CUTOFF,
    mappingGeneration: '0',
    targetProductIds: [],
    candidates: [],
    calculatedAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
    saleAgeInputs: overrides.saleAgeInputs ?? (overrides.targetProductIds ?? [])
      .map((masterProductId) => ({ masterProductId, mappingValid: true, saleStartDate: '2026-05-01' })),
    sourceFences,
  };
}

function candidate(
  productId: string,
  sources: ProductAbcPublicationInput['sourceFences'],
  abcGrade: 'A' | 'B' | 'C',
) {
  return {
    masterProductId: productId,
    saleStartDate: '2026-05-01',
    abcGrade,
    validObservationDays: 30,
    gradeBasisCutoffDate: CUTOFF,
    weightedRevenue: 1_000_000,
    weightedOrderTimeSupplyCost: 200_000,
    weightedAdvertisingSpend: 100_000,
    weightedOperatingProfit: 700_000,
    operatingProfitVelocity30: 700_000,
    operatingMargin: 0.7,
    lossPersistence: 0,
    profitScore: 70,
    marginScore: 100,
    consistencyScore: 100,
    economicScore: abcGrade === 'A' ? 85 : abcGrade === 'B' ? 75 : 20,
    sellpiaSourceImportRunId: sources.sellpia.selectedComplete.sourceImportRunId!,
    advertisingSourceImportRunId: sources.advertising.selectedComplete.sourceImportRunId!,
    sellpiaGeneration: sources.sellpia.selectedComplete.publicationSequence!,
    advertisingGeneration: sources.advertising.selectedComplete.publicationSequence!,
    mappingGeneration: '0',
  };
}

function sourceView(run: {
  id: string;
  publicationSequence: bigint | null;
  mappingGeneration: bigint | null;
  coverageStartDate: Date | null;
  coverageEndDate: Date | null;
  importedAt: Date | null;
}) {
  return {
    sourceImportRunId: run.id,
    publicationSequence: run.publicationSequence?.toString() ?? null,
    mappingGeneration: run.mappingGeneration?.toString() ?? null,
    coverageStartDate: run.coverageStartDate?.toISOString().slice(0, 10) ?? null,
    coverageEndDate: run.coverageEndDate?.toISOString().slice(0, 10) ?? null,
    capturedAt: run.importedAt?.toISOString() ?? null,
  };
}

function sourceViewById(sourceImportRunId: string) {
  return {
    sourceImportRunId,
    publicationSequence: '1',
    mappingGeneration: '0',
    coverageStartDate: '2026-01-01',
    coverageEndDate: CUTOFF,
    capturedAt: '2026-09-01T00:00:00.000Z',
  };
}

async function seedSellingProduct(prisma: PrismaClient): Promise<{ productId: string; skuCode: string }> {
  const product = await prisma.masterProduct.create({
    data: { organizationId: TEST_ORGANIZATION_ID, code: `ABC-${randomUUID()}`, name: 'ABC product' },
  });
  const account = await prisma.channelAccount.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      channel: 'coupang',
      name: 'ABC account',
      externalAccountId: 'abc-account',
      vendorId: 'abc-vendor',
      status: 'active',
    },
  });
  const listing = await prisma.channelListing.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: account.id,
      masterProductId: product.id,
      externalId: `LISTING-${randomUUID()}`,
      status: 'active',
      rawJson: { source: 'wing_app_data', saleStartedAt: '2026-05-01' },
    },
  });
  const option = await prisma.channelListingOption.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      listingId: listing.id,
      externalOptionId: `OPTION-${randomUUID()}`,
      status: '판매중',
    },
  });
  const skuCode = `SKU-${randomUUID()}`;
  const sku = await prisma.sellpiaInventorySku.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      masterProductId: product.id,
      code: skuCode,
      name: 'ABC SKU',
      currentStock: 10,
      isActive: true,
    },
  });
  await prisma.channelListingOptionInventoryComponent.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      channelListingOptionId: option.id,
      sellpiaInventorySkuId: sku.id,
      quantity: 1,
    },
  });
  return { productId: product.id, skuCode };
}

async function publishSources(prisma: PrismaClient, skuCode: string): Promise<{
  sellpiaRunId: string;
  advertisingRunId: string;
}> {
  const alerts = new SourceFailureAlerts(new AlertsRepository(prisma as never));
  const sellpia = new SellpiaProfitabilitySourceService(prisma as never, alerts);
  const advertising = new ProfitabilityAdImportRepositoryAdapter(prisma as never, alerts);
  const sellpiaAttempt = await sellpia.beginAttempt(
    TEST_ORGANIZATION_ID,
    `abc-${randomUUID()}`,
  );
  await sellpia.submitAttempt(TEST_ORGANIZATION_ID, sellpiaAttempt.attemptId, {
    attemptToken: sellpiaAttempt.attemptToken,
    parserVersion: 'sellpia-profitability-v2',
    providerBackedEmptyProof: true,
    coveredMonths: sellpiaAttempt.plan.coveredMonths,
    provenance: {
      source: 'sellpia_stat_prd_profit',
      costBasis: 'ORDER_TIME_SUPPLY_COST',
      vatIncluded: true,
    },
    products: [{
      productCode: skuCode,
      optionCode: '',
      productName: 'ABC product',
      salePrice: 1_000_000,
      buyPrice: 200_000,
      totalOrderAmount: 1_000_000,
      totalOrderQty: 1,
      totalInAmount: 200_000,
      totalInQty: 1,
      months: [{
        yearMonth: sellpiaAttempt.plan.coveredMonths.at(-1)!,
        orderQty: 1,
        orderAmount: 1_000_000,
        inQty: 1,
        inAmount: 200_000,
      }],
    }],
  });
  // A completed empty advertising generation is the explicit NOT_APPLIED
  // proof for this fixture. Keep the selling account out of the collection
  // plan while creating it, then restore its live selling status.
  await prisma.channelAccount.updateMany({
    where: { organizationId: TEST_ORGANIZATION_ID, channel: 'coupang' },
    data: { status: 'inactive' },
  });
  const advertisingAttempt = await advertising.beginAttempt({
    organizationId: TEST_ORGANIZATION_ID,
    idempotencyKey: `abc-ad-${randomUUID()}`,
  });
  await advertising.finalizeAttempt({
    organizationId: TEST_ORGANIZATION_ID,
    attemptId: advertisingAttempt.attemptId,
    attemptToken: advertisingAttempt.attemptToken,
  });
  await prisma.channelAccount.updateMany({
    where: { organizationId: TEST_ORGANIZATION_ID, channel: 'coupang' },
    data: { status: 'active' },
  });
  return { sellpiaRunId: sellpiaAttempt.attemptId, advertisingRunId: advertisingAttempt.attemptId };
}

function latestClosedKstDate(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1_000);
  const yesterday = new Date(Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate() - 1,
  ));
  return yesterday.toISOString().slice(0, 10);
}

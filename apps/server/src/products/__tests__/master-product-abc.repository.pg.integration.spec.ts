import { InventoryTransactionalReadRepositoryAdapter } from '../../inventory/adapter/out/persistence/inventory-transactional-read.repository.adapter';
import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD } from '@kiditem/shared/product-abc';
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
    repository = new MasterProductAbcRepositoryAdapter(
      prisma as never,
      new InventoryTransactionalReadRepositoryAdapter(),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('keeps selling configuration and latest sale status on one repeatable-read snapshot', async () => {
    const publisher = makeTestPrisma();
    const observer = makeTestPrisma();
    await Promise.all([publisher.$connect(), observer.$connect()]);
    const { productId } = await seedSellingProduct(prisma);
    const listing = await prisma.channelListing.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, masterProductId: productId },
    });
    await prisma.channelListingDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        channel: 'rocket',
        externalId: listing.externalId,
        businessDate: new Date('2026-09-01T00:00:00.000Z'),
        saleStatus: '판매중',
      },
    });

    const publicationLocked = deferred<void>();
    const publish = deferred<void>();
    const publication = publisher.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'LOCK TABLE channel_listing_daily_snapshots IN ACCESS EXCLUSIVE MODE',
      );
      publicationLocked.resolve();
      await publish.promise;
      await tx.channelListingDailySnapshot.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          listingId: listing.id,
          channel: 'rocket',
          externalId: listing.externalId,
          businessDate: new Date('2026-09-02T00:00:00.000Z'),
          saleStatus: '판매중지',
        },
      });
    }, { timeout: 15_000 });

    try {
      await publicationLocked.promise;
      const reading = repository.listCurrentAbcTargetIds(TEST_ORGANIZATION_ID);
      await waitForBlockedListingStateRead(observer);
      publish.resolve();
      await publication;

      await expect(reading).resolves.toEqual([productId]);
    } finally {
      publish.resolve();
      await publication.catch(() => undefined);
      await Promise.all([publisher.$disconnect(), observer.$disconnect()]);
    }
  }, 20_000);

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
    // The evaluation table is the publication. The retired MasterProduct
    // cache is deliberately untouched until KID-90 removes the column.
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
  });

  // Publication compares, records history, and clears from the retained
  // evaluations alone; the product row has no grade column (KID-90).
  it('publishes grade changes and clears from retained evaluations alone', async () => {
    const { productId, formulaVersionId, sources } = await fixture(prisma);
    await repository.publish(publication({
      formulaVersionId,
      sourceFences: sources,
      targetProductIds: [productId],
      candidates: [candidate(productId, sources, 'B')],
    }));
    const restore = 'roll back both publications';

    await expect(prisma.$transaction(async (tx) => {
      const inTransaction = new MasterProductAbcRepositoryAdapter({
        $transaction: (run: (client: Prisma.TransactionClient) => Promise<unknown>) => run(tx),
      } as never, new InventoryTransactionalReadRepositoryAdapter());

      await expect(inTransaction.publish(publication({
        formulaVersionId,
        expectedPublicationRevision: 1,
        sourceFences: sources,
        targetProductIds: [productId],
        candidates: [candidate(productId, sources, 'A')],
      }))).resolves.toEqual({ outcome: 'PUBLISHED', publicationRevision: 2, changedProductCount: 1 });
      await expect(tx.masterProductAbcGradeHistory.findMany({
        where: { organizationId: TEST_ORGANIZATION_ID },
        select: { oldGrade: true, newGrade: true, publicationRevision: true },
      })).resolves.toEqual([{ oldGrade: 'B', newGrade: 'A', publicationRevision: 2 }]);

      // A product that stops selling leaves the target set; its retained
      // evaluation is the one publication clears.
      await tx.masterProduct.updateMany({
        where: { id: productId, organizationId: TEST_ORGANIZATION_ID },
        data: { isActive: false },
      });
      await expect(inTransaction.publish(publication({
        formulaVersionId,
        expectedPublicationRevision: 2,
        sourceFences: sources,
        targetProductIds: [],
        candidates: [],
      }))).resolves.toEqual({ outcome: 'PUBLISHED', publicationRevision: 3, changedProductCount: 1 });
      await expect(tx.masterProductAbcEvaluation.count({
        where: { organizationId: TEST_ORGANIZATION_ID },
      })).resolves.toBe(0);
      throw new Error(restore);
    }, { maxWait: 10_000, timeout: 60_000 })).rejects.toThrow(restore);
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
    await expect(repository.readPublication(TEST_ORGANIZATION_ID, [productId]))
      .resolves.toMatchObject({
        publication: { publicationRevision: 2 },
        products: [{
          masterProductId: productId,
          evaluation: { abcGrade: 'A', publicationRevision: 1 },
          contributionEligible: false,
        }],
      });
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
    },
  );

  // Publication verifies the evaluated generation's identity as
  // given; it does not re-select the current generation. A newer complete
  // generation landing between the caller's evaluation and the commit is
  // freshness, not invalidity, so the evaluated pair still publishes and the
  // next recalculation picks the newer one up.
  it('publishes evaluated generations a newer complete publication has superseded', async () => {
    const { productId, skuCode, formulaVersionId, sources } = await fixture(prisma);
    const newer = await publishSources(prisma, skuCode);
    const [newerSellpia, newerAdvertising] = await Promise.all([
      prisma.sourceImportRun.findUniqueOrThrow({ where: { id: newer.sellpiaRunId } }),
      prisma.sourceImportRun.findUniqueOrThrow({ where: { id: newer.advertisingRunId } }),
    ]);
    expect(newerSellpia.publicationSequence)
      .toBeGreaterThan(BigInt(sources.sellpia.selectedComplete.publicationSequence!));
    expect(newerAdvertising.publicationSequence)
      .toBeGreaterThan(BigInt(sources.advertising.selectedComplete.publicationSequence!));

    await expect(repository.publish(publication({
      formulaVersionId,
      sourceFences: sources,
      targetProductIds: [productId],
      candidates: [candidate(productId, sources, 'A')],
    }))).resolves.toMatchObject({ outcome: 'PUBLISHED', publicationRevision: 1 });

    // The persisted provenance is the generation the caller evaluated, never
    // the newer one it never read.
    await expect(prisma.masterProductAbcFormulaState.findUniqueOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toMatchObject({
      publishedSellpiaSourceImportRunId: sources.sellpia.selectedComplete.sourceImportRunId,
      publishedAdvertisingSourceImportRunId: sources.advertising.selectedComplete.sourceImportRunId,
    });
    await expect(prisma.masterProductAbcEvaluation.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, masterProductId: productId },
    })).resolves.toMatchObject({
      sellpiaSourceImportRunId: sources.sellpia.selectedComplete.sourceImportRunId,
      advertisingSourceImportRunId: sources.advertising.selectedComplete.sourceImportRunId,
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
      },
    });
    const { productId, formulaVersionId, sources } = await fixture(prisma);

    await repository.publish(publication({
      formulaVersionId,
      sourceFences: sources,
      targetProductIds: [productId],
      candidates: [candidate(productId, sources, 'A')],
    }));

    await expect(prisma.masterProductAbcEvaluation.count({
      where: { organizationId: OTHER_ORGANIZATION_ID, masterProductId: foreign.id },
    })).resolves.toBe(0);
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
  });
});

async function fixture(prisma: PrismaClient): Promise<{
  productId: string;
  skuCode: string;
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
    skuCode: product.skuCode,
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
      channel: 'rocket',
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
  const inventoryVerifiedAt = new Date();
  const inventoryRun = await prisma.sourceImportRun.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sourceType: 'sellpia_inventory',
      channelAccountId: null,
      fileName: 'abc-repository-inventory.json',
      fileHash: 'f'.repeat(64),
      status: 'completed',
      rowCount: 1,
      importedAt: inventoryVerifiedAt,
      lastVerifiedAt: inventoryVerifiedAt,
      verificationCount: 1,
      freshnessGeneration: 1n,
    },
  });
  await prisma.sellpiaInventoryState.upsert({
    where: { organizationId: TEST_ORGANIZATION_ID },
    create: {
      organizationId: TEST_ORGANIZATION_ID,
      requestedGeneration: 1n,
      verifiedGeneration: 1n,
      lastVerifiedAt: inventoryVerifiedAt,
      lastCompletedImportRunId: inventoryRun.id,
    },
    update: {
      requestedGeneration: 1n,
      verifiedGeneration: 1n,
      lastVerifiedAt: inventoryVerifiedAt,
      lastCompletedImportRunId: inventoryRun.id,
    },
  });
  const sku = await prisma.sellpiaInventorySku.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      masterProductId: product.id,
      code: skuCode,
      name: 'ABC SKU',
      currentStock: 10,
      isActive: true,
      lastImportRunId: inventoryRun.id,
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
  const alerts = new SourceFailureAlerts(prisma as never);
  const sellpia = new SellpiaProfitabilitySourceService(
    prisma as never,
    alerts,
    new InventoryTransactionalReadRepositoryAdapter(),
  );
  const advertising = new ProfitabilityAdImportRepositoryAdapter(prisma as never, alerts, new InventoryTransactionalReadRepositoryAdapter());
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
  // This Rocket-only selling fixture has no retained Coupang advertising
  // account, so an empty COMPLETE generation is genuine NOT_APPLIED proof.
  const advertisingAttempt = await advertising.beginAttempt({
    organizationId: TEST_ORGANIZATION_ID,
    idempotencyKey: `abc-ad-${randomUUID()}`,
  });
  await advertising.finalizeAttempt({
    organizationId: TEST_ORGANIZATION_ID,
    attemptId: advertisingAttempt.attemptId,
    attemptToken: advertisingAttempt.attemptToken,
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitForBlockedListingStateRead(prisma: PrismaClient): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const [activity] = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND state = 'active'
          AND wait_event_type = 'Lock'
          AND query ILIKE '%channel_listing_daily_snapshots%'
      ) AS waiting
    `;
    if (activity?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for the ABC selling-state read to block.');
}

import { seedSourceProduct } from '../../test-helpers/inventory-seeds';
import { ProductTransactionalReadRepositoryAdapter } from '../adapter/out/persistence/product-transactional-read.repository.adapter';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  productAbcDisplayStatus,
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
} from '@kiditem/shared/product-abc';
import { CatalogDisplayMediaRepositoryAdapter } from '../../ai/adapter/out/repository/catalog-display-media.repository.adapter';
import { CatalogDisplayMediaService } from '../../ai/application/service/catalog-display-media.service';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { ProfitabilityAdImportRepositoryAdapter } from '../../advertising/adapter/out/repository/profitability-ad-import.repository.adapter';
import { SellpiaProductInventoryReader } from '../../analytics/sellpia-product-sales/sellpia-product-inventory-reader';
import { SellpiaProductSalesService } from '../../analytics/sellpia-product-sales/sellpia-product-sales.service';
import { SellpiaProfitabilitySourceService } from '../../analytics/sellpia-product-sales/sellpia-profitability-source.service';
import { MasterProductContributionRepositoryAdapter } from '../../finance/adapter/out/repository/master-product-contribution.repository.adapter';
import { MasterProductContributionReadService } from '../../finance/application/service/master-product-contribution-read.service';
import { MasterProductProfitabilityReadService } from '../../finance/application/service/master-product-profitability-read.service';
import { ProductAvailabilityRepositoryAdapter } from '../adapter/out/persistence/product-availability.repository.adapter';
import { ProductAvailabilityUseCase } from '../application/usecase/product-availability.usecase';
import { ProductSourceReadRepositoryAdapter } from '../adapter/out/persistence/product-source-read.repository.adapter';
import { ProductSourceReadUseCase } from '../application/usecase/product-source-read.usecase';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { MasterProductAbcRepositoryAdapter } from '../adapter/out/persistence/master-product-abc.repository.adapter';
import { ChannelOptionRecipeRepositoryAdapter } from '../../channels/adapter/out/persistence/channel-option-recipe.repository.adapter';
import { ProductOperationsDataStatusRepositoryAdapter } from '../adapter/out/persistence/product-operations-data-status.repository.adapter';
import { ProductOperationsRepositoryAdapter } from '../adapter/out/persistence/product-operations.repository.adapter';
import { RecalculateProductAbcUseCase } from '../application/usecase/recalculate-product-abc.usecase';
import { ProductAbcReadUseCase } from '../application/usecase/product-abc-read.usecase';
import { ChannelOptionRecipeUseCase } from '../../channels/application/usecase/channel-option-recipe.usecase';
import { ProductQueryUseCase } from '../application/usecase/product-query.usecase';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

const ACCEPTANCE_NOW = new Date('2026-09-13T03:00:00.000Z');
const EXPECTED_CUTOFF = '2026-09-12';
const EXPECTED_SELLPIA_FROM = '2025-08-08';
const EXPECTED_ADVERTISING_FROM = '2025-10-01';
const FORMULA_CHECKSUM = '230d35436ffd2fd42bf4eb4ea3f0c99bd7474dcf5b7cf11f6ed235aff84cc64f';
const AD_SOURCE_POLICY_HASH = '5c612a721e1a6a7177cec1f8155149f390f8fc6073c90efdd577a33ddfcd84fc';

/**
 * KID-40 / KID-95 — one release seam connects the operator's Products recipe
 * replacement to both profitability source owners, Products' explicit ABC
 * publication command, and the Product Hub reads that operators use. The
 * fixtures below are isolated provider-shaped inputs; this deterministic test
 * is not evidence that a real browser/provider collection ran.
 */
describe('Products recipe to ABC public reads (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let products: ProductQueryUseCase;
  let recipes: ChannelOptionRecipeUseCase;
  let abc: RecalculateProductAbcUseCase;
  let sellpia: SellpiaProfitabilitySourceService;
  let advertising: ProfitabilityAdImportRepositoryAdapter;
  let profitability: MasterProductProfitabilityReadService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const prismaService = prisma as unknown as PrismaService;
    const alerts = new SourceFailureAlerts(prismaService);
    sellpia = new SellpiaProfitabilitySourceService(
      prismaService,
      alerts,
      new ProductTransactionalReadRepositoryAdapter(),
    );
    advertising = new ProfitabilityAdImportRepositoryAdapter(prismaService, alerts);
    profitability = new MasterProductProfitabilityReadService(
      sellpia,
      advertising,
      prismaService,
     new ProductTransactionalReadRepositoryAdapter());
    const inventory = new ProductAvailabilityUseCase(
      new ProductAvailabilityRepositoryAdapter(prismaService),
    );
    const abcRepository = new MasterProductAbcRepositoryAdapter(
      prismaService,
      new ProductTransactionalReadRepositoryAdapter(),
    );
    const abcRead = new ProductAbcReadUseCase(abcRepository, profitability);
    const displayMedia = new CatalogDisplayMediaService(
      new CatalogDisplayMediaRepositoryAdapter(prismaService),
    );
    const inventoryReader = new SellpiaProductInventoryReader(
      prismaService,
      inventory,
      displayMedia,
      abcRead,
      new ProductTransactionalReadRepositoryAdapter(),
    );
    recipes = new ChannelOptionRecipeUseCase(
      new ChannelOptionRecipeRepositoryAdapter(
        prismaService,
        new ProductTransactionalReadRepositoryAdapter(),
      ),
    );
    products = new ProductQueryUseCase(
      new ProductOperationsRepositoryAdapter(
        prismaService,
        new ProductTransactionalReadRepositoryAdapter(),
        new ProductSourceReadUseCase(
          new ProductSourceReadRepositoryAdapter(prismaService),
        ),
      ),
      inventory,
      new SellpiaProductSalesService(prismaService, inventoryReader),
      displayMedia,
      new ProductOperationsDataStatusRepositoryAdapter(
        prismaService,
        profitability,
        new ProductTransactionalReadRepositoryAdapter(),
      ),
      new MasterProductContributionReadService(
        new MasterProductContributionRepositoryAdapter(prismaService, new ProductTransactionalReadRepositoryAdapter()),
      ),
    );
    abc = new RecalculateProductAbcUseCase(abcRepository, profitability);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(ACCEPTANCE_NOW);
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('invalidates old source generations, republishes one grade, withholds one product, and keeps list/detail/filter/count aligned', async () => {
    await seedFormula(prisma);
    const fixture = await seedProducts(prisma);

    // Establish generation 1 and a previously complete source pair through
    // owner entrypoints. The second recipe replacement is the acceptance
    // change under test, and an exact replay must remain generation 2.
    await expect(recipes.applyPreservingRecipes({
      organizationId: TEST_ORGANIZATION_ID,
      mutations: [{
        channelListingOptionId: fixture.insufficient.optionId,
        expectedMasterProductId: fixture.insufficient.productId,
        components: [{ masterProductId: fixture.insufficient.skuId, quantity: 3 }],
      }],
    })).resolves.toEqual({
      changedOptionCount: 1,
      matchedListingCount: 1,
      conflictingChannelListingOptionIds: [],
      mappingChanged: true,
    });
    const previousSources = await completeProfitabilitySources(fixture, null, 'previous');
    expect(previousSources).toMatchObject({
      mappingGeneration: '1',
      sellpiaPublicationSequence: '1',
      advertisingPublicationSequence: '1',
    });

    const replacement = {
      components: [{ masterProductId: fixture.normal.skuId, quantity: 2 }],
    };
    await expect(recipes.replaceRecipe({
      organizationId: TEST_ORGANIZATION_ID,
      channelListingOptionId: fixture.normal.optionId,
      ...replacement,
    })).resolves.toEqual({ masterProductId: fixture.normal.productId });
    await expect(recipes.replaceRecipe({
      organizationId: TEST_ORGANIZATION_ID,
      channelListingOptionId: fixture.normal.optionId,
      ...replacement,
    })).resolves.toEqual({ masterProductId: fixture.normal.productId });

    const replacedDetail = await products.getProduct(
      TEST_ORGANIZATION_ID,
      fixture.normal.productId,
    );
    expect(replacedDetail).toMatchObject({
      abc: {
        publicationRevision: 0,
        sources: { mapping: { valid: true, currentMappingGeneration: '2', evidenceMappingGeneration: null } },
      },
      channelListings: [{ options: [{
        id: fixture.normal.optionId,
        inventoryComponents: [{
          masterProductId: fixture.normal.skuId,
          quantity: 2,
          currentStock: 37,
        }],
      }] }],
    });

    // Generation-1 owners are still complete, but Products must refuse them
    // after the recipe advanced the current mapping to generation 2.
    await expect(abc.recalculate({ organizationId: TEST_ORGANIZATION_ID }))
      .resolves.toMatchObject({
        outcome: 'SOURCE_NOT_READY',
        publicationRevision: 0,
        officialCutoff: null,
        actualCutoff: null,
        sources: {
          sellpia: { ready: false, latestAttempt: { state: 'COMPLETE' } },
          advertising: { ready: false, latestAttempt: { state: 'COMPLETE' } },
        },
      });

    const currentSources = await completeProfitabilitySources(
      fixture,
      fixture.insufficient.skuCode,
      'current',
    );
    expect(currentSources).toMatchObject({
      mappingGeneration: '2',
      sellpiaPublicationSequence: '2',
      advertisingPublicationSequence: '2',
      sellpiaCoverage: { from: EXPECTED_SELLPIA_FROM, to: EXPECTED_CUTOFF },
      advertisingCoverage: { from: EXPECTED_ADVERTISING_FROM, to: EXPECTED_CUTOFF },
      sellpiaQuality: {
        contract: 'sellpia-profitability-v2',
        parserVersion: 'sellpia-profitability-v2',
        correctedCostEvidence: true,
        mappingGeneration: '2',
        provenance: {
          source: 'sellpia_stat_prd_profit',
          costBasis: 'ORDER_TIME_SUPPLY_COST',
          vatIncluded: true,
        },
      },
      advertisingSourceType: 'coupang_ad_profitability',
      advertisingPolicy: {
        version: 'WHOLE_RECIPE_QUANTITY_V1',
        allocation: 'INTEGER_KRW_LARGEST_REMAINDER',
        tieBreak: 'MASTER_PRODUCT_ID_ASC_LOWERCASE',
        mappingGeneration: '2',
        adSourcePolicyHash: AD_SOURCE_POLICY_HASH,
      },
      advertisingQuality: {
        plannedAccountCount: 0,
        plannedSliceCount: 0,
        receiptCount: 0,
        providerSpendKrw: 0,
        allocatedSpendKrw: 0,
      },
    });

    await expect(abc.recalculate({ organizationId: TEST_ORGANIZATION_ID }))
      .resolves.toEqual({
        outcome: 'PUBLISHED',
        publicationRevision: 1,
        formulaRevision: 1,
        officialCutoff: EXPECTED_CUTOFF,
        classifiedProductCount: 1,
        unclassifiedProductCount: 1,
        changedProductCount: 1,
        // Both sources end on the official cutoff, so the publication left none out.
        sources: {
          sellpia: expect.objectContaining({ ready: true, actualCutoff: EXPECTED_CUTOFF }),
          advertising: expect.objectContaining({ ready: true, actualCutoff: EXPECTED_CUTOFF }),
        },
      });

    const [normalDetail, insufficientDetail, all, gradeA, unclassified, ready, withheld] =
      await Promise.all([
        products.getProduct(TEST_ORGANIZATION_ID, fixture.normal.productId),
        products.getProduct(TEST_ORGANIZATION_ID, fixture.insufficient.productId),
        listProducts(),
        listProducts({ abcGrade: 'A' }),
        listProducts({ abcGrade: 'unclassified' }),
        listProducts({ abcCalculationStatus: 'READY' }),
        listProducts({ abcCalculationStatus: 'INSUFFICIENT_EVIDENCE' }),
      ]);

    expect(normalDetail).toMatchObject({
      id: fixture.normal.productId,
      abcGrade: 'A',
      abcEvaluation: {
        abcGrade: 'A',
        weightedAdvertisingSpend: 0,
        formula: { formulaKey: 'PRODUCT_ABC_ABSOLUTE', version: 2 },
        formulaRevision: 1,
        publicationRevision: 1,
        gradeBasisCutoffDate: EXPECTED_CUTOFF,
        saleStartDate: '2025-01-01',
        sellpiaSourceImportRunId: currentSources.sellpiaSourceImportRunId,
        advertisingSourceImportRunId: currentSources.advertisingSourceImportRunId,
        sellpiaGeneration: '2',
        advertisingGeneration: '2',
        mappingGeneration: '2',
      },
      abc: {
        abcGrade: 'A',
        publicationRevision: 1,
        officialCutoffDate: EXPECTED_CUTOFF,
        actualCutoffDate: EXPECTED_CUTOFF,
        sources: { mapping: { valid: true, currentMappingGeneration: '2', evidenceMappingGeneration: '2' } },
      },
    });
    expect(insufficientDetail).toMatchObject({
      id: fixture.insufficient.productId,
      abcGrade: null,
      abcEvaluation: null,
      abc: {
        abcGrade: null,
        evaluation: null,
        publicationRevision: 1,
        officialCutoffDate: EXPECTED_CUTOFF,
        actualCutoffDate: EXPECTED_CUTOFF,
      },
    });

    expect([normalDetail, insufficientDetail].map((detail) => productAbcDisplayStatus(detail.abc)))
      .toEqual(['READY', 'INSUFFICIENT_EVIDENCE']);
    expect(all).toMatchObject({
      total: 2,
      summary: {
        abcGradeCounts: { A: 1, B: 0, C: 0, unclassified: 1 },
      },
    });
    expect(all.items.map(({ id, abcGrade, abc }) => ({
      id,
      abcGrade,
      displayStatus: productAbcDisplayStatus(abc),
    }))).toEqual(expect.arrayContaining([
      { id: fixture.normal.productId, abcGrade: 'A', displayStatus: 'READY' },
      {
        id: fixture.insufficient.productId,
        abcGrade: null,
        displayStatus: 'INSUFFICIENT_EVIDENCE',
      },
    ]));
    expect(gradeA).toMatchObject({
      total: 1,
      items: [{ id: fixture.normal.productId, abcGrade: 'A' }],
      summary: { abcGradeCounts: { A: 1, B: 0, C: 0, unclassified: 0 } },
    });
    expect(unclassified).toMatchObject({
      total: 1,
      items: [{ id: fixture.insufficient.productId, abcGrade: null }],
      summary: { abcGradeCounts: { A: 0, B: 0, C: 0, unclassified: 1 } },
    });
    expect(ready).toMatchObject({
      total: 1,
      items: [{ id: fixture.normal.productId }],
    });
    expect(withheld).toMatchObject({
      total: 1,
      items: [{ id: fixture.insufficient.productId }],
    });
    // The calculation-status filter and the shared word agree row by row.
    expect(ready.items.map(({ abc }) => productAbcDisplayStatus(abc))).toEqual(['READY']);
    expect(withheld.items.map(({ abc }) => productAbcDisplayStatus(abc)))
      .toEqual(['INSUFFICIENT_EVIDENCE']);
  });

  it('refuses with INPUT_CHANGED and writes nothing when a recipe replacement moves the mapping during a recalculation', async () => {
    await seedFormula(prisma);
    const fixture = await seedProducts(prisma);
    await recipes.applyPreservingRecipes({
      organizationId: TEST_ORGANIZATION_ID,
      mutations: [{
        channelListingOptionId: fixture.insufficient.optionId,
        expectedMasterProductId: fixture.insufficient.productId,
        components: [{ masterProductId: fixture.insufficient.skuId, quantity: 3 }],
      }],
    });
    await completeProfitabilitySources(fixture, null, 'previous');

    // Products reads mapping generation 1 and captures its targets. Before the
    // evidence load reads the mapping, the operator replaces a recipe and both
    // sources complete on generation 2.
    const repository = new MasterProductAbcRepositoryAdapter(
      prisma as unknown as PrismaService,
      new ProductTransactionalReadRepositoryAdapter(),
    );
    const listTargets = repository.listCurrentAbcTargetIds.bind(repository);
    repository.listCurrentAbcTargetIds = async (organizationId) => {
      const targets = await listTargets(organizationId);
      await recipes.replaceRecipe({ organizationId: TEST_ORGANIZATION_ID, channelListingOptionId: fixture.normal.optionId,
        components: [{ masterProductId: fixture.normal.skuId, quantity: 2 }],
      });
      await completeProfitabilitySources(fixture, null, 'current');
      return targets;
    };

    await expect(new RecalculateProductAbcUseCase(repository, profitability)
      .recalculate({ organizationId: TEST_ORGANIZATION_ID }))
      .rejects.toMatchObject({ status: 409, response: { code: 'INPUT_CHANGED' } });

    // No source is waiting: both read ready on the new generation, so this is
    // not SOURCE_NOT_READY, and nothing was published.
    await expect(profitability.load({
      organizationId: TEST_ORGANIZATION_ID,
      targetCutoff: EXPECTED_CUTOFF,
    })).resolves.toMatchObject({
      actualCutoff: EXPECTED_CUTOFF,
      mappingGeneration: '2',
      sources: { sellpia: { ready: true }, advertising: { ready: true } },
    });
    await expect(prisma.masterProductAbcFormulaState.findUniqueOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toMatchObject({
      mappingGeneration: 2n,
      publicationRevision: 0,
      officialCutoffDate: null,
      publishedMappingGeneration: null,
    });
    await expect(prisma.masterProductAbcEvaluation.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(0);
    await expect(prisma.masterProductAbcGradeHistory.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(0);

    // The retry the operator is told to make publishes on generation 2.
    await expect(abc.recalculate({ organizationId: TEST_ORGANIZATION_ID }))
      .resolves.toMatchObject({
        outcome: 'PUBLISHED',
        publicationRevision: 1,
        officialCutoff: EXPECTED_CUTOFF,
      });
  });

  function listProducts(filter: Record<string, unknown> = {}) {
    return products.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 30,
      activeStatus: 'all',
      ...filter,
    });
  }

  async function completeProfitabilitySources(
    fixture: ProductsFixture,
    productWithHole: string | null,
    label: string,
  ) {
    // Source owners order attempts by their observed start time. Keep the two
    // completed collections distinct while remaining on the same KST cutoff.
    vi.setSystemTime(new Date(
      ACCEPTANCE_NOW.getTime() + (label === 'current' ? 60_000 : 0),
    ));
    const sellpiaAttempt = await sellpia.beginAttempt(
      TEST_ORGANIZATION_ID,
      `abc-acceptance-sellpia-${label}`,
    );
    expect(sellpiaAttempt.plan).toMatchObject({
      from: EXPECTED_SELLPIA_FROM,
      to: EXPECTED_CUTOFF,
    });
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
      products: [fixture.normal, fixture.insufficient].map((product) => {
        const omittedMonth = product.skuCode === productWithHole
          ? sellpiaAttempt.plan.coveredMonths.at(-4)
          : null;
        const months = sellpiaAttempt.plan.coveredMonths
          .filter((yearMonth) => yearMonth !== omittedMonth)
          .map((yearMonth) => ({
            yearMonth,
            orderQty: 10,
            orderAmount: 1_000_000,
            inQty: 10,
            inAmount: 200_000,
          }));
        return {
          productCode: product.skuCode,
          optionCode: '',
          productName: product.name,
          salePrice: 100_000,
          buyPrice: 20_000,
          totalOrderAmount: months.length * 1_000_000,
          totalOrderQty: months.length * 10,
          totalInAmount: months.length * 200_000,
          totalInQty: months.length * 10,
          months,
        };
      }),
    });

    const adAttempt = await advertising.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: `abc-acceptance-advertising-${label}`,
    });
    expect(adAttempt.accounts).toEqual([]);
    await advertising.finalizeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: adAttempt.attemptId,
      attemptToken: adAttempt.attemptToken,
    });

    const [sellpiaCatalog, advertisingCatalog] = await Promise.all([
      sellpia.readGenerationCatalog({ organizationId: TEST_ORGANIZATION_ID, limit: 2 }),
      advertising.readSourceSnapshot({ organizationId: TEST_ORGANIZATION_ID, limit: 2 }),
    ]);
    expect(sellpiaCatalog.latestAttempt).toMatchObject({
      attemptId: sellpiaAttempt.attemptId,
      state: 'COMPLETE',
    });
    expect(advertisingCatalog.latestAttempt).toMatchObject({
      attemptId: adAttempt.attemptId,
      state: 'COMPLETE',
    });
    const sellpiaGeneration = sellpiaCatalog.completeGenerations[0]!;
    const advertisingGeneration = advertisingCatalog.completeGenerations[0]!;
    expect(advertisingGeneration.mappingGeneration)
      .toBe(sellpiaGeneration.mappingGeneration);
    return {
      mappingGeneration: sellpiaGeneration.mappingGeneration,
      sellpiaSourceImportRunId: sellpiaGeneration.sourceImportRunId,
      advertisingSourceImportRunId: advertisingGeneration.sourceImportRunId,
      sellpiaPublicationSequence: sellpiaGeneration.publicationSequence,
      advertisingPublicationSequence: advertisingGeneration.publicationSequence,
      sellpiaCoverage: sellpiaGeneration.coverage,
      advertisingCoverage: {
        from: advertisingGeneration.coverageStartDate,
        to: advertisingGeneration.coveredThrough,
      },
      sellpiaQuality: sellpiaGeneration.quality,
      advertisingSourceType: advertisingGeneration.sourceType,
      advertisingPolicy: advertisingGeneration.frozenRecipePolicy,
      advertisingQuality: advertisingGeneration.qualitySummary,
    };
  }
});

type ProductFixture = Readonly<{
  productId: string;
  optionId: string;
  skuId: string;
  skuCode: string;
  name: string;
}>;

type ProductsFixture = Readonly<{
  normal: ProductFixture;
  insufficient: ProductFixture;
}>;

async function seedFormula(prisma: PrismaClient): Promise<void> {
  const formula = await prisma.masterProductAbcFormulaVersion.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      formulaKey: 'PRODUCT_ABC_ABSOLUTE',
      version: 1,
      formulaJson: JSON.parse(JSON.stringify(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD)),
      formulaChecksum: FORMULA_CHECKSUM,
    },
  });
  await prisma.masterProductAbcFormulaState.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      activeFormulaVersionId: formula.id,
      formulaRevision: 1,
      publicationRevision: 0,
      mappingGeneration: 0n,
    },
  });
}

async function seedProducts(prisma: PrismaClient): Promise<ProductsFixture> {
  const inventoryRun = await prisma.sourceImportRun.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sourceType: 'sellpia_inventory',
      channelAccountId: null,
      fileName: 'abc-acceptance-inventory.json',
      fileHash: 'a'.repeat(64),
      status: 'completed',
      rowCount: 2,
      importedAt: ACCEPTANCE_NOW,
      lastVerifiedAt: ACCEPTANCE_NOW,
      verificationCount: 1,
      freshnessGeneration: 1n,
    },
  });
  await prisma.sellpiaInventoryState.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      requestedGeneration: 1n,
      verifiedGeneration: 1n,
      lastVerifiedAt: ACCEPTANCE_NOW,
      lastCompletedImportRunId: inventoryRun.id,
    },
  });
  const account = await prisma.channelAccount.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      channel: 'rocket',
      name: 'ABC acceptance account',
      externalAccountId: `abc-acceptance-${randomUUID()}`,
      status: 'active',
    },
  });

  const create = async (
    code: string,
    name: string,
    skuCode: string,
    currentStock: number,
  ): Promise<ProductFixture> => {
    const product = await seedSourceProduct(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: skuCode, name, currentStock,
      imageUrls: [`https://fixtures.example.test/${code}.jpg`],
    });
    const sku = product;
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: `${code}-LISTING`,
        status: 'active',
        isActive: true,
        rawJson: {
          source: 'isolated_acceptance_fixture',
          saleStartedAt: '2025-01-01',
          saleStatus: '판매중',
        },
      },
    });
    const option = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        externalOptionId: `${code}-OPTION`,
        status: '판매중',
        isActive: true,
      },
    });
    return {
      productId: product.id,
      optionId: option.id,
      skuId: sku.id,
      skuCode,
      name,
    };
  };

  return {
    normal: await create('ABC-NORMAL', 'ABC normal evidence', 'SP-ABC-NORMAL', 37),
    insufficient: await create(
      'ABC-WITHHELD',
      'ABC insufficient evidence',
      'SP-ABC-WITHHELD',
      19,
    ),
  };
}

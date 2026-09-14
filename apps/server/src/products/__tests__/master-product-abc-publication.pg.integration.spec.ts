import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD, productAbcDisplayStatus } from '@kiditem/shared/product-abc';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import {
  canonicalProviderRowsChecksum,
  ProfitabilityAdImportRepositoryAdapter,
} from '../../advertising/adapter/out/repository/profitability-ad-import.repository.adapter';
import { SellpiaProfitabilitySourceService } from '../../analytics/sellpia-product-sales/sellpia-profitability-source.service';
import { MasterProductProfitabilityReadService } from '../../finance/application/service/master-product-profitability-read.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { MasterProductAbcRepositoryAdapter } from '../adapter/out/repository/master-product-abc.repository.adapter';
import { ProductOperationsDataStatusRepositoryAdapter } from '../adapter/out/repository/product-operations-data-status.repository.adapter';
import { MasterProductAbcService } from '../application/service/master-product-abc.service';
import { ProductAbcReadService } from '../application/service/product-abc-read.service';
import { ProductOperationsDataStatusService } from '../application/service/product-operations-data-status.service';

/**
 * KID-46 — which cutoff ABC may publish is a database question: it depends on
 * which source generations committed, how far their coverage reaches and what
 * the organization already published. These run against real Postgres through
 * the real source owners, so the selected cutoff is the one the rows earn.
 */
describe('MasterProductAbc publication cutoff (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('publishes a source that lags the desired cutoff and records its actual cutoff', async () => {
    const { productId, skuCode } = await seedSellingProduct(prisma);
    await seedFormulaState(prisma);
    const collected = await collectSources(prisma, { skuCode, daysAgo: 6 });
    const desiredCutoff = latestClosedKstDate();

    const result = await abcService(prisma).recalculate({ organizationId: TEST_ORGANIZATION_ID });

    expect(collected.cutoff).not.toEqual(desiredCutoff);
    expect(result).toMatchObject({
      outcome: 'PUBLISHED',
      classifiedProductCount: 1,
      unclassifiedProductCount: 0,
      // The official result is the cutoff the evidence actually reached, not
      // the one Products asked for.
      officialCutoff: collected.cutoff,
    });
    await expect(prisma.masterProductAbcFormulaState.findUniqueOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toMatchObject({
      officialCutoffDate: new Date(`${collected.cutoff}T00:00:00.000Z`),
    });
    await expect(prisma.masterProductAbcEvaluation.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, masterProductId: productId },
    })).resolves.toMatchObject({
      gradeBasisCutoffDate: new Date(`${collected.cutoff}T00:00:00.000Z`),
    });

    // The published view keeps the two apart: the grade's own cutoff, and the
    // desired cutoff the snapshot was asked for.
    const view = await readAbc(prisma, [productId]);
    expect(view.targetCutoff).toEqual(desiredCutoff);
    expect(view.products[0]?.abc).toMatchObject({
      abcGrade: 'A',
      officialCutoffDate: collected.cutoff,
      actualCutoffDate: collected.cutoff,
    });
    expect(productAbcDisplayStatus(view.products[0]!.abc)).toBe('SELLPIA_SOURCE_STALE');
  });

  it.each(['RUNNING', 'FAILED'] as const)(
    'keeps a complete generation publishable under a newer %s collection',
    async (outcome) => {
      const { productId, skuCode } = await seedSellingProduct(prisma);
      await seedFormulaState(prisma);
      const collected = await collectSources(prisma, { skuCode, daysAgo: 6 });
      await startNewerSellpiaAttempt(prisma, outcome);

      const evidence = await profitabilityEvidence(prisma)
        .load({ organizationId: TEST_ORGANIZATION_ID, targetCutoff: latestClosedKstDate() });
      const result = await abcService(prisma).recalculate({ organizationId: TEST_ORGANIZATION_ID });

      // The newer attempt is reported as freshness state, not treated as an
      // admission gate over the complete generation it sits on top of.
      expect(evidence.sources.sellpia).toMatchObject({
        ready: false,
        latestAttempt: { state: outcome === 'RUNNING' ? 'RUNNING' : 'FAILED' },
      });
      expect(result).toMatchObject({
        outcome: 'PUBLISHED',
        classifiedProductCount: 1,
        officialCutoff: collected.cutoff,
      });
      await expect(prisma.masterProduct.findUniqueOrThrow({ where: { id: productId } }))
        .resolves.toMatchObject({ abcGrade: null });
    },
  );

  it('refuses a grade for a hole inside the selected evaluation period', async () => {
    const { productId, skuCode } = await seedSellingProduct(prisma);
    await seedFormulaState(prisma);
    // Collected through the desired cutoff, so nothing but the internal hole
    // can explain the missing grade.
    const collected = await collectSources(prisma, { skuCode, daysAgo: 0, holeMonthsBack: 3 });

    const result = await abcService(prisma).recalculate({ organizationId: TEST_ORGANIZATION_ID });

    // The publication runs — the sources are compatible — but the product with
    // an internal hole earns no grade from the dates that did arrive.
    expect(result).toMatchObject({
      outcome: 'PUBLISHED',
      classifiedProductCount: 0,
      unclassifiedProductCount: 1,
      officialCutoff: collected.cutoff,
    });
    await expect(prisma.masterProduct.findUniqueOrThrow({ where: { id: productId } }))
      .resolves.toMatchObject({ abcGrade: null });
    await expect(prisma.masterProductAbcEvaluation.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(0);

    // The reason is exposed rather than a grade invented.
    const view = await readAbc(prisma, [productId]);
    expect(view.products[0]?.abc).toMatchObject({
      abcGrade: null,
      evaluation: null,
    });
    expect(productAbcDisplayStatus(view.products[0]!.abc)).toBe('INSUFFICIENT_EVIDENCE');
  });
  describe('when the two sources end on different days', () => {
    const recalculateAt = (at: string) => {
      vi.setSystemTime(new Date(at));
      return abcService(prisma).recalculate({ organizationId: TEST_ORGANIZATION_ID });
    };
    // Products' ABC view and Product Operations' data status report the same readiness and display word.
    const expectReadiness = async (
      productId: string,
      ready: { sellpia: boolean; advertising: boolean },
      displayStatus: ReturnType<typeof productAbcDisplayStatus>,
    ) => {
      const view = await readAbc(prisma, [productId]);
      expect(view.products[0]?.abc.sources).toMatchObject({
        sellpia: { ready: ready.sellpia },
        advertising: { ready: ready.advertising },
      });
      expect(productAbcDisplayStatus(view.products[0]!.abc)).toBe(displayStatus);
      await expect(productOperationsDataStatus(prisma).getStatus(TEST_ORGANIZATION_ID, 30)).resolves.toMatchObject({
        sources: { sellpia: { ready: ready.sellpia }, advertising: { ready: ready.advertising } },
      });
    };
    const expectNothingPublished = async () => {
      await expect(prisma.masterProductAbcFormulaState.findUniqueOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID },
      })).resolves.toMatchObject({ publicationRevision: 0, officialCutoffDate: null });
      await expect(prisma.masterProductAbcEvaluation.count({
        where: { organizationId: TEST_ORGANIZATION_ID },
      })).resolves.toBe(0);
    };

    it('publishes at the advertising end with the Sellpia generation that ends on it', async () => {
      const { productId, skuCode } = await seedSellingProduct(prisma);
      await seedFormulaState(prisma);
      vi.useFakeTimers({ toFake: ['Date'] });
      // Noon KST collections: Sellpia through 2026-09-05 and then 2026-09-06, advertising through 2026-09-05.
      const matchingSellpia = await collectAt(prisma, 'sellpia', { skuCode, at: '2026-09-06T03:00:00.000Z' });
      await collectAt(prisma, 'sellpia', { skuCode, at: '2026-09-07T03:00:00.000Z' });
      const advertisingEnd = await collectAt(prisma, 'advertising', { skuCode, at: '2026-09-06T03:00:00.000Z' });
      expect([matchingSellpia, advertisingEnd]).toEqual(['2026-09-05', '2026-09-05']);

      await expect(recalculateAt('2026-09-07T03:00:00.000Z')).resolves.toMatchObject({
        outcome: 'PUBLISHED',
        officialCutoff: '2026-09-05',
        classifiedProductCount: 1,
      });
      await expect(prisma.masterProductAbcEvaluation.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID, masterProductId: productId },
      })).resolves.toMatchObject({
        gradeBasisCutoffDate: new Date('2026-09-05T00:00:00.000Z'),
      });
      // Sellpia reached the closed day; the advertising collection ran before it closed.
      await expectReadiness(productId, { sellpia: true, advertising: false }, 'AD_SOURCE_STALE');
    });

    it('publishes at a held advertising end and reads both sources ready', async () => {
      const { productId, skuCode, advertisedOptionId } = await seedSellingProduct(prisma, { advertised: true });
      await seedFormulaState(prisma);
      vi.useFakeTimers({ toFake: ['Date'] });
      // Sellpia through 2026-09-05 and then 2026-09-06. Advertising at noon on 2026-09-07 sees spend on
      // 2026-09-05 and none yet on 2026-09-06, so it holds the 6th and confirms 2026-09-05.
      await collectAt(prisma, 'sellpia', { skuCode, at: '2026-09-06T03:00:00.000Z' });
      await collectAt(prisma, 'sellpia', { skuCode, at: '2026-09-07T03:00:00.000Z' });
      const heldAdvertising = await collectAt(prisma, 'advertising', {
        skuCode,
        at: '2026-09-07T03:00:00.000Z',
        advertisedOptionId: advertisedOptionId!,
        unreportedDay: '2026-09-06',
      });
      expect(heldAdvertising).toBe('2026-09-05');

      await expect(recalculateAt('2026-09-07T03:00:00.000Z')).resolves.toMatchObject({
        outcome: 'PUBLISHED',
        officialCutoff: '2026-09-05',
        classifiedProductCount: 1,
      });
      // Sellpia reached the closed day and advertising every day Coupang has reported.
      await expectReadiness(productId, { sellpia: true, advertising: true }, 'READY');
    });

    it('refuses without writing when Sellpia runs past the advertising end and no generation ends on it', async () => {
      const { skuCode } = await seedSellingProduct(prisma);
      await seedFormulaState(prisma);
      vi.useFakeTimers({ toFake: ['Date'] });
      await collectAt(prisma, 'sellpia', { skuCode, at: '2026-09-07T03:00:00.000Z' });
      await collectAt(prisma, 'advertising', { skuCode, at: '2026-09-06T03:00:00.000Z' });

      await expect(recalculateAt('2026-09-07T03:00:00.000Z')).resolves.toMatchObject({
        outcome: 'SOURCE_NOT_READY',
        officialCutoff: null,
        sources: { sellpia: { ready: true }, advertising: { ready: false } },
      });
      await expectNothingPublished();
    });

    it('refuses when the only Sellpia generation ending on the advertising end has another mapping generation', async () => {
      const { skuCode } = await seedSellingProduct(prisma);
      await seedFormulaState(prisma);
      vi.useFakeTimers({ toFake: ['Date'] });
      await collectAt(prisma, 'sellpia', { skuCode, at: '2026-09-06T03:00:00.000Z' });
      await prisma.masterProductAbcFormulaState.update({
        where: { organizationId: TEST_ORGANIZATION_ID },
        data: { mappingGeneration: 1n },
      });
      await collectAt(prisma, 'sellpia', { skuCode, at: '2026-09-07T03:00:00.000Z' });
      await collectAt(prisma, 'advertising', { skuCode, at: '2026-09-06T03:00:00.000Z' });

      await expect(recalculateAt('2026-09-07T03:00:00.000Z')).resolves.toMatchObject({
        outcome: 'SOURCE_NOT_READY',
        sources: { advertising: { ready: false } },
      });
      await expectNothingPublished();
    });

    it('no longer publishes an unclassified revision when Sellpia runs past the advertising end', async () => {
      const { skuCode } = await seedSellingProduct(prisma);
      await seedFormulaState(prisma);
      vi.useFakeTimers({ toFake: ['Date'] });
      // The older Sellpia generation ends before the advertising end, so it cannot pair either.
      await collectAt(prisma, 'sellpia', { skuCode, at: '2026-09-04T03:00:00.000Z' });
      await collectAt(prisma, 'sellpia', { skuCode, at: '2026-09-07T03:00:00.000Z' });
      await collectAt(prisma, 'advertising', { skuCode, at: '2026-09-06T03:00:00.000Z' });

      await expect(recalculateAt('2026-09-07T03:00:00.000Z')).resolves.toMatchObject({
        outcome: 'SOURCE_NOT_READY',
      });
      await expectNothingPublished();
    });

    it('publishes an advertised product at the Sellpia end with the advertising generation that ends on it', async () => {
      const { productId, skuCode, advertisedOptionId } = await seedSellingProduct(prisma, { advertised: true });
      await seedFormulaState(prisma);
      vi.useFakeTimers({ toFake: ['Date'] });
      // Every selling product is advertised. Sellpia through 2026-09-05; advertising through 2026-09-05 and then 2026-09-06.
      await collectAt(prisma, 'sellpia', { skuCode, at: '2026-09-06T03:00:00.000Z' });
      const matchingAdvertising = await collectAt(prisma, 'advertising', {
        skuCode,
        at: '2026-09-06T03:00:00.000Z',
        advertisedOptionId: advertisedOptionId!,
      });
      const newerAdvertising = await collectAt(prisma, 'advertising', {
        skuCode,
        at: '2026-09-07T03:00:00.000Z',
        advertisedOptionId: advertisedOptionId!,
      });
      expect([matchingAdvertising, newerAdvertising]).toEqual(['2026-09-05', '2026-09-06']);

      await expect(recalculateAt('2026-09-07T03:00:00.000Z')).resolves.toMatchObject({
        outcome: 'PUBLISHED',
        officialCutoff: '2026-09-05',
        classifiedProductCount: 1,
      });
      await expect(prisma.masterProductAbcEvaluation.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID, masterProductId: productId },
      })).resolves.toMatchObject({
        gradeBasisCutoffDate: new Date('2026-09-05T00:00:00.000Z'),
      });
      // Advertising reached the closed day; Sellpia ran before it closed.
      await expectReadiness(productId, { sellpia: false, advertising: true }, 'SELLPIA_SOURCE_STALE');
    });

    it('refuses without writing when advertising runs past the Sellpia end and no generation ends on it', async () => {
      const { skuCode, advertisedOptionId } = await seedSellingProduct(prisma, { advertised: true });
      await seedFormulaState(prisma);
      vi.useFakeTimers({ toFake: ['Date'] });
      await collectAt(prisma, 'sellpia', { skuCode, at: '2026-09-06T03:00:00.000Z' });
      await collectAt(prisma, 'advertising', {
        skuCode,
        at: '2026-09-07T03:00:00.000Z',
        advertisedOptionId: advertisedOptionId!,
      });

      await expect(recalculateAt('2026-09-07T03:00:00.000Z')).resolves.toMatchObject({
        outcome: 'SOURCE_NOT_READY',
        officialCutoff: null,
        sources: { sellpia: { ready: false }, advertising: { ready: true } },
      });
      await expectNothingPublished();
    });
  });
});

function abcService(prisma: PrismaClient): MasterProductAbcService {
  return new MasterProductAbcService(
    new MasterProductAbcRepositoryAdapter(prisma as never),
    profitabilityEvidence(prisma),
  );
}

function readAbc(prisma: PrismaClient, masterProductIds: readonly string[]) {
  return new ProductAbcReadService(
    new MasterProductAbcRepositoryAdapter(prisma as never),
    profitabilityEvidence(prisma),
  ).readAbc({ organizationId: TEST_ORGANIZATION_ID, masterProductIds });
}

function productOperationsDataStatus(prisma: PrismaClient): ProductOperationsDataStatusService {
  return new ProductOperationsDataStatusService(
    new ProductOperationsDataStatusRepositoryAdapter(prisma as never, profitabilityEvidence(prisma)),
  );
}

function profitabilityEvidence(prisma: PrismaClient): MasterProductProfitabilityReadService {
  const alerts = new SourceFailureAlerts(prisma as never);
  return new MasterProductProfitabilityReadService(
    new SellpiaProfitabilitySourceService(prisma as never, alerts),
    new ProfitabilityAdImportRepositoryAdapter(prisma as never, alerts),
    prisma as never,
  );
}

async function seedFormulaState(prisma: PrismaClient): Promise<string> {
  const version = await prisma.masterProductAbcFormulaVersion.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      formulaKey: 'PRODUCT_ABC_ABSOLUTE',
      version: 1,
      formulaJson: JSON.parse(JSON.stringify(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD)),
      formulaChecksum: '230d35436ffd2fd42bf4eb4ea3f0c99bd7474dcf5b7cf11f6ed235aff84cc64f',
    },
  });
  await prisma.masterProductAbcFormulaState.upsert({
    where: { organizationId: TEST_ORGANIZATION_ID },
    create: {
      organizationId: TEST_ORGANIZATION_ID,
      activeFormulaVersionId: version.id,
      formulaRevision: 1,
      publicationRevision: 0,
      mappingGeneration: 0n,
    },
    update: {
      activeFormulaVersionId: version.id,
      formulaRevision: 1,
    },
  });
  return version.id;
}

async function seedSellingProduct(
  prisma: PrismaClient,
  options: { advertised?: boolean } = {},
): Promise<{ productId: string; skuCode: string; advertisedOptionId: string | null }> {
  const product = await prisma.masterProduct.create({
    data: { organizationId: TEST_ORGANIZATION_ID, code: `ABC-${randomUUID()}`, name: 'ABC product' },
  });
  const account = await prisma.channelAccount.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      channel: 'rocket',
      name: 'ABC account',
      externalAccountId: `abc-account-${randomUUID()}`,
      vendorId: `abc-vendor-${randomUUID()}`,
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
      rawJson: { source: 'wing_app_data', saleStartedAt: daysBefore(latestClosedKstDate(), 500) },
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
      fileName: 'abc-publication-inventory.json',
      fileHash: randomUUID(),
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
  if (!options.advertised) return { productId: product.id, skuCode, advertisedOptionId: null };
  // The same product also sells on a Coupang listing that advertises.
  const adAccount = await prisma.channelAccount.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      channel: 'coupang',
      name: 'ABC advertising account',
      externalAccountId: `abc-ad-account-${randomUUID()}`,
      vendorId: `abc-ad-vendor-${randomUUID()}`,
      status: 'active',
    },
  });
  const adListing = await prisma.channelListing.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: adAccount.id,
      masterProductId: product.id,
      externalId: `AD-LISTING-${randomUUID()}`,
      status: 'active',
      rawJson: { source: 'wing_app_data', saleStartedAt: daysBefore(latestClosedKstDate(), 500) },
    },
  });
  const advertisedOptionId = `AD-OPTION-${randomUUID()}`;
  const adOption = await prisma.channelListingOption.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      listingId: adListing.id,
      externalOptionId: advertisedOptionId,
      status: '판매중',
    },
  });
  await prisma.channelListingOptionInventoryComponent.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      channelListingOptionId: adOption.id,
      sellpiaInventorySkuId: sku.id,
      quantity: 1,
    },
  });
  return { productId: product.id, skuCode, advertisedOptionId };
}

/**
 * Runs one real Sellpia and one real advertising collection as of `daysAgo`
 * days ago, so the committed generations carry a coverage window that stops
 * before the latest closed day. `holeMonthsBack` omits one month from the
 * Sellpia submission, leaving an internal hole in an otherwise complete
 * evaluation period.
 */
async function collectSources(
  prisma: PrismaClient,
  options: { skuCode: string; daysAgo: number; holeMonthsBack?: number },
): Promise<{ cutoff: string }> {
  const alerts = new SourceFailureAlerts(prisma as never);
  const sellpia = new SellpiaProfitabilitySourceService(prisma as never, alerts);
  const advertising = new ProfitabilityAdImportRepositoryAdapter(prisma as never, alerts);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.now() - options.daysAgo * 86_400_000));
  try {
    const attempt = await sellpia.beginAttempt(TEST_ORGANIZATION_ID, `abc-${randomUUID()}`);
    const hole = options.holeMonthsBack === undefined
      ? null
      : monthsBefore(attempt.plan.to.slice(0, 7), options.holeMonthsBack);
    const months = attempt.plan.coveredMonths
      .filter((yearMonth) => yearMonth !== hole)
      .map((yearMonth) => ({
        yearMonth,
        orderQty: 10,
        orderAmount: 1_000_000,
        inQty: 10,
        inAmount: 200_000,
      }));
    await sellpia.submitAttempt(TEST_ORGANIZATION_ID, attempt.attemptId, {
      attemptToken: attempt.attemptToken,
      parserVersion: 'sellpia-profitability-v2',
      providerBackedEmptyProof: true,
      coveredMonths: attempt.plan.coveredMonths,
      provenance: {
        source: 'sellpia_stat_prd_profit',
        costBasis: 'ORDER_TIME_SUPPLY_COST',
        vatIncluded: true,
      },
      products: [{
        productCode: options.skuCode,
        optionCode: '',
        productName: 'ABC product',
        salePrice: 100_000,
        buyPrice: 20_000,
        totalOrderAmount: months.length * 1_000_000,
        totalOrderQty: months.length * 10,
        totalInAmount: months.length * 200_000,
        totalInQty: months.length * 10,
        months,
      }],
    });

    // This Rocket-only selling fixture has no retained Coupang advertising
    // account, so an empty COMPLETE generation is genuine NOT_APPLIED proof.
    const adAttempt = await advertising.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: `abc-ad-${randomUUID()}`,
    });
    await advertising.finalizeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: adAttempt.attemptId,
      attemptToken: adAttempt.attemptToken,
    });
    return { cutoff: attempt.plan.to };
  } finally {
    vi.useRealTimers();
  }
}

/**
 * One real `source` collection as of the fixed instant `at`, returning the
 * business date its coverage ends on. The caller owns the fake clock.
 * `unreportedDay` is a day Coupang has not reported yet: the advertised
 * option's spend on it shows on the day before, inside the same slice.
 */
async function collectAt(
  prisma: PrismaClient,
  source: 'sellpia' | 'advertising',
  options: { skuCode: string; at: string; advertisedOptionId?: string; unreportedDay?: string },
): Promise<string> {
  const alerts = new SourceFailureAlerts(prisma as never);
  vi.setSystemTime(new Date(options.at));
  if (source === 'advertising') {
    // A Rocket-only fixture has no retained Coupang account, so its plan is empty.
    const advertising = new ProfitabilityAdImportRepositoryAdapter(prisma as never, alerts);
    const attempt = await advertising.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: `abc-ad-${randomUUID()}`,
    });
    // The advertised option spends on every slice's last day, so the closed day is reported.
    let sequence = 0;
    for (const account of attempt.accounts) {
      for (const slice of account.slices) {
        const spendDate = slice.businessDates.at(-1) === options.unreportedDay
          ? slice.businessDates.at(-2)
          : slice.businessDates.at(-1);
        const rows = options.advertisedOptionId && spendDate
          ? [{
            businessDate: spendDate,
            externalOptionId: options.advertisedOptionId,
            adSpend: 7,
            impressions: 10,
            clicks: 2,
            orders: 1,
            conversions: 1,
            adRevenue: 70,
          }]
          : [];
        await advertising.uploadSlice({
          organizationId: TEST_ORGANIZATION_ID,
          attemptId: attempt.attemptId,
          attemptToken: attempt.attemptToken,
          sliceId: slice.sliceId,
          sequence: sequence++,
          checksum: canonicalProviderRowsChecksum(rows),
          providerAdvertiserId: account.expectedAdvertiserId,
          reportId: `REPORT-${slice.sliceId}-${randomUUID()}`,
          campaignCount: rows.length,
          expectedRowCount: rows.length,
          collectedRowCount: rows.length,
          responseBytes: rows.length === 0 ? 1 : 128,
          rows,
        });
      }
    }
    const status = await advertising.finalizeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
    });
    return status.latestComplete!.coveredThrough;
  }
  const sellpia = new SellpiaProfitabilitySourceService(prisma as never, alerts);
  const attempt = await sellpia.beginAttempt(TEST_ORGANIZATION_ID, `abc-${randomUUID()}`);
  const months = attempt.plan.coveredMonths.map((yearMonth) => ({
    yearMonth,
    orderQty: 10,
    orderAmount: 1_000_000,
    inQty: 10,
    inAmount: 200_000,
  }));
  await sellpia.submitAttempt(TEST_ORGANIZATION_ID, attempt.attemptId, {
    attemptToken: attempt.attemptToken,
    parserVersion: 'sellpia-profitability-v2',
    providerBackedEmptyProof: true,
    coveredMonths: attempt.plan.coveredMonths,
    provenance: {
      source: 'sellpia_stat_prd_profit',
      costBasis: 'ORDER_TIME_SUPPLY_COST',
      vatIncluded: true,
    },
    products: [{
      productCode: options.skuCode,
      optionCode: '',
      productName: 'ABC product',
      salePrice: 100_000,
      buyPrice: 20_000,
      totalOrderAmount: months.length * 1_000_000,
      totalOrderQty: months.length * 10,
      totalInAmount: months.length * 200_000,
      totalInQty: months.length * 10,
      months,
    }],
  });
  return attempt.plan.to;
}

/**
 * A newer Sellpia attempt through the real source owner, left RUNNING or
 * terminalized as FAILED. Either way it publishes no generation.
 */
async function startNewerSellpiaAttempt(
  prisma: PrismaClient,
  outcome: 'RUNNING' | 'FAILED',
): Promise<void> {
  const sellpia = new SellpiaProfitabilitySourceService(
    prisma as never,
    new SourceFailureAlerts(prisma as never),
  );
  const attempt = await sellpia.beginAttempt(TEST_ORGANIZATION_ID, `abc-newer-${randomUUID()}`);
  if (outcome === 'FAILED') {
    await sellpia.failAttempt(TEST_ORGANIZATION_ID, attempt.attemptId, {
      attemptToken: attempt.attemptToken,
      errorCode: 'COLLECTION_FAILED',
      errorMessage: 'provider page never loaded',
    });
  }
}

function latestClosedKstDate(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1_000);
  return new Date(Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate() - 1,
  )).toISOString().slice(0, 10);
}

function daysBefore(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00.000Z`).getTime() - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function monthsBefore(yearMonth: string, months: number): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1 - months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

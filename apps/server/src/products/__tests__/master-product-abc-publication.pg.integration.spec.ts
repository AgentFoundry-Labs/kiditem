import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD, productAbcDisplayStatus } from '@kiditem/shared/product-abc';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { ProfitabilityAdImportRepositoryAdapter } from '../../advertising/adapter/out/repository/profitability-ad-import.repository.adapter';
import { SellpiaProfitabilitySourceService } from '../../analytics/sellpia-product-sales/sellpia-profitability-source.service';
import { MasterProductProfitabilityReadService } from '../../finance/application/service/master-product-profitability-read.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { MasterProductAbcRepositoryAdapter } from '../adapter/out/repository/master-product-abc.repository.adapter';
import { MasterProductAbcService } from '../application/service/master-product-abc.service';
import { ProductAbcReadService } from '../application/service/product-abc-read.service';

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
): Promise<{ productId: string; skuCode: string }> {
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
  return { productId: product.id, skuCode };
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

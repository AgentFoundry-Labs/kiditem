import { seedSourceProduct } from '../../test-helpers/inventory-seeds';
import { ProductTransactionalReadRepositoryAdapter } from '../adapter/out/persistence/product-transactional-read.repository.adapter';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD,
  PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD_HASH,
  productAbcDisplayStatus,
} from '@kiditem/shared/product-abc';
import { SellpiaProfitabilitySourceService } from '../../analytics/sellpia-product-sales/sellpia-profitability-source.service';
import { publishSellpiaProfitability, seedSellpiaProfitabilityOperation } from '../../test-helpers/__tests__/sellpia-profitability-operation';
import { MasterProductProfitabilityReadService } from '../../finance/application/service/master-product-profitability-read.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { MasterProductAbcRepositoryAdapter } from '../adapter/out/persistence/master-product-abc.repository.adapter';
import { ProductOperationsDataStatusRepositoryAdapter } from '../adapter/out/persistence/product-operations-data-status.repository.adapter';
import { RecalculateProductAbcUseCase } from '../application/service/recalculate-product-abc.usecase';
import { ProductAbcReadUseCase } from '../application/service/product-abc-read.usecase';
import { ProductDataStatusUseCase } from '../application/service/product-data-status.usecase';
import { channelFactTestPorts } from '../../test-helpers/channel-fact-ports';

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
  // ABC grades on Sellpia alone (KID-373): the newest Sellpia generation publishes on its own end.
  it('publishes at the Sellpia end and reports only the Sellpia source', async () => {
    const { productId, skuCode } = await seedSellingProduct(prisma);
    await seedFormulaState(prisma);
    vi.useFakeTimers({ toFake: ['Date'] });
    // Noon KST on 2026-09-07: Sellpia reaches the closed day 2026-09-06.
    const sellpiaEnd = await collectAt(prisma, { skuCode, at: '2026-09-07T03:00:00.000Z' });
    expect(sellpiaEnd).toBe('2026-09-06');

    await expect(abcService(prisma).recalculate({ organizationId: TEST_ORGANIZATION_ID })).resolves.toMatchObject({
      outcome: 'PUBLISHED',
      officialCutoff: '2026-09-06',
      sources: { sellpia: { ready: true, actualCutoff: '2026-09-06' } },
    });
    const view = await readAbc(prisma, [productId]);
    expect(view.products[0]?.abc.sources).toMatchObject({ sellpia: { ready: true } });
    expect(view.products[0]?.abc.sources).not.toHaveProperty('advertising');
    expect(productAbcDisplayStatus(view.products[0]!.abc)).toBe('READY');
    const status = await productOperationsDataStatus(prisma).getStatus(TEST_ORGANIZATION_ID, 30);
    expect(status.sources).toMatchObject({ sellpia: { ready: true } });
    expect(status.sources).not.toHaveProperty('advertising');
  });
});

function abcService(prisma: PrismaClient): RecalculateProductAbcUseCase {
  return new RecalculateProductAbcUseCase(
    new MasterProductAbcRepositoryAdapter(
      prisma as never,
      new ProductTransactionalReadRepositoryAdapter(),
      channelFactTestPorts(prisma as never).listings,
    ),
    profitabilityEvidence(prisma),
  );
}

function readAbc(prisma: PrismaClient, masterProductIds: readonly string[]) {
  return new ProductAbcReadUseCase(
    new MasterProductAbcRepositoryAdapter(
      prisma as never,
      new ProductTransactionalReadRepositoryAdapter(),
      channelFactTestPorts(prisma as never).listings,
    ),
    profitabilityEvidence(prisma),
  ).readAbc({ organizationId: TEST_ORGANIZATION_ID, masterProductIds });
}

function productOperationsDataStatus(prisma: PrismaClient): ProductDataStatusUseCase {
  return new ProductDataStatusUseCase(
    new ProductOperationsDataStatusRepositoryAdapter(
      prisma as never,
      profitabilityEvidence(prisma),
      new ProductTransactionalReadRepositoryAdapter(),
      channelFactTestPorts(prisma as never).accounts,
      channelFactTestPorts(prisma as never).listings,
    ),
  );
}

function profitabilityEvidence(prisma: PrismaClient): MasterProductProfitabilityReadService {
  return new MasterProductProfitabilityReadService(
    new SellpiaProfitabilitySourceService(prisma as never),
    prisma as never,
   new ProductTransactionalReadRepositoryAdapter());
}

async function seedFormulaState(prisma: PrismaClient): Promise<string> {
  const version = await prisma.masterProductAbcFormulaVersion.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      formulaKey: 'PRODUCT_ABC_ABSOLUTE',
      version: 1,
      formulaJson: JSON.parse(JSON.stringify(PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD)),
      formulaChecksum: PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD_HASH,
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

/**
 * Every seeded listing's sale start, fixed rather than counted back from the
 * real date. Tests that fake the clock after seeding evaluate cutoffs in
 * 2026-09, and a start derived from a later real date would leave the product
 * under the 30-day minimum sale age there. It precedes every evaluation window
 * these tests reach.
 */
const SALE_STARTED_AT = '2025-01-01';

async function seedSellingProduct(
  prisma: PrismaClient,
): Promise<{ productId: string; skuCode: string }> {
  const skuCode = `SKU-${randomUUID()}`;
  const product = await seedSourceProduct(prisma, {
    organizationId: TEST_ORGANIZATION_ID, code: skuCode, name: 'ABC product', currentStock: 10,
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
      externalId: `LISTING-${randomUUID()}`,
      status: 'active',
      rawJson: { source: 'wing_app_data', saleStartedAt: SALE_STARTED_AT },
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
      lastCompletedOperationId: inventoryRun.id,
    },
    update: {
      requestedGeneration: 1n,
      verifiedGeneration: 1n,
      lastVerifiedAt: inventoryVerifiedAt,
      lastCompletedOperationId: inventoryRun.id,
    },
  });
  const sku = product;
  await prisma.channelListingOptionInventoryComponent.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      channelListingOptionId: option.id,
      masterProductId: sku.id,
      quantity: 1,
    },
  });
  return { productId: product.id, skuCode };
}

/**
 * Runs one real Sellpia collection as of `daysAgo` days ago, so the committed generations carry a coverage window that stops
 * before the latest closed day. `holeMonthsBack` omits one month from the
 * Sellpia submission, leaving an internal hole in an otherwise complete
 * evaluation period.
 */
async function collectSources(
  prisma: PrismaClient,
  options: { skuCode: string; daysAgo: number; holeMonthsBack?: number },
): Promise<{ cutoff: string }> {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.now() - options.daysAgo * 86_400_000));
  try {
    const { plan } = await publishSellpiaProfitability(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      products: (planned) => {
        const hole = options.holeMonthsBack === undefined
          ? null
          : monthsBefore(planned.to.slice(0, 7), options.holeMonthsBack);
        return [abcProduct(options.skuCode, planned.coveredMonths.filter((yearMonth) => yearMonth !== hole))];
      },
    });
    return { cutoff: plan.to };
  } finally {
    vi.useRealTimers();
  }
}

/**
 * One real Sellpia collection as of the fixed instant `at`, returning the
 * business date its coverage ends on. The caller owns the fake clock.
 */
async function collectAt(
  prisma: PrismaClient,
  options: { skuCode: string; at: string },
): Promise<string> {
  vi.setSystemTime(new Date(options.at));
  const { plan } = await publishSellpiaProfitability(prisma, {
    organizationId: TEST_ORGANIZATION_ID,
    products: (planned) => [abcProduct(options.skuCode, planned.coveredMonths)],
  });
  return plan.to;
}

/**
 * A newer Sellpia attempt through the real source owner, left RUNNING or
 * terminalized as FAILED. Either way it publishes no generation.
 */
async function startNewerSellpiaAttempt(
  prisma: PrismaClient,
  outcome: 'RUNNING' | 'FAILED',
): Promise<void> {
  // 끝나지 않았거나 실패한 더 새 실행 — 어느 쪽이든 세대를 발행하지 않는다.
  await seedSellpiaProfitabilityOperation(prisma, {
    organizationId: TEST_ORGANIZATION_ID,
    status: outcome === 'RUNNING' ? 'executing' : 'failed',
  });
}

/** 셀피아 상품 손익 제출 상품 하나 — 덮은 달마다 같은 판매·매입 사실. */
function abcProduct(skuCode: string, coveredMonths: readonly string[]) {
  const months = coveredMonths.map((yearMonth) => ({
    yearMonth,
    orderQty: 10,
    orderAmount: 1_000_000,
    inQty: 10,
    inAmount: 200_000,
  }));
  return {
    productCode: skuCode,
    optionCode: '',
    productName: 'ABC product',
    salePrice: 100_000,
    buyPrice: 20_000,
    totalOrderAmount: months.length * 1_000_000,
    totalOrderQty: months.length * 10,
    totalInAmount: months.length * 200_000,
    totalInQty: months.length * 10,
    months,
  };
}

function latestClosedKstDate(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1_000);
  return new Date(Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate() - 1,
  )).toISOString().slice(0, 10);
}

function monthsBefore(yearMonth: string, months: number): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1 - months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

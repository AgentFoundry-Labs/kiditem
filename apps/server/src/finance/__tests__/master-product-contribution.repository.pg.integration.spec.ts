import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { productAbcContributionMetricStatus } from '@kiditem/shared/product-abc';
import { MasterProductContributionRepositoryAdapter } from '../adapter/out/persistence/master-product-contribution.repository';
import { ProductTransactionalReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-transactional-read.repository';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { seedSellpiaProfitabilityOperation } from '../../test-helpers/__tests__/sellpia-profitability-operation';
import { seedSourceProduct } from '../../test-helpers/inventory-seeds';
import { seedAdProductDays, seedAdReportRun } from '../../test-helpers/ad-ledger-seeds';
import { advertisingLedgerTestReader } from '../../test-helpers/channel-fact-ports';
import type { PrismaClient } from '@prisma/client';

const BASIS_FROM = '2026-07-01';
const BASIS_CUTOFF = '2026-07-31';
const COVERAGE_START = new Date(`${BASIS_FROM}T00:00:00.000Z`);
const COVERAGE_END = new Date(`${BASIS_CUTOFF}T00:00:00.000Z`);

type Sources = Awaited<ReturnType<typeof seedCompleteSources>>;

describe('MasterProductContributionRepositoryAdapter (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let repository: MasterProductContributionRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new MasterProductContributionRepositoryAdapter(
      prisma as never,
      new ProductTransactionalReadRepositoryAdapter(),
      advertisingLedgerTestReader(prisma as never),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('ignores grade, includes stopped and new products, and filters only after global windows', async () => {
    const sources = await seedCompleteSources(prisma, TEST_ORGANIZATION_ID);
    const active = await seedProductFact(prisma, sources, {
      code: 'ACTIVE', isActive: true, revenue: 100, cost: 20, adSpend: 10,
    });
    const stopped = await seedProductFact(prisma, sources, {
      code: 'STOPPED', isActive: false, revenue: 100, cost: 20, adSpend: 10,
    });
    const newProduct = await seedProductFact(prisma, sources, {
      code: 'NEW', isActive: true, revenue: 200, cost: 150, adSpend: 0,
    });
    await seedProductFact(prisma, sources, {
      code: 'LOSS', isActive: true, revenue: 50, cost: 170, adSpend: 30,
    });
    await seedForeignScenario(prisma);

    const filtered = await repository.readContribution({
      ...input(sources),
      masterProductIds: [active],
    });

    expect(filtered.products).toHaveLength(1);
    expect(filtered.products[0]).toMatchObject({
      masterProductId: active,
      revenue: 100,
      // 100 − 20 − 11 (10 billed ad spend × 1.1, KID-368).
      operatingProfit: 69,
      salesRank: 2,
      positiveOperatingProfitRank: 1,
    });
    expect(filtered.products[0]?.salesContribution).toBeCloseTo(100 / 450);
    expect(filtered.products[0]?.cumulativeSalesContribution).toBeCloseTo(400 / 450);
    expect(filtered.products[0]?.cumulativePositiveOperatingProfitContribution)
      .toBeCloseTo(138 / 188);
    expect(filtered.metrics.sales).toMatchObject({
      sourceComplete: true,
      includedProductCount: 4,
      excludedProductCount: 0,
      denominator: 450,
    });
    expect(productAbcContributionMetricStatus(filtered.metrics.sales)).toBe('READY');
    expect(filtered.totals).toEqual({
      revenue: 450,
      positiveOperatingProfit: 188,
      lossMagnitude: 153,
      netOperatingProfit: 35,
    });

    const allProducts = await repository.readContribution(input(sources));
    expect(allProducts.products.map((product) => product.masterProductId)).toEqual(
      expect.arrayContaining([active, stopped, newProduct]),
    );
    expect(allProducts.products).toHaveLength(4);
  });

  it('uses independent positive-profit and loss denominators and preserves signed net profit', async () => {
    const sources = await seedCompleteSources(prisma, TEST_ORGANIZATION_ID);
    const profitableA = await seedProductFact(prisma, sources, {
      code: 'PROFIT-A', revenue: 100, cost: 20, adSpend: 10,
    });
    const profitableB = await seedProductFact(prisma, sources, {
      code: 'PROFIT-B', revenue: 100, cost: 20, adSpend: 10,
    });
    const lossy = await seedProductFact(prisma, sources, {
      code: 'LOSS', revenue: 50, cost: 170, adSpend: 30,
    });

    const result = await repository.readContribution(input(sources));

    expect(result.metrics.positiveOperatingProfit.denominator).toBe(138);
    expect(result.metrics.loss.denominator).toBe(153);
    expect(result.totals.netOperatingProfit).toBe(-15);
    expect(sum(result.products, 'positiveOperatingProfitContribution')).toBeCloseTo(1);
    expect(sum(result.products, 'lossImpact')).toBeCloseTo(1);
    const firstProfit = result.products.find((product) => product.masterProductId === profitableA)!;
    const tiedProfit = result.products.find((product) => product.masterProductId === profitableB)!;
    expect(firstProfit.positiveOperatingProfitRank).toBe(1);
    expect(tiedProfit.positiveOperatingProfitRank).toBe(1);
    expect(firstProfit.cumulativePositiveOperatingProfitContribution).toBe(1);
    expect(tiedProfit.cumulativePositiveOperatingProfitContribution).toBe(1);
    expect(result.products.find((product) => product.masterProductId === lossy)).toMatchObject({
      positiveOperatingProfitContribution: 0,
      positiveOperatingProfitRank: null,
      cumulativePositiveOperatingProfitContribution: null,
      lossImpact: 1,
      lossRank: 1,
    });
    expect(firstProfit).toMatchObject({
      lossImpact: 0,
      lossRank: null,
      cumulativeLossImpact: null,
    });
  });

  it('returns null shares and ranks for a zero denominator', async () => {
    const sources = await seedCompleteSources(prisma, TEST_ORGANIZATION_ID);
    await seedProductFact(prisma, sources, {
      code: 'ZERO', revenue: 0, cost: 0, adSpend: 0,
    });

    const result = await repository.readContribution(input(sources));

    expect(result.metrics.sales).toMatchObject({ sourceComplete: true, denominator: null });
    expect(result.metrics.positiveOperatingProfit).toMatchObject({
      sourceComplete: true, denominator: null,
    });
    expect(result.metrics.loss).toMatchObject({ sourceComplete: true, denominator: null });
    expect(productAbcContributionMetricStatus(result.metrics.sales)).toBe('NO_DENOMINATOR');
    expect(productAbcContributionMetricStatus(result.metrics.positiveOperatingProfit))
      .toBe('NO_DENOMINATOR');
    expect(productAbcContributionMetricStatus(result.metrics.loss)).toBe('NO_DENOMINATOR');
    expect(result.products[0]).toMatchObject({
      revenue: 0,
      operatingProfit: 0,
      salesContribution: null,
      positiveOperatingProfitContribution: null,
      lossImpact: null,
      salesRank: null,
      positiveOperatingProfitRank: null,
      lossRank: null,
    });
  });

  it('keeps sales complete while a day of the basis has no measured ad report', async () => {
    const sources = await seedCompleteSources(prisma, TEST_ORGANIZATION_ID, { adReportEnd: '2026-07-30' });
    await seedProductFact(prisma, sources, {
      code: 'SALES-ONLY', revenue: 100, cost: 20, adSpend: 10,
    });

    const result = await repository.readContribution(input(sources));

    expect(result.metrics.sales).toMatchObject({ sourceComplete: true, denominator: 100 });
    expect(productAbcContributionMetricStatus(result.metrics.sales)).toBe('READY');
    expect(result.metrics.positiveOperatingProfit).toMatchObject({
      sourceComplete: false, includedProductCount: 0, excludedProductCount: 1,
    });
    expect(productAbcContributionMetricStatus(result.metrics.positiveOperatingProfit))
      .toBe('SOURCE_INCOMPLETE');
    expect(result.products[0]).toMatchObject({
      revenue: 100,
      operatingProfit: null,
      metricCompleteness: { sales: true, operatingProfit: false },
    });
  });

  it('reads advertising as not applied when the organization has no active Coupang account', async () => {
    const sources = await seedCompleteSources(prisma, TEST_ORGANIZATION_ID, { adReportEnd: null });
    await seedProductFact(prisma, sources, {
      code: 'NO-ADS', revenue: 100, cost: 20, adSpend: 0,
    });
    await prisma.channelAccount.updateMany({
      where: { organizationId: TEST_ORGANIZATION_ID, channel: 'coupang' },
      data: { status: 'inactive' },
    });

    const result = await repository.readContribution(input(sources));

    expect(productAbcContributionMetricStatus(result.metrics.positiveOperatingProfit)).toBe('READY');
    expect(result.products[0]).toMatchObject({
      operatingProfit: 80,
      metricCompleteness: { sales: true, operatingProfit: true },
    });
  });

  it('does not treat a monthly fact crossing the requested date basis as exact actuals', async () => {
    const sources = await seedCompleteSources(prisma, TEST_ORGANIZATION_ID);
    await seedProductFact(prisma, sources, {
      code: 'PARTIAL-BASIS', revenue: 100, cost: 20, adSpend: 10,
    });

    const result = await repository.readContribution({
      ...input(sources),
      basisFromDate: '2026-07-15',
    });

    expect(productAbcContributionMetricStatus(result.metrics.sales))
      .toBe('SOURCE_INCOMPLETE');
    expect(productAbcContributionMetricStatus(result.metrics.positiveOperatingProfit))
      .toBe('SOURCE_INCOMPLETE');
    expect(result.products[0]).toMatchObject({
      revenue: null,
      operatingProfit: null,
      metricCompleteness: { sales: false, operatingProfit: false },
    });
  });

  it('excludes malformed cost evidence only from profit and loss metrics', async () => {
    const sources = await seedCompleteSources(prisma, TEST_ORGANIZATION_ID);
    await seedProductFact(prisma, sources, {
      code: 'VALID', revenue: 100, cost: 20, adSpend: 10,
    });
    const invalid = await seedProductFact(prisma, sources, {
      code: 'INVALID-COST', revenue: 40, cost: 10, adSpend: 0,
      costBasis: 'UNKNOWN', vatIncluded: null,
    });

    const result = await repository.readContribution(input(sources));

    expect(result.metrics.sales).toMatchObject({
      sourceComplete: true,
      includedProductCount: 2,
      excludedProductCount: 0,
      denominator: 140,
    });
    expect(result.metrics.positiveOperatingProfit).toMatchObject({
      sourceComplete: true,
      includedProductCount: 1,
      excludedProductCount: 1,
      denominator: 69,
    });
    expect(productAbcContributionMetricStatus(result.metrics.positiveOperatingProfit))
      .toBe('SOURCE_INCOMPLETE');
    expect(result.products.find((product) => product.masterProductId === invalid)).toMatchObject({
      revenue: 40,
      operatingProfit: null,
      positiveOperatingProfitContribution: null,
      lossImpact: null,
      metricCompleteness: { sales: true, operatingProfit: false },
    });
  });

  it('counts measured advertising cost as loss when the complete Sellpia manifest proves zero sales', async () => {
    const sources = await seedCompleteSources(prisma, TEST_ORGANIZATION_ID);
    await seedProductFact(prisma, sources, {
      code: 'AD-ONLY', revenue: 0, cost: 0, adSpend: 30, omitSellpia: true,
    });

    const result = await repository.readContribution(input(sources));

    expect(result.totals).toEqual({
      revenue: 0,
      positiveOperatingProfit: 0,
      lossMagnitude: 33,
      netOperatingProfit: -33,
    });
    expect(result.products[0]).toMatchObject({
      revenue: 0,
      operatingProfit: -33,
      lossImpact: 1,
      metricCompleteness: { sales: true, operatingProfit: true },
    });
  });

  it('reports positive-only and loss-only populations on independent axes', async () => {
    const positiveSources = await seedCompleteSources(prisma, OTHER_ORGANIZATION_ID);
    await seedProductFact(prisma, positiveSources, {
      code: 'PROFIT-ONLY', revenue: 100, cost: 20, adSpend: 10,
    });
    const positiveOnly = await repository.readContribution(input(positiveSources));

    expect(positiveOnly.metrics.positiveOperatingProfit).toMatchObject({
      sourceComplete: true, denominator: 69,
    });
    expect(productAbcContributionMetricStatus(positiveOnly.metrics.positiveOperatingProfit))
      .toBe('READY');
    expect(productAbcContributionMetricStatus(positiveOnly.metrics.loss))
      .toBe('NO_DENOMINATOR');
    expect(positiveOnly.totals.netOperatingProfit).toBe(69);

    const lossSources = await seedCompleteSources(prisma, TEST_ORGANIZATION_ID);
    await seedProductFact(prisma, lossSources, {
      code: 'LOSS-ONLY', revenue: 10, cost: 20, adSpend: 5,
    });

    const lossOnly = await repository.readContribution(input(lossSources));

    expect(productAbcContributionMetricStatus(lossOnly.metrics.positiveOperatingProfit))
      .toBe('NO_DENOMINATOR');
    // 10 − 20 − 6 (5 billed × 1.1 = 5.5, rounded once per product).
    expect(lossOnly.metrics.loss).toMatchObject({ sourceComplete: true, denominator: 16 });
    expect(productAbcContributionMetricStatus(lossOnly.metrics.loss)).toBe('READY');
    expect(lossOnly.totals.netOperatingProfit).toBe(-16);
  });
});

function input(sources: Sources) {
  return {
    organizationId: sources.organizationId,
    basisFromDate: BASIS_FROM,
    basisCutoffDate: BASIS_CUTOFF,
    sellpiaOperationId: sources.sellpiaOperationId,
  } as const;
}

function sum(
  rows: readonly Record<string, number | string | boolean | null | object>[],
  field: 'positiveOperatingProfitContribution' | 'lossImpact',
): number {
  return rows.reduce((total, row) => total + Number(row[field] ?? 0), 0);
}

/**
 * Sellpia's July generation and the organization's Coupang account, whose ad
 * report measured July through `adReportEnd` (`null`: no report at all).
 */
async function seedCompleteSources(
  prisma: PrismaClient,
  organizationId: string,
  options: { adReportEnd?: string | null } = {},
) {
  // 셀피아 상품 손익 세대 = 성공한 실행(KID-361 J3). 월 사실은 이 실행 id로 넣는다.
  const sellpia = await seedSellpiaProfitabilityOperation(prisma, {
    organizationId,
    from: COVERAGE_START.toISOString().slice(0, 10),
    to: COVERAGE_END.toISOString().slice(0, 10),
    mappingGeneration: 7n,
    finishedAt: new Date('2026-08-01T00:00:00.000Z'),
  });
  const account = await prisma.channelAccount.create({
    data: {
      organizationId,
      channel: 'coupang',
      name: 'Contribution test account',
      externalAccountId: `contribution-${organizationId}`,
    },
  });
  const adReportEnd = options.adReportEnd === undefined ? BASIS_CUTOFF : options.adReportEnd;
  const report = adReportEnd === null
    ? null
    : await seedAdReportRun(prisma, { organizationId, channelAccountId: account.id, start: BASIS_FROM, end: adReportEnd });
  return {
    organizationId,
    sellpiaOperationId: sellpia.id,
    adReportOperationId: report?.id ?? null,
    accountId: account.id,
  };
}

async function seedProductFact(
  prisma: PrismaClient,
  sources: Sources,
  fact: {
    code: string;
    revenue: number;
    cost: number;
    adSpend: number;
    isActive?: boolean;
    costBasis?: string;
    vatIncluded?: boolean | null;
    omitSellpia?: boolean;
  },
): Promise<string> {
  const product = await seedSourceProduct(prisma, {
    organizationId: sources.organizationId,
    code: `SELLPIA-${fact.code}`,
    name: `${fact.code} product`,
  });
  const listing = await prisma.channelListing.create({
    data: {
      organizationId: sources.organizationId,
      channelAccountId: sources.accountId,
      externalId: `contribution-listing-${fact.code}`,
    },
  });
  if (!fact.omitSellpia) {
    await prisma.sellpiaProductMonthlySales.create({
      data: {
        organizationId: sources.organizationId,
        operationId: sources.sellpiaOperationId,
        masterProductId: product.id,
        productCode: `SELLPIA-${fact.code}`,
        optionCode: '',
        yearMonth: '2026-07',
        orderAmount: fact.revenue,
        inAmount: fact.cost,
        costBasis: fact.costBasis ?? 'ORDER_TIME_SUPPLY_COST',
        vatIncluded: fact.vatIncluded === undefined ? true : fact.vatIncluded,
        coverageStartDate: COVERAGE_START,
        coverageEndDate: COVERAGE_END,
        productName: `Sellpia ${fact.code}`,
      },
    });
  }
  // The listing's current recipe is the product alone, so it carries the listing's whole ad cost.
  const option = await prisma.channelListingOption.create({
    data: { organizationId: sources.organizationId, listingId: listing.id, externalOptionId: `VI-${fact.code}` },
  });
  await prisma.channelListingOptionInventoryComponent.create({
    data: { organizationId: sources.organizationId, channelListingOptionId: option.id, masterProductId: product.id, quantity: 1 },
  });
  if (fact.adSpend > 0 && sources.adReportOperationId) {
    await seedAdProductDays(prisma, [{
      organizationId: sources.organizationId,
      channelAccountId: sources.accountId,
      operationId: sources.adReportOperationId,
      date: '2026-07-15',
      listingId: listing.id,
      vendorItemId: `VI-${fact.code}`,
      spend: fact.adSpend,
      billedSpend: fact.adSpend,
    }]);
  }
  return product.id;
}

async function seedForeignScenario(prisma: PrismaClient): Promise<void> {
  const sources = await seedCompleteSources(prisma, OTHER_ORGANIZATION_ID);
  await seedProductFact(prisma, sources, {
    code: 'FOREIGN', revenue: 9_999_999, cost: 0, adSpend: 0,
  });
}

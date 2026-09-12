import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH } from '@kiditem/shared/product-abc';
import { MasterProductContributionRepositoryAdapter } from '../adapter/out/repository/master-product-contribution.repository.adapter';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
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
    repository = new MasterProductContributionRepositoryAdapter(prisma as never);
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
      code: 'ACTIVE', isActive: true, abcGrade: 'C', revenue: 100, cost: 20, adSpend: 10,
    });
    const stopped = await seedProductFact(prisma, sources, {
      code: 'STOPPED', isActive: false, abcGrade: 'A', revenue: 100, cost: 20, adSpend: 10,
    });
    const newProduct = await seedProductFact(prisma, sources, {
      code: 'NEW', isActive: true, abcGrade: null, revenue: 200, cost: 150, adSpend: 0,
    });
    await seedProductFact(prisma, sources, {
      code: 'LOSS', isActive: true, abcGrade: 'B', revenue: 50, cost: 170, adSpend: 30,
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
      operatingProfit: 70,
      salesRank: 2,
      positiveOperatingProfitRank: 1,
    });
    expect(filtered.products[0]?.salesContribution).toBeCloseTo(100 / 450);
    expect(filtered.products[0]?.cumulativeSalesContribution).toBeCloseTo(400 / 450);
    expect(filtered.products[0]?.cumulativePositiveOperatingProfitContribution)
      .toBeCloseTo(140 / 190);
    expect(filtered.metrics.sales).toMatchObject({
      status: 'READY', includedProductCount: 4, excludedProductCount: 0, denominator: 450,
    });
    expect(filtered.totals).toEqual({
      revenue: 450,
      positiveOperatingProfit: 190,
      lossMagnitude: 150,
      netOperatingProfit: 40,
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

    expect(result.metrics.positiveOperatingProfit.denominator).toBe(140);
    expect(result.metrics.loss.denominator).toBe(150);
    expect(result.totals.netOperatingProfit).toBe(-10);
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

    expect(result.metrics.sales).toMatchObject({ status: 'NO_DENOMINATOR', denominator: null });
    expect(result.metrics.positiveOperatingProfit).toMatchObject({
      status: 'NO_DENOMINATOR', denominator: null,
    });
    expect(result.metrics.loss).toMatchObject({ status: 'NO_DENOMINATOR', denominator: null });
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

  it('keeps sales complete when exact advertising evidence is unavailable', async () => {
    const sources = await seedCompleteSources(prisma, TEST_ORGANIZATION_ID);
    await seedProductFact(prisma, sources, {
      code: 'SALES-ONLY', revenue: 100, cost: 20, adSpend: 10,
    });
    await prisma.sourceImportRun.update({
      where: { id: sources.advertisingSourceImportRunId },
      data: { status: 'failed' },
    });

    const result = await repository.readContribution(input(sources));

    expect(result.metrics.sales).toMatchObject({ status: 'READY', denominator: 100 });
    expect(result.metrics.positiveOperatingProfit).toMatchObject({
      status: 'SOURCE_INCOMPLETE', includedProductCount: 0, excludedProductCount: 1,
    });
    expect(result.products[0]).toMatchObject({
      revenue: 100,
      operatingProfit: null,
      metricCompleteness: { sales: true, operatingProfit: false },
    });
  });

  it('requires frozen advertising provenance before calculating operating profit', async () => {
    const sources = await seedCompleteSources(prisma, TEST_ORGANIZATION_ID);
    await seedProductFact(prisma, sources, {
      code: 'UNFROZEN-AD', revenue: 100, cost: 20, adSpend: 10,
    });
    await prisma.sourceImportRun.update({
      where: { id: sources.advertisingSourceImportRunId },
      data: { adSourcePolicyHash: null },
    });

    const result = await repository.readContribution(input(sources));

    expect(result.metrics.sales).toMatchObject({ status: 'READY', denominator: 100 });
    expect(result.metrics.positiveOperatingProfit.status).toBe('SOURCE_INCOMPLETE');
    expect(result.products[0]).toMatchObject({
      revenue: 100,
      operatingProfit: null,
      metricCompleteness: { sales: true, operatingProfit: false },
    });
  });

  it('rejects a non-canonical advertising policy hash as stale evidence', async () => {
    const sources = await seedCompleteSources(prisma, TEST_ORGANIZATION_ID);
    await seedProductFact(prisma, sources, {
      code: 'WRONG-AD-POLICY', revenue: 100, cost: 20, adSpend: 10,
    });
    await prisma.sourceImportRun.update({
      where: { id: sources.advertisingSourceImportRunId },
      data: { adSourcePolicyHash: 'f'.repeat(64) },
    });

    const result = await repository.readContribution(input(sources));

    expect(result.metrics.sales).toMatchObject({ status: 'READY', denominator: 100 });
    expect(result.metrics.positiveOperatingProfit.status).toBe('SOURCE_INCOMPLETE');
    expect(result.products[0]).toMatchObject({
      revenue: 100,
      operatingProfit: null,
      metricCompleteness: { sales: true, operatingProfit: false },
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

    expect(result.metrics.sales.status).toBe('SOURCE_INCOMPLETE');
    expect(result.metrics.positiveOperatingProfit.status).toBe('SOURCE_INCOMPLETE');
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
      status: 'READY', includedProductCount: 2, excludedProductCount: 0, denominator: 140,
    });
    expect(result.metrics.positiveOperatingProfit).toMatchObject({
      status: 'SOURCE_INCOMPLETE', includedProductCount: 1, excludedProductCount: 1,
      denominator: 70,
    });
    expect(result.products.find((product) => product.masterProductId === invalid)).toMatchObject({
      revenue: 40,
      operatingProfit: null,
      positiveOperatingProfitContribution: null,
      lossImpact: null,
      metricCompleteness: { sales: true, operatingProfit: false },
    });
  });

  it('counts frozen advertising spend as loss when the complete Sellpia manifest proves zero sales', async () => {
    const sources = await seedCompleteSources(prisma, TEST_ORGANIZATION_ID);
    await seedProductFact(prisma, sources, {
      code: 'AD-ONLY', revenue: 0, cost: 0, adSpend: 30, omitSellpia: true,
    });

    const result = await repository.readContribution(input(sources));

    expect(result.totals).toEqual({
      revenue: 0,
      positiveOperatingProfit: 0,
      lossMagnitude: 30,
      netOperatingProfit: -30,
    });
    expect(result.products[0]).toMatchObject({
      revenue: 0,
      operatingProfit: -30,
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
      status: 'READY', denominator: 70,
    });
    expect(positiveOnly.metrics.loss.status).toBe('NO_DENOMINATOR');
    expect(positiveOnly.totals.netOperatingProfit).toBe(70);

    const lossSources = await seedCompleteSources(prisma, TEST_ORGANIZATION_ID);
    await seedProductFact(prisma, lossSources, {
      code: 'LOSS-ONLY', revenue: 10, cost: 20, adSpend: 5,
    });

    const lossOnly = await repository.readContribution(input(lossSources));

    expect(lossOnly.metrics.positiveOperatingProfit.status).toBe('NO_DENOMINATOR');
    expect(lossOnly.metrics.loss).toMatchObject({ status: 'READY', denominator: 15 });
    expect(lossOnly.totals.netOperatingProfit).toBe(-15);
  });
});

function input(sources: Sources) {
  return {
    organizationId: sources.organizationId,
    basisFromDate: BASIS_FROM,
    basisCutoffDate: BASIS_CUTOFF,
    sellpiaSourceImportRunId: sources.sellpiaSourceImportRunId,
    advertisingSourceImportRunId: sources.advertisingSourceImportRunId,
  } as const;
}

function sum(
  rows: readonly Record<string, number | string | boolean | null | object>[],
  field: 'positiveOperatingProfitContribution' | 'lossImpact',
): number {
  return rows.reduce((total, row) => total + Number(row[field] ?? 0), 0);
}

async function seedCompleteSources(prisma: PrismaClient, organizationId: string) {
  const sellpia = await prisma.sourceImportRun.create({
    data: {
      organizationId,
      sourceType: 'sellpia_product_profitability',
      status: 'completed',
      publicationSequence: 1n,
      mappingGeneration: 7n,
      coverageStartDate: COVERAGE_START,
      coverageEndDate: COVERAGE_END,
      coveredMonths: ['2026-07'],
      importedAt: new Date('2026-08-01T00:00:00.000Z'),
      providerBackedEmptyProof: false,
    },
  });
  const account = await prisma.channelAccount.create({
    data: {
      organizationId,
      channel: 'coupang',
      name: 'Contribution test account',
      externalAccountId: `contribution-${organizationId}`,
    },
  });
  const advertising = await prisma.sourceImportRun.create({
    data: {
      organizationId,
      sourceType: 'coupang_ad_profitability',
      channelAccountId: account.id,
      status: 'completed',
      publicationSequence: 1n,
      mappingGeneration: 7n,
      coverageStartDate: COVERAGE_START,
      coverageEndDate: COVERAGE_END,
      coveredMonths: ['2026-07'],
      importedAt: new Date('2026-08-01T00:00:00.000Z'),
      providerBackedEmptyProof: false,
      adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
    },
  });
  return {
    organizationId,
    sellpiaSourceImportRunId: sellpia.id,
    advertisingSourceImportRunId: advertising.id,
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
    abcGrade?: string | null;
    costBasis?: string;
    vatIncluded?: boolean | null;
    omitSellpia?: boolean;
  },
): Promise<string> {
  const product = await prisma.masterProduct.create({
    data: {
      organizationId: sources.organizationId,
      code: fact.code,
      name: `${fact.code} product`,
      isActive: fact.isActive ?? true,
      abcGrade: fact.abcGrade ?? null,
    },
  });
  const listing = await prisma.channelListing.create({
    data: {
      organizationId: sources.organizationId,
      channelAccountId: sources.accountId,
      externalId: `contribution-listing-${fact.code}`,
      masterProductId: product.id,
    },
  });
  if (!fact.omitSellpia) {
    await prisma.sellpiaProductMonthlySales.create({
      data: {
        organizationId: sources.organizationId,
        sourceImportRunId: sources.sellpiaSourceImportRunId,
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
  await prisma.channelAdListingProductMonthlyFact.create({
    data: {
      organizationId: sources.organizationId,
      sourceImportRunId: sources.advertisingSourceImportRunId,
      channelAccountId: sources.accountId,
      channelListingId: listing.id,
      masterProductId: product.id,
      month: COVERAGE_START,
      coveredStartDate: COVERAGE_START,
      coveredEndDate: COVERAGE_END,
      wholeRecipeWeight: 1,
      mappingGeneration: 7n,
      observedTargetDayCount: 31,
      allocatedSpend: BigInt(fact.adSpend),
    },
  });
  return product.id;
}

async function seedForeignScenario(prisma: PrismaClient): Promise<void> {
  const sources = await seedCompleteSources(prisma, OTHER_ORGANIZATION_ID);
  await seedProductFact(prisma, sources, {
    code: 'FOREIGN', revenue: 9_999_999, cost: 0, adSpend: 0,
  });
}

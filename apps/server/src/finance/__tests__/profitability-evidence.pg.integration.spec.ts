import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
import { MasterProductProfitabilityReadService } from '../application/service/master-product-profitability-read.service';
import { ProductOperationsDataStatusService } from '../../products/application/service/product-operations-data-status.service';
import { ProductOperationsDataStatusRepositoryAdapter } from '../../products/adapter/out/repository/product-operations-data-status.repository.adapter';
import type { PrismaClient } from '@prisma/client';

describe('ProfitabilityEvidence (PostgreSQL)', () => {
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

  it('shows the same missing compatible cutoff in Products as in ABC evidence after mapping changes', async () => {
    const alerts = new SourceFailureAlerts(new AlertsRepository(prisma as never));
    const sellpia = new SellpiaProfitabilitySourceService(prisma as never, alerts);
    const advertising = new ProfitabilityAdImportRepositoryAdapter(prisma as never, alerts);
    await seedMappedProduct(prisma, TEST_ORGANIZATION_ID, 'OWN');
    const published = await publishSellpia(sellpia, TEST_ORGANIZATION_ID, 'OWN', 2_000);
    await publishEmptyAdvertising(advertising, TEST_ORGANIZATION_ID, 'own-ad');
    await prisma.masterProductAbcFormulaState.upsert({
      where: { organizationId: TEST_ORGANIZATION_ID },
      create: { organizationId: TEST_ORGANIZATION_ID, mappingGeneration: 1n },
      update: { mappingGeneration: 1n },
    });
    const evidence = new MasterProductProfitabilityReadService(sellpia, advertising, prisma as never);
    const products = new ProductOperationsDataStatusService(
      new ProductOperationsDataStatusRepositoryAdapter(prisma as never, evidence),
    );

    const targetCutoff = published.plan.to;
    const candidate = await evidence.load({ organizationId: TEST_ORGANIZATION_ID, targetCutoff });
    const display = await products.getStatus(TEST_ORGANIZATION_ID, 30);

    expect(candidate.actualCutoff).toBeNull();
    expect(display).toMatchObject({
      actualCutoff: null,
      sources: {
        sellpia: { status: 'STALE' },
        advertising: { status: 'STALE' },
        mapping: { status: 'STALE', generation: '1' },
      },
    });
  });

  it('loads one coherent source pair and excludes another organization', async () => {
    const sellpia = new SellpiaProfitabilitySourceService(
      prisma as never,
      new SourceFailureAlerts(new AlertsRepository(prisma as never)),
    );
    const advertising = new ProfitabilityAdImportRepositoryAdapter(
      prisma as never,
      new SourceFailureAlerts(new AlertsRepository(prisma as never)),
    );
    const ownProductId = await seedMappedProduct(prisma, TEST_ORGANIZATION_ID, 'OWN');
    const zeroProductId = await seedMappedProduct(prisma, TEST_ORGANIZATION_ID, 'ZERO');
    await seedMappedProduct(prisma, OTHER_ORGANIZATION_ID, 'FOREIGN');

    const ownSellpia = await publishSellpia(sellpia, TEST_ORGANIZATION_ID, 'OWN', 2_000);
    await publishSellpia(sellpia, OTHER_ORGANIZATION_ID, 'FOREIGN', 999_999);
    await publishEmptyAdvertising(advertising, TEST_ORGANIZATION_ID, 'own-ad');
    await publishEmptyAdvertising(advertising, OTHER_ORGANIZATION_ID, 'foreign-ad');

    const service = new MasterProductProfitabilityReadService(
      sellpia,
      advertising,
      prisma as never,
    );
    const targetCutoff = ownSellpia.plan.to;
    const formulaMonths = calendarMonthRange(targetCutoff, 12);
    const result = await service.load({
      organizationId: TEST_ORGANIZATION_ID,
      targetCutoff,
    });

    expect(result).toMatchObject({
      targetCutoff,
      actualCutoff: targetCutoff,
      mappingGeneration: '0',
      contributionBasis: {
        basisFromDate: `${formulaMonths[0]}-01`,
        basisCutoffDate: targetCutoff,
      },
      sources: {
        sellpia: { status: 'READY', latestAttemptState: 'COMPLETE' },
        advertising: { status: 'READY', latestAttemptState: 'COMPLETE' },
      },
    });
    expect(inclusiveDateCount(ownSellpia.plan.from, ownSellpia.plan.to)).toBe(401);
    expect(result.sourceVector.sellpia).toMatchObject({
      coverageStartDate: ownSellpia.plan.from,
      coverageEndDate: ownSellpia.plan.to,
    });
    expect(new Date(`${ownSellpia.plan.to}T00:00:00.000Z`).getTime()).toBeGreaterThanOrEqual(
      new Date(`${targetCutoff}T00:00:00.000Z`).getTime(),
    );
    expect(result.products).toHaveLength(2);
    const ownEvidence = result.products.find((product) => product.masterProductId === ownProductId);
    const zeroEvidence = result.products.find((product) => product.masterProductId === zeroProductId);
    expect(ownEvidence).toMatchObject({
      selling: true,
      mappingValid: true,
      saleStartDate: '2026-05-01',
      evaluationPeriodComplete: false,
      validObservationDays: inclusiveDateCount(`${targetCutoff.slice(0, 7)}-01`, targetCutoff),
      formulaReadyFacts: { cutoffDate: targetCutoff },
    });
    expect(ownEvidence?.formulaReadyFacts?.monthlyFacts.map((fact) => fact.yearMonth))
      .toEqual([targetCutoff.slice(0, 7)]);
    expect(ownEvidence?.formulaReadyFacts?.monthlyFacts.at(-1)).toMatchObject({
      recognizedRevenue: 2_000,
      orderTimeSupplyCost: 1_200,
      advertisingSpend: 0,
      provenance: { advertisingEvidence: 'NOT_APPLIED' },
    });
    expect(zeroEvidence).toMatchObject({
      mappingValid: true,
      saleStartDate: '2026-05-01',
      validObservationDays: 0,
      formulaReadyFacts: null,
    });
  });
});

async function seedMappedProduct(
  prisma: PrismaClient,
  organizationId: string,
  suffix: string,
): Promise<string> {
  const product = await prisma.masterProduct.create({
    data: {
      organizationId,
      code: `MASTER-${suffix}`,
      name: `${suffix} product`,
    },
  });
  await prisma.sellpiaInventorySku.create({
    data: {
      organizationId,
      masterProductId: product.id,
      code: `SKU-${suffix}`,
      name: `${suffix} SKU`,
      currentStock: 1,
    },
  });
  const account = await prisma.channelAccount.create({
    data: {
      organizationId,
      channel: 'coupang',
      name: `${suffix} Wing`,
      externalAccountId: `account-${suffix.toLowerCase()}`,
      vendorId: `vendor-${suffix.toLowerCase()}`,
      // Historical mapping evidence is independent of current account status;
      // keeping the account inactive also makes the paired ad fixture an
      // explicit empty-generation proof.
      status: 'inactive',
    },
  });
  const listing = await prisma.channelListing.create({
    data: {
      organizationId,
      channelAccountId: account.id,
      masterProductId: product.id,
      externalId: `listing-${suffix.toLowerCase()}`,
      status: 'active',
      rawJson: { source: 'wing_app_data', saleStartedAt: '2026-05-01' },
    },
  });
  const option = await prisma.channelListingOption.create({
    data: {
      organizationId,
      listingId: listing.id,
      externalOptionId: `option-${suffix.toLowerCase()}`,
      status: '판매중',
    },
  });
  await prisma.channelListingOptionInventoryComponent.create({
    data: {
      organizationId,
      channelListingOptionId: option.id,
      sellpiaInventorySkuId: (await prisma.sellpiaInventorySku.findFirstOrThrow({
        where: { organizationId, masterProductId: product.id },
        select: { id: true },
      })).id,
      quantity: 1,
    },
  });
  return product.id;
}

async function publishSellpia(
  owner: SellpiaProfitabilitySourceService,
  organizationId: string,
  suffix: string,
  revenue: number,
) {
  const attempt = await owner.beginAttempt(
    organizationId,
    `11111111-1111-4111-8111-${suffix === 'OWN' ? '111111111111' : '222222222222'}`,
  );
  await owner.submitAttempt(organizationId, attempt.attemptId, {
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
      productCode: `SKU-${suffix}`,
      optionCode: '',
      productName: `${suffix} product`,
      salePrice: 1_000,
      buyPrice: 600,
      totalOrderAmount: revenue,
      totalOrderQty: 2,
      totalInAmount: Math.floor(revenue * 0.6),
      totalInQty: 2,
      months: [{
        // The source ends at the latest closed KST day. This deliberately
        // exercises the partial cutoff month without inventing daily rows.
        yearMonth: attempt.plan.to.slice(0, 7),
        orderQty: 2,
        orderAmount: revenue,
        inQty: 2,
        inAmount: Math.floor(revenue * 0.6),
      }],
    }],
  });
  return attempt;
}

async function publishEmptyAdvertising(
  owner: ProfitabilityAdImportRepositoryAdapter,
  organizationId: string,
  idempotencyKey: string,
): Promise<void> {
  const attempt = await owner.beginAttempt({ organizationId, idempotencyKey });
  expect(attempt.accounts).toEqual([]);
  await owner.finalizeAttempt({
    organizationId,
    attemptId: attempt.attemptId,
    attemptToken: attempt.attemptToken,
  });
}

function inclusiveDateCount(from: string, to: string): number {
  return Math.floor(
    (new Date(`${to}T00:00:00.000Z`).getTime()
      - new Date(`${from}T00:00:00.000Z`).getTime())
    / 86_400_000,
  ) + 1;
}

function calendarMonthRange(targetCutoff: string, count: number): string[] {
  const match = /^(\d{4})-(0[1-9]|1[0-2])-\d{2}$/.exec(targetCutoff);
  if (!match) throw new Error('Expected a calendar cutoff');
  const normalizedCount = Math.max(1, Math.floor(count));
  const year = Number(match[1]);
  const month = Number(match[2]);
  return Array.from({ length: normalizedCount }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (normalizedCount - 1 - index), 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

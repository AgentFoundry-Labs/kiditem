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

    const candidate = await evidence.load({ organizationId: TEST_ORGANIZATION_ID, targetCutoff: published.plan.to });
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
    const result = await service.load({
      organizationId: TEST_ORGANIZATION_ID,
      targetCutoff: ownSellpia.plan.to,
    });

    expect(result).toMatchObject({
      targetCutoff: ownSellpia.plan.to,
      actualCutoff: ownSellpia.plan.to,
      mappingGeneration: '0',
      contributionBasis: {
        basisFromDate: ownSellpia.plan.from,
        basisCutoffDate: ownSellpia.plan.to,
      },
      sources: {
        sellpia: { status: 'READY', latestAttemptState: 'COMPLETE' },
        advertising: { status: 'READY', latestAttemptState: 'COMPLETE' },
      },
    });
    expect(result.products).toHaveLength(2);
    const ownEvidence = result.products.find((product) => product.masterProductId === ownProductId);
    const zeroEvidence = result.products.find((product) => product.masterProductId === zeroProductId);
    expect(ownEvidence).toMatchObject({
      selling: true,
      mappingValid: true,
      formulaReadyFacts: { cutoffDate: ownSellpia.plan.to },
    });
    expect(ownEvidence?.formulaReadyFacts?.monthlyFacts).toHaveLength(12);
    expect(ownEvidence?.formulaReadyFacts?.monthlyFacts.at(-1)).toMatchObject({
      recognizedRevenue: 2_000,
      orderTimeSupplyCost: 1_200,
      advertisingSpend: 0,
      provenance: { advertisingEvidence: 'NOT_APPLIED' },
    });
    expect(zeroEvidence?.formulaReadyFacts?.monthlyFacts).toHaveLength(12);
    expect(zeroEvidence?.formulaReadyFacts?.monthlyFacts.every((fact) =>
      fact.recognizedRevenue === 0 && fact.orderTimeSupplyCost === 0)).toBe(true);
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
    parserVersion: 'sellpia-profitability-v1',
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
      months: [{
        yearMonth: attempt.plan.coveredMonths.at(-1)!,
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

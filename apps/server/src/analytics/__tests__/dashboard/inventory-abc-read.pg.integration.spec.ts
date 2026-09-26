import { profitCatalogTestReaders } from '../../../test-helpers/channel-fact-ports';
import { channelFactTestPorts } from '../../../test-helpers/channel-fact-ports';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD, PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH, productAbcDisplayStatus } from '@kiditem/shared/product-abc';
import { SellpiaProductInventoryReader } from '../../sellpia-product-sales/sellpia-product-inventory-reader';
import { ProductAvailabilityRepositoryAdapter } from '../../../products/adapter/out/persistence/product-availability.repository.adapter';
import { ProductAvailabilityUseCase } from '../../../products/application/service/product-availability.usecase';
import { ProductTransactionalReadRepositoryAdapter } from '../../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { ProductSourceReadRepositoryAdapter } from '../../../products/adapter/out/persistence/product-source-read.repository.adapter';
import { MasterProductAbcRepositoryAdapter } from '../../../products/adapter/out/persistence/master-product-abc.repository.adapter';
import { ProductAbcReadUseCase } from '../../../products/application/service/product-abc-read.usecase';
import { RecalculateProductAbcUseCase } from '../../../products/application/service/recalculate-product-abc.usecase';
import { SourceFailureAlerts } from '../../../alerts/alerts.service';
import { ProfitabilityAdImportRepositoryAdapter } from '../../../advertising/adapter/out/repository/profitability-ad-import.repository.adapter';
import { MasterProductProfitabilityReadService } from '../../../finance/application/service/master-product-profitability-read.service';
import { SellpiaProfitabilitySourceService } from '../../sellpia-product-sales/sellpia-profitability-source.service';
import { publishSellpiaProfitability, seedSellpiaProfitabilityOperation } from '../../../test-helpers/__tests__/sellpia-profitability-operation';
import { DashboardInventoryRepositoryAdapter } from '../../adapter/out/repository/dashboard/dashboard-inventory.repository.adapter';
import { DashboardInventoryService } from '../../application/service/dashboard/dashboard-inventory.service';
import { buildDashboardContext } from '../../domain/dashboard/context';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID } from '../../../test-helpers/real-prisma';
import { seedSourceProduct } from '../../../test-helpers/inventory-seeds';
import type { PrismaClient } from '@prisma/client';

describe('Analytics inventory ABC reads (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let dashboard: DashboardInventoryService;
  let inventory: SellpiaProductInventoryReader;
  let sellpia: SellpiaProfitabilitySourceService;
  let advertising: ProfitabilityAdImportRepositoryAdapter;
  let evidence: MasterProductProfitabilityReadService;
  let availability: ProductAvailabilityUseCase;

  beforeAll(async () => { prisma = makeTestPrisma(); await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    const alerts = new SourceFailureAlerts(prisma as never);
    const inventoryTransactionalRead = new ProductTransactionalReadRepositoryAdapter();
    sellpia = new SellpiaProfitabilitySourceService(prisma as never);
    advertising = new ProfitabilityAdImportRepositoryAdapter(channelFactTestPorts(prisma as never).accounts, channelFactTestPorts(prisma as never).recipes, channelFactTestPorts(prisma as never).listings, prisma as never, alerts);
    evidence = new MasterProductProfitabilityReadService(sellpia, advertising, prisma as never, new ProductTransactionalReadRepositoryAdapter());
    availability = new ProductAvailabilityUseCase(
      new ProductAvailabilityRepositoryAdapter(prisma as never),
    );
    const productAbc = new ProductAbcReadUseCase(
      new MasterProductAbcRepositoryAdapter(prisma as never, inventoryTransactionalRead), evidence,
    );
    dashboard = new DashboardInventoryService(new DashboardInventoryRepositoryAdapter(channelFactTestPorts(prisma as never).recipes, channelFactTestPorts(prisma as never).listings,
      prisma as never,
      productAbc,
      // The panel's rows come from the alerts module, not from this adapter.
      alerts,
      inventoryTransactionalRead,
      new ProductSourceReadRepositoryAdapter(prisma as never), profitCatalogTestReaders(prisma as never).accounts, profitCatalogTestReaders(prisma as never).content
    ));
    inventory = new SellpiaProductInventoryReader(prisma as never,
      availability,
      { findDisplayMedia: async () => new Map() }, productAbc, inventoryTransactionalRead);
  });

  it('reports source attention for a product without complete evidence without inventing C', async () => {
    const product = await seedSourceProduct(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'SKU-OWN',
      name: 'Own product',
      currentStock: 10,
    });

    const result = await dashboard.getSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);

    expect(result.gradeCount).toEqual({ A: 0, B: 0, C: 0 });
    expect(result.unclassifiedProductCount).toBe(1);
    expect(result.abcStatusCount).toEqual({
      READY: 0, INSUFFICIENT_EVIDENCE: 0, SOURCE_UNMAPPED: 1,
      SELLPIA_SOURCE_STALE: 0, AD_SOURCE_STALE: 0,
    });
  });

  it('reads a complete source pair and the explicitly published absolute evaluation in Sellpia inventory', async () => {
    const cutoff = await publishProduct();
    const result = await inventory.project(TEST_ORGANIZATION_ID, [{
      key: 'OWN', evidence: { productCode: 'SKU-OWN', optionCode: '', barcode: null }, completeMonthly: [],
    }]);
    expect(result.projection.byProductKey.get('OWN')?.inventoryResolution).toMatchObject({
      status: 'matched', currentStock: 10,
      inventoryProduct: {
        abc: { abcGrade: 'A', evaluation: { abcGrade: 'A', economicScore: 100, gradeBasisCutoffDate: cutoff },
          actualCutoffDate: cutoff, officialCutoffDate: cutoff },
      },
    });
    expect(ownAbcStatuses(result)).toMatchObject({ inventoryProduct: 'READY' });
    expect(result.projection.summary.abcStatusCounts).toEqual({
      READY: 1, INSUFFICIENT_EVIDENCE: 0, SOURCE_UNMAPPED: 0, SELLPIA_SOURCE_STALE: 0, AD_SOURCE_STALE: 0,
    });
    const summary = await dashboard.getSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);
    expect(summary.abcStatusCount.READY).toBe(1);
    expect(summary.gradeCount).toEqual({ A: 1, B: 0, C: 0 });
    expect(summary.abcFormula).toEqual(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD);
    expect(summary.abcContributionProfit.amountByGrade.A).toBe(result.projection.summary.abcContributionProfitByGrade.A);
    expect(summary.abcContributionProfit.amountByGrade.A).toBeGreaterThan(0);
    expect(summary.abcContributionProfit.basis).toMatchObject({
      publicationRevision: 1,
      officialCutoffDate: cutoff,
      mappingGeneration: '0',
      includedProductCount: 1,
    });
    expect(summary.abcContributionProfit.basis.denominator)
      .toBe(summary.abcContributionProfit.amountByGrade.A);
    // The grade count is as-of the organization-level evidence cutoff the ABC
    // read validated these stored results against — a complete month end. That
    // is deliberately not the source collection's coverage end (`cutoff`,
    // mid-month here): an aggregate over many products has no single
    // publication cutoff, and the evidence cutoff never overstates coverage.
    const gradeBasis = summary.metricBasis?.['gradeCount.A'];
    expect(gradeBasis).toMatchObject({
      kind: 'snapshot', measured: true, sources: ['products', 'product_abc'],
    });
    const asOf = gradeBasis?.kind === 'snapshot' ? gradeBasis.asOf : null;
    expect(asOf).not.toBeNull();
    expect(asOf! <= cutoff).toBe(true);
  });

  it.each(['sellpia', 'advertising'] as const)('retains the official grade and actual complete cutoff after a newer %s failure', async (source) => {
    const cutoff = await publishProduct();
    if (source === 'sellpia') {
      await seedSellpiaProfitabilityOperation(prisma, { organizationId: TEST_ORGANIZATION_ID, status: 'failed' });
    } else {
      const attempt = await advertising.beginAttempt({ organizationId: TEST_ORGANIZATION_ID, idempotencyKey: 'newer-ad-failure' });
      await advertising.failAttempt({ organizationId: TEST_ORGANIZATION_ID, attemptId: attempt.attemptId,
        // The adapter declares `{code, message}`; this passed `errorCode`/
        // `errorMessage`, so both had been arriving undefined.
        attemptToken: attempt.attemptToken, code: 'COLLECTION_FAILED', message: 'Provider unavailable',
      });
    }
    const result = await inventory.project(TEST_ORGANIZATION_ID, [{
      key: 'OWN', evidence: { productCode: 'SKU-OWN', optionCode: '', barcode: null }, completeMonthly: [],
    }]);
    expect(result.projection.byProductKey.get('OWN')?.inventoryResolution).toMatchObject({
      inventoryProduct: { abc: { abcGrade: 'A', evaluation: { publicationRevision: 1 },
        actualCutoffDate: cutoff, officialCutoffDate: cutoff,
        sources: { [source]: {
          ready: true,
          actualCutoff: cutoff,
          latestAttempt: { state: 'FAILED' },
        } },
      } },
      destinations: [{ abc: {
        abcGrade: 'A',
        actualCutoffDate: cutoff,
        sources: { [source]: { ready: true, latestAttempt: { state: 'FAILED' } } },
      } }],
    });
    expect(ownAbcStatuses(result)).toEqual({ inventoryProduct: 'READY', destinations: ['READY'] });
    const summary = await dashboard.getSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);
    expect(summary.gradeCount).toEqual({ A: 1, B: 0, C: 0 });
    expect(summary.abcStatusCount.READY).toBe(1);
    expect(summary.abcStatusCount.SELLPIA_SOURCE_STALE).toBe(0);
    expect(summary.abcStatusCount.AD_SOURCE_STALE).toBe(0);
  });

  it('counts a carried official grade but withholds its contribution from a newer publication basis', async () => {
    const cutoff = await publishProduct();
    await prisma.masterProductAbcFormulaState.update({
      where: { organizationId: TEST_ORGANIZATION_ID },
      data: { publicationRevision: 2, publishedAt: new Date('2026-09-08T00:00:00.000Z') },
    });

    const result = await inventory.project(TEST_ORGANIZATION_ID, [{
      key: 'OWN', evidence: { productCode: 'SKU-OWN', optionCode: '', barcode: null }, completeMonthly: [],
    }]);
    expect(result.projection.byProductKey.get('OWN')?.inventoryResolution).toMatchObject({
      inventoryProduct: { abc: {
        abcGrade: 'A',
        evaluation: {
          abcGrade: 'A',
          publicationRevision: 1,
          gradeBasisCutoffDate: cutoff,
          formulaRevision: 1,
          mappingGeneration: '0',
        },
      } },
    });

    const summary = await dashboard.getSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);
    expect(summary.gradeCount).toEqual({ A: 1, B: 0, C: 0 });
    expect(summary.classifiedProductCount).toBe(1);
    expect(summary.unclassifiedProductCount).toBe(0);
    expect(summary.abcContributionProfit).toMatchObject({
      amountByGrade: { A: 0, B: 0, C: 0 },
      shareByGrade: { A: null, B: null, C: null },
      basis: {
        publicationRevision: 2,
        officialCutoffDate: cutoff,
        includedProductCount: 0,
        withheldProductCount: 1,
        denominator: null,
      },
    });
    expect(summary.abcFormula).toBeNull();
  });

  it('retains the published grade after formula and mapping configuration changes without republication', async () => {
    await publishProduct();
    const nextFormula = await prisma.masterProductAbcFormulaVersion.create({ data: {
      organizationId: TEST_ORGANIZATION_ID,
      formulaKey: 'PRODUCT_ABC_ABSOLUTE',
      version: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.version + 1,
      formulaChecksum: 'f'.repeat(64),
      formulaJson: JSON.parse(JSON.stringify(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD)),
    } });
    await prisma.masterProductAbcFormulaState.update({
      where: { organizationId: TEST_ORGANIZATION_ID },
      data: { activeFormulaVersionId: nextFormula.id, formulaRevision: 2, mappingGeneration: 1n },
    });
    const result = await inventory.project(TEST_ORGANIZATION_ID, [{
      key: 'OWN', evidence: { productCode: 'SKU-OWN', optionCode: '', barcode: null }, completeMonthly: [],
    }]);
    expect(result.projection.byProductKey.get('OWN')?.inventoryResolution).toMatchObject({
      inventoryProduct: { abc: {
        abcGrade: 'A',
        evaluation: { abcGrade: 'A', formulaRevision: 1, publicationRevision: 1 },
        actualCutoffDate: null,
      } },
    });
    expect(ownAbcStatuses(result)).toMatchObject({ inventoryProduct: 'SELLPIA_SOURCE_STALE' });
    expect(result.projection.summary.abcStatusCounts.READY).toBe(0);
    expect(result.projection.summary.abcCounts).toEqual({ A: 1, B: 0, C: 0 });
    // No actual cutoff means the retained grade's age is unknown. `unknown`
    // and not `unavailable`, so the retained count stays on screen.
    const summary = await dashboard.getSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);
    expect(summary.gradeCount).toEqual({ A: 1, B: 0, C: 0 });
    expect(summary.abcFormula).toEqual(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD);
    expect(summary.abcContributionProfit.basis).toMatchObject({
      publicationRevision: 1,
      mappingGeneration: '0',
      includedProductCount: 1,
    });
    expect(summary.metricBasis?.['gradeCount.A']).toMatchObject({
      kind: 'snapshot', measured: true, asOf: null,
    });
  });

  async function publishProduct() {
    const product = await seedSourceProduct(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'SKU-OWN',
      name: 'Own product',
      currentStock: 10,
    });
    const importedAt = new Date('2026-09-06T00:00:00.000Z');
    const inventoryRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'sellpia_inventory',
        channelAccountId: null,
        fileName: 'dashboard-inventory-abc.json',
        fileHash: 'd'.repeat(64),
        status: 'completed',
        rowCount: 1,
        importedAt,
        lastVerifiedAt: importedAt,
        verificationCount: 1,
        freshnessGeneration: 1n,
      },
    });
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        requestedGeneration: 1n,
        verifiedGeneration: 1n,
        lastVerifiedAt: importedAt,
        lastCompletedOperationId: inventoryRun.id,
      },
    });
    const account = await prisma.channelAccount.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, channel: 'rocket', name: 'Rocket', status: 'active',
    } });
    const listing = await prisma.channelListing.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, channelAccountId: account.id,
      externalId: 'LISTING-OWN', status: 'active',
      rawJson: { source: 'wing_app_data', saleStartedAt: '2026-05-01' },
    } });
    const option = await prisma.channelListingOption.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, listingId: listing.id, externalOptionId: 'OPTION-OWN', status: '판매중',
    } });
    await prisma.channelListingOptionInventoryComponent.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, channelListingOptionId: option.id, masterProductId: product.id, quantity: 1,
    } });
    const attempt = await publishSellpiaProfitability(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      products: (plan) => {
        const months = plan.coveredMonths.map((yearMonth) => ({
          yearMonth,
          orderQty: 1,
          orderAmount: 10_000_000,
          inQty: 1,
          inAmount: 1_000_000,
        }));
        return [{ productCode: 'SKU-OWN', optionCode: '', productName: 'Own product', salePrice: 10_000_000, buyPrice: 1_000_000,
          totalOrderAmount: months.length * 10_000_000,
          totalOrderQty: months.length,
          totalInAmount: months.length * 1_000_000,
          totalInQty: months.length,
          months,
        }];
      },
    });
    const ad = await advertising.beginAttempt({ organizationId: TEST_ORGANIZATION_ID, idempotencyKey: 'analytics-ad' });
    expect(ad.accounts).toEqual([]);
    await advertising.finalizeAttempt({ organizationId: TEST_ORGANIZATION_ID, attemptId: ad.attemptId, attemptToken: ad.attemptToken });
    const formula = await prisma.masterProductAbcFormulaVersion.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, formulaKey: 'PRODUCT_ABC_ABSOLUTE', version: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.version,
      formulaChecksum: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH, formulaJson: JSON.parse(JSON.stringify(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD)),
    } });
    await prisma.masterProductAbcFormulaState.upsert({ where: { organizationId: TEST_ORGANIZATION_ID },
      create: { organizationId: TEST_ORGANIZATION_ID, activeFormulaVersionId: formula.id, formulaRevision: 1 },
      update: { activeFormulaVersionId: formula.id, formulaRevision: 1 },
    });
    await expect(new RecalculateProductAbcUseCase(new MasterProductAbcRepositoryAdapter(prisma as never, new ProductTransactionalReadRepositoryAdapter()), evidence)
      .recalculate({ organizationId: TEST_ORGANIZATION_ID })).resolves.toMatchObject({ outcome: 'PUBLISHED', classifiedProductCount: 1 });
    return attempt.plan.to;
  }
});

/** The shared display word for the OWN product and its destinations, derived from the published facts. */
function ownAbcStatuses(result: Awaited<ReturnType<SellpiaProductInventoryReader['project']>>) {
  const resolution = result.projection.byProductKey.get('OWN')?.inventoryResolution;
  if (resolution?.status !== 'matched') return null;
  return {
    inventoryProduct: resolution.inventoryProduct
      ? productAbcDisplayStatus(resolution.inventoryProduct.abc)
      : null,
    destinations: resolution.destinations.map((destination) => productAbcDisplayStatus(destination.abc)),
  };
}

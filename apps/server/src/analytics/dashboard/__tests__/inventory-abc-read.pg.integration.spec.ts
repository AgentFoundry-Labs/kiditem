import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD, PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH } from '@kiditem/shared/product-abc';
import { SellpiaProductInventoryReader } from '../../sellpia-product-sales/sellpia-product-inventory-reader';
import { InventoryAvailabilityRepositoryAdapter } from '../../../inventory/adapter/out/repository/inventory-availability.repository.adapter';
import { InventoryAvailabilityService } from '../../../inventory/application/service/inventory-availability.service';
import { MasterProductAbcRepositoryAdapter } from '../../../products/adapter/out/repository/master-product-abc.repository.adapter';
import { ProductAbcReadService } from '../../../products/application/service/product-abc-read.service';
import { MasterProductAbcService } from '../../../products/application/service/master-product-abc.service';
import { SourceFailureAlerts } from '../../../alerts/alerts.service';
import { ProfitabilityAdImportRepositoryAdapter } from '../../../advertising/adapter/out/repository/profitability-ad-import.repository.adapter';
import { MasterProductProfitabilityReadService } from '../../../finance/application/service/master-product-profitability-read.service';
import { SellpiaProfitabilitySourceService } from '../../sellpia-product-sales/sellpia-profitability-source.service';
import { DashboardInventoryRepositoryAdapter } from '../adapter/out/repository/dashboard-inventory.repository.adapter';
import { DashboardInventoryService } from '../application/service/dashboard-inventory.service';
import { buildDashboardContext } from '../domain/context';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID } from '../../../test-helpers/real-prisma';
import type { PrismaClient } from '@prisma/client';

describe('Analytics inventory ABC reads (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let dashboard: DashboardInventoryService;
  let inventory: SellpiaProductInventoryReader;
  let sellpia: SellpiaProfitabilitySourceService;
  let advertising: ProfitabilityAdImportRepositoryAdapter;
  let evidence: MasterProductProfitabilityReadService;

  beforeAll(async () => { prisma = makeTestPrisma(); await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    const alerts = new SourceFailureAlerts(prisma as never);
    sellpia = new SellpiaProfitabilitySourceService(prisma as never, alerts);
    advertising = new ProfitabilityAdImportRepositoryAdapter(prisma as never, alerts);
    evidence = new MasterProductProfitabilityReadService(sellpia, advertising, prisma as never);
    const productAbc = new ProductAbcReadService(
      new MasterProductAbcRepositoryAdapter(prisma as never), evidence,
    );
    dashboard = new DashboardInventoryService(new DashboardInventoryRepositoryAdapter(
      prisma as never,
      productAbc,
      // The panel's rows come from the alerts module, not from this adapter.
      alerts,
    ));
    inventory = new SellpiaProductInventoryReader(prisma as never,
      new InventoryAvailabilityService(new InventoryAvailabilityRepositoryAdapter(prisma as never)),
      { findDisplayMedia: async () => new Map() }, productAbc);
  });

  it('reports source attention for a product without complete evidence without inventing C', async () => {
    const product = await prisma.masterProduct.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, code: 'MASTER-OWN', name: 'Own product',
    } });
    await prisma.sellpiaInventorySku.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, masterProductId: product.id,
      code: 'SKU-OWN', name: 'Own SKU', currentStock: 10,
    } });

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
          displayStatus: 'READY', actualCutoffDate: cutoff, officialCutoffDate: cutoff },
      },
    });
    expect(result.projection.summary.abcStatusCounts).toEqual({
      READY: 1, INSUFFICIENT_EVIDENCE: 0, SOURCE_UNMAPPED: 0, SELLPIA_SOURCE_STALE: 0, AD_SOURCE_STALE: 0,
    });
    const summary = await dashboard.getSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);
    expect(summary.abcStatusCount.READY).toBe(1);
    expect(summary.gradeCount).toEqual({ A: 1, B: 0, C: 0 });
    expect(summary.abcFormula).toEqual(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD);
    expect(summary.abcContributionProfit.amountByGrade.A).toBe(result.projection.summary.abcContributionProfitByGrade.A);
    expect(summary.abcContributionProfit.amountByGrade.A).toBeGreaterThan(0);
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
      const attempt = await sellpia.beginAttempt(TEST_ORGANIZATION_ID, 'newer-sellpia-failure');
      await sellpia.failAttempt(TEST_ORGANIZATION_ID, attempt.attemptId, {
        attemptToken: attempt.attemptToken, errorCode: 'COLLECTION_FAILED', errorMessage: 'Provider unavailable',
      });
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
        displayStatus: 'READY', actualCutoffDate: cutoff, officialCutoffDate: cutoff,
        sources: { [source]: {
          ready: true,
          actualCutoff: cutoff,
          latestAttempt: { state: 'FAILED' },
        } },
      } },
      destinations: [{ abc: {
        abcGrade: 'A',
        displayStatus: 'READY',
        actualCutoffDate: cutoff,
        sources: { [source]: { ready: true, latestAttempt: { state: 'FAILED' } } },
      } }],
    });
    const summary = await dashboard.getSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);
    expect(summary.gradeCount).toEqual({ A: 1, B: 0, C: 0 });
    expect(summary.abcStatusCount.READY).toBe(1);
    expect(summary.abcStatusCount.SELLPIA_SOURCE_STALE).toBe(0);
    expect(summary.abcStatusCount.AD_SOURCE_STALE).toBe(0);
  });

  it('retains the grade while mapping-incompatible complete sources expose no actual cutoff or READY', async () => {
    await publishProduct();
    await prisma.masterProductAbcFormulaState.update({ where: { organizationId: TEST_ORGANIZATION_ID }, data: { mappingGeneration: 1n } });
    const result = await inventory.project(TEST_ORGANIZATION_ID, [{
      key: 'OWN', evidence: { productCode: 'SKU-OWN', optionCode: '', barcode: null }, completeMonthly: [],
    }]);
    expect(result.projection.byProductKey.get('OWN')?.inventoryResolution).toMatchObject({
      inventoryProduct: { abc: { abcGrade: 'A', displayStatus: 'SELLPIA_SOURCE_STALE', actualCutoffDate: null } },
    });
    expect(result.projection.summary.abcStatusCounts.READY).toBe(0);
    expect(result.projection.summary.abcCounts).toEqual({ A: 1, B: 0, C: 0 });
    // No actual cutoff means the retained grade's age is unknown. `unknown`
    // and not `unavailable`, so the retained count stays on screen.
    const summary = await dashboard.getSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);
    expect(summary.gradeCount).toEqual({ A: 1, B: 0, C: 0 });
    expect(summary.metricBasis?.['gradeCount.A']).toMatchObject({
      kind: 'snapshot', measured: true, asOf: null,
    });
  });

  async function publishProduct() {
    const product = await prisma.masterProduct.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, code: 'MASTER-OWN', name: 'Own product',
    } });
    const inventoryImportedAt = new Date('2026-09-06T00:00:00.000Z');
    const inventoryRun = await prisma.sourceImportRun.create({ data: {
      organizationId: TEST_ORGANIZATION_ID,
      sourceType: 'sellpia_inventory',
      channelAccountId: null,
      fileName: 'dashboard-inventory.json',
      fileHash: 'd'.repeat(64),
      status: 'completed',
      rowCount: 1,
      importedAt: inventoryImportedAt,
      lastVerifiedAt: inventoryImportedAt,
      verificationCount: 1,
      freshnessGeneration: 1n,
    } });
    const sku = await prisma.sellpiaInventorySku.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, masterProductId: product.id,
      code: 'SKU-OWN', name: 'Own SKU', currentStock: 10,
      lastImportRunId: inventoryRun.id,
    } });
    const account = await prisma.channelAccount.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, channel: 'rocket', name: 'Rocket', status: 'active',
    } });
    const listing = await prisma.channelListing.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, channelAccountId: account.id,
      masterProductId: product.id, externalId: 'LISTING-OWN', status: 'active',
      rawJson: { source: 'wing_app_data', saleStartedAt: '2026-05-01' },
    } });
    const option = await prisma.channelListingOption.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, listingId: listing.id, externalOptionId: 'OPTION-OWN', status: '판매중',
    } });
    await prisma.channelListingOptionInventoryComponent.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, channelListingOptionId: option.id, sellpiaInventorySkuId: sku.id, quantity: 1,
    } });
    await prisma.sellpiaInventoryState.create({ data: {
      organizationId: TEST_ORGANIZATION_ID,
      requestedGeneration: 1n,
      verifiedGeneration: 1n,
      lastVerifiedAt: inventoryImportedAt,
      lastCompletedImportRunId: inventoryRun.id,
    } });
    const attempt = await sellpia.beginAttempt(TEST_ORGANIZATION_ID, 'analytics-own-source');
    const months = attempt.plan.coveredMonths.map((yearMonth) => ({
      yearMonth,
      orderQty: 1,
      orderAmount: 10_000_000,
      inQty: 1,
      inAmount: 1_000_000,
    }));
    await sellpia.submitAttempt(TEST_ORGANIZATION_ID, attempt.attemptId, {
      attemptToken: attempt.attemptToken, parserVersion: 'sellpia-profitability-v2',
      providerBackedEmptyProof: true, coveredMonths: attempt.plan.coveredMonths,
      provenance: { source: 'sellpia_stat_prd_profit', costBasis: 'ORDER_TIME_SUPPLY_COST', vatIncluded: true },
      products: [{ productCode: 'SKU-OWN', optionCode: '', productName: 'Own product', salePrice: 10_000_000, buyPrice: 1_000_000,
        totalOrderAmount: months.length * 10_000_000,
        totalOrderQty: months.length,
        totalInAmount: months.length * 1_000_000,
        totalInQty: months.length,
        months,
      }],
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
    await expect(new MasterProductAbcService(new MasterProductAbcRepositoryAdapter(prisma as never), evidence)
      .recalculate({ organizationId: TEST_ORGANIZATION_ID })).resolves.toMatchObject({ outcome: 'PUBLISHED', classifiedProductCount: 1 });
    return attempt.plan.to;
  }
});

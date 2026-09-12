import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { snapshotStatusOf } from '../../test-helpers/dashboard-basis-assertions';
import {
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
} from '@kiditem/shared/product-abc';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { ProfitabilityAdImportRepositoryAdapter } from '../../advertising/adapter/out/repository/profitability-ad-import.repository.adapter';
import { DashboardInventoryRepositoryAdapter } from '../../analytics/dashboard/adapter/out/repository/dashboard-inventory.repository.adapter';
import { DashboardInventoryService } from '../../analytics/dashboard/application/service/dashboard-inventory.service';
import { buildDashboardContext } from '../../analytics/dashboard/domain/context';
import { SellpiaProductInventoryReader } from '../../analytics/sellpia-product-sales/sellpia-product-inventory-reader';
import { SellpiaProfitabilitySourceService } from '../../analytics/sellpia-product-sales/sellpia-profitability-source.service';
import { MasterProductProfitabilityReadService } from '../../finance/application/service/master-product-profitability-read.service';
import { InventoryAvailabilityRepositoryAdapter } from '../../inventory/adapter/out/repository/inventory-availability.repository.adapter';
import { InventoryAvailabilityService } from '../../inventory/application/service/inventory-availability.service';
import { MasterProductAbcRepositoryAdapter } from '../adapter/out/repository/master-product-abc.repository.adapter';
import { ProductOperationsDataStatusRepositoryAdapter } from '../adapter/out/repository/product-operations-data-status.repository.adapter';
import { ProductOperationsRepositoryAdapter } from '../adapter/out/repository/product-operations.repository.adapter';
import { MasterProductAbcService } from '../application/service/master-product-abc.service';
import { ProductAbcReadService } from '../application/service/product-abc-read.service';
import { ProductOperationsService } from '../application/service/product-operations.service';
import {
  productAbcDisplayStatus,
  productAbcEvidenceCutoff,
} from '../domain/product-abc-display-status';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaClient } from '@prisma/client';

/**
 * ABC display status has no stored column: every read derives it from source
 * evidence. Before ADR 0002 each reader chose its own evidence cutoff, and the
 * dashboard's — the previous month end — asked a materially easier question
 * than Product Hub's, so one product could read `READY` on one screen and
 * `SELLPIA_SOURCE_STALE` on another at the same instant.
 *
 * Which rows count as covered is a database fact, so these lock it against
 * real Postgres rather than against a repository mock told what to answer.
 */
describe('Products publishes one ABC display status (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let sellpia: SellpiaProfitabilitySourceService;
  let advertising: ProfitabilityAdImportRepositoryAdapter;
  let evidence: MasterProductProfitabilityReadService;
  let productAbc: ProductAbcReadService;
  let dashboard: DashboardInventoryService;
  let productHub: ProductOperationsService;
  let sellpiaInventory: SellpiaProductInventoryReader;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    const prismaService = prisma as unknown as PrismaService;
    const alerts = new SourceFailureAlerts(prismaService);
    sellpia = new SellpiaProfitabilitySourceService(prismaService, alerts);
    advertising = new ProfitabilityAdImportRepositoryAdapter(prismaService, alerts);
    evidence = new MasterProductProfitabilityReadService(sellpia, advertising, prismaService);
    productAbc = new ProductAbcReadService(
      new MasterProductAbcRepositoryAdapter(prismaService),
      evidence,
    );
    dashboard = new DashboardInventoryService(
      new DashboardInventoryRepositoryAdapter(
        prismaService,
        productAbc,
        // The panel's rows come from the alerts module, not from this adapter.
        alerts,
      ),
    );
    sellpiaInventory = new SellpiaProductInventoryReader(
      prismaService,
      new InventoryAvailabilityService(
        new InventoryAvailabilityRepositoryAdapter(prismaService),
      ),
      { findDisplayMedia: async () => new Map() },
      productAbc,
    );
    productHub = new ProductOperationsService(
      new ProductOperationsRepositoryAdapter(prismaService),
      new InventoryAvailabilityService(
        new InventoryAvailabilityRepositoryAdapter(prismaService),
      ),
      { findByMasterProductIds: async () => new Map() } as never,
      { findDisplayMedia: async () => new Map() } as never,
      new ProductOperationsDataStatusRepositoryAdapter(prismaService, evidence),
      { readContribution: async () => null } as never,
      { replaceRecipe: async () => ({ masterProductId: null }) } as never,
    );
  });

  it('reports one status for one product across the dashboard, Product Hub and Sellpia inventory', async () => {
    await publishProduct();

    await expect(readEveryDisplayStatus()).resolves.toEqual({
      dashboard: 'READY',
      productHub: 'READY',
      sellpiaInventory: 'READY',
    });
  });

  it('keeps the three reads in agreement once the newest complete source lags', async () => {
    const masterProductId = await publishProduct();
    const laggingCoverageEnd = await lagSellpiaCoverage();

    await expect(readEveryDisplayStatus()).resolves.toEqual({
      dashboard: 'SELLPIA_SOURCE_STALE',
      productHub: 'SELLPIA_SOURCE_STALE',
      sellpiaInventory: 'SELLPIA_SOURCE_STALE',
    });

    // Ask the cutoff the dashboard used to pick for itself and the very same
    // source rows answer READY. That gap is how one product read `READY` on
    // one screen and stale on another; Products owns the question now, so no
    // reader can ask the easier one.
    const easier = await evidence.load({
      organizationId: TEST_ORGANIZATION_ID,
      targetCutoff: laggingCoverageEnd,
    });
    const product = easier.products.find((row) => row.masterProductId === masterProductId);
    expect(productAbcDisplayStatus(
      true,
      product?.mappingValid ?? false,
      easier.sources,
    )).toBe('READY');
  });

  it('publishes the Products-owned evidence cutoff beside the dashboard counts', async () => {
    await publishProduct();
    const ownedCutoff = productAbcEvidenceCutoff(new Date());

    const snapshot = await productAbc.readAbc({
      organizationId: TEST_ORGANIZATION_ID,
      masterProductIds: [],
    });
    const summary = await dashboard.getSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);

    expect(snapshot.targetCutoff).toBe(ownedCutoff);
    // A day-granular cutoff, never a month end. The counts are as-of the day
    // the sources actually reached, which the owned cutoff let them reach in
    // full; the month-end rule would have published a stale month boundary as
    // the age of a current result.
    expect(summary.metricBasis?.['abcStatusCount.READY']).toMatchObject({
      kind: 'snapshot', asOf: ownedCutoff, measured: true,
    });
    expect(snapshotStatusOf(summary.metricBasis?.['abcStatusCount.READY'])).toBe('current');
  });

  async function readEveryDisplayStatus() {
    const summary = await dashboard.getSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);
    const dashboardStatus = Object.entries(summary.abcStatusCount)
      .filter(([, count]) => count > 0)
      .map(([status]) => status);
    const page = await productHub.listProducts(TEST_ORGANIZATION_ID, {
      page: 1, limit: 50, periodDays: 30, activeStatus: 'all',
    });
    const projection = await sellpiaInventory.project(TEST_ORGANIZATION_ID, [{
      key: 'OWN',
      evidence: { productCode: 'SKU-OWN', optionCode: '', barcode: null },
      completeMonthly: [],
    }]);
    const resolution = projection.projection.byProductKey.get('OWN')?.inventoryResolution;
    return {
      dashboard: dashboardStatus.length === 1 ? dashboardStatus[0] : dashboardStatus,
      productHub: page.items.map((item) => item.abc.displayStatus).at(0),
      sellpiaInventory: resolution?.status === 'matched'
        ? resolution.inventoryProduct?.abc.displayStatus
        : null,
    };
  }

  /**
   * Publishes a newer complete Sellpia generation whose coverage stops short
   * of the owned cutoff — a collection that lagged, which is how a source goes
   * stale in production. The coverage end is the previous month end on every
   * day but the first of a month, where that end is already the owned cutoff
   * and no lag would exist.
   */
  async function lagSellpiaCoverage(): Promise<string> {
    const ownedCutoff = productAbcEvidenceCutoff(new Date());
    const dayBefore = addCalendarDays(ownedCutoff, -1);
    const previousMonthEnd = previousMonthEndKst(new Date());
    const coverageEnd = previousMonthEnd < dayBefore ? previousMonthEnd : dayBefore;
    await prisma.sourceImportRun.updateMany({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'sellpia_product_profitability',
        status: 'completed',
      },
      data: { coverageEndDate: new Date(`${coverageEnd}T00:00:00.000Z`) },
    });
    return coverageEnd;
  }

  async function publishProduct() {
    const product = await prisma.masterProduct.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, code: 'MASTER-OWN', name: 'Own product',
    } });
    const importedAt = new Date('2026-09-06T00:00:00.000Z');
    const inventoryRun = await prisma.sourceImportRun.create({ data: {
      organizationId: TEST_ORGANIZATION_ID,
      sourceType: 'sellpia_inventory',
      fileName: 'abc-display-status.json',
      fileHash: 'e'.repeat(64),
      status: 'completed',
      rowCount: 1,
      importedAt,
      lastVerifiedAt: importedAt,
      verificationCount: 1,
      freshnessGeneration: 1n,
    } });
    const sku = await prisma.sellpiaInventorySku.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, masterProductId: product.id,
      code: 'SKU-OWN', name: 'Own SKU', currentStock: 10, lastImportRunId: inventoryRun.id,
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
      organizationId: TEST_ORGANIZATION_ID, listingId: listing.id,
      externalOptionId: 'OPTION-OWN', status: '판매중',
    } });
    await prisma.channelListingOptionInventoryComponent.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, channelListingOptionId: option.id,
      sellpiaInventorySkuId: sku.id, quantity: 1,
    } });
    await prisma.sellpiaInventoryState.create({ data: {
      organizationId: TEST_ORGANIZATION_ID,
      requestedGeneration: 1n,
      verifiedGeneration: 1n,
      lastVerifiedAt: importedAt,
      lastCompletedImportRunId: inventoryRun.id,
    } });
    const attempt = await sellpia.beginAttempt(TEST_ORGANIZATION_ID, 'abc-display-status');
    const months = attempt.plan.coveredMonths.map((yearMonth) => ({
      yearMonth, orderQty: 1, orderAmount: 10_000_000, inQty: 1, inAmount: 1_000_000,
    }));
    await sellpia.submitAttempt(TEST_ORGANIZATION_ID, attempt.attemptId, {
      attemptToken: attempt.attemptToken, parserVersion: 'sellpia-profitability-v2',
      providerBackedEmptyProof: true, coveredMonths: attempt.plan.coveredMonths,
      provenance: { source: 'sellpia_stat_prd_profit', costBasis: 'ORDER_TIME_SUPPLY_COST', vatIncluded: true },
      products: [{
        productCode: 'SKU-OWN', optionCode: '', productName: 'Own product',
        salePrice: 10_000_000, buyPrice: 1_000_000,
        totalOrderAmount: months.length * 10_000_000,
        totalOrderQty: months.length,
        totalInAmount: months.length * 1_000_000,
        totalInQty: months.length,
        months,
      }],
    });
    const ad = await advertising.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID, idempotencyKey: 'abc-display-status-ad',
    });
    await advertising.finalizeAttempt({
      organizationId: TEST_ORGANIZATION_ID, attemptId: ad.attemptId, attemptToken: ad.attemptToken,
    });
    const formula = await prisma.masterProductAbcFormulaVersion.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, formulaKey: 'PRODUCT_ABC_ABSOLUTE',
      version: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.version,
      formulaChecksum: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
      formulaJson: JSON.parse(JSON.stringify(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD)),
    } });
    await prisma.masterProductAbcFormulaState.upsert({
      where: { organizationId: TEST_ORGANIZATION_ID },
      create: { organizationId: TEST_ORGANIZATION_ID, activeFormulaVersionId: formula.id, formulaRevision: 1 },
      update: { activeFormulaVersionId: formula.id, formulaRevision: 1 },
    });
    await expect(new MasterProductAbcService(
      new MasterProductAbcRepositoryAdapter(prisma as never), evidence,
    ).recalculate({ organizationId: TEST_ORGANIZATION_ID }))
      .resolves.toMatchObject({ outcome: 'PUBLISHED', classifiedProductCount: 1 });
    return product.id;
  }
});

/** The cutoff the dashboard's inventory adapter used to derive for itself. */
function previousMonthEndKst(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1_000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 0))
    .toISOString()
    .slice(0, 10);
}

function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

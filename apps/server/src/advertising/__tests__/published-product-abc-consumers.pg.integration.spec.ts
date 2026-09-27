import { AdLedgerReadPersistenceAdapter } from '../adapter/out/persistence/ad-ledger-read.persistence.adapter';
import { seedAdCampaign, seedAdProductDays, seedAdReportRun } from '../../test-helpers/ad-ledger-seeds';
import { profitCatalogTestReaders } from '../../test-helpers/channel-fact-ports';
import { channelFactTestPorts } from '../../test-helpers/channel-fact-ports';
import type { PrismaClient } from '@prisma/client';
import {
  PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD,
  PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD_HASH,
} from '@kiditem/shared/product-abc';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../test-helpers/real-prisma';
import { AdActionRepositoryAdapter } from '../adapter/out/repository/ad-action.repository.adapter';
import { AdListingRepositoryAdapter } from '../adapter/out/repository/ad-listing.repository.adapter';
import { AdStrategyContextRepositoryAdapter } from '../adapter/out/repository/ad-strategy-context.repository.adapter';
import { KeywordRankRepositoryAdapter } from '../adapter/out/repository/keyword-rank.repository.adapter';
import { seedSourceProduct } from '../../test-helpers/inventory-seeds';
import { ProductTransactionalReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-transactional-read.repository.adapter';

describe('Advertising published product ABC consumers (PostgreSQL)', () => {
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

  it('reads no ABC official cutoff before Products publishes', async () => {
    await expect(new AdListingRepositoryAdapter(channelFactTestPorts(prisma as never).listings, channelFactTestPorts(prisma as never).recipes, prisma as never).findScopedAdListingsWithAbcCutoff(ORG, []))
      .resolves.toEqual({ listings: new Map(), abcOfficialCutoffDate: null });
  });

  it('hydrates every advertising grade consumer from the retained Products publication', async () => {
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: ORG,
        channel: 'coupang',
        name: 'Published ABC advertising account',
        status: 'active',
      },
    });
    const product = await seedSourceProduct(prisma, {
      organizationId: ORG,
      code: 'ABC-AD-CONSUMER',
      name: 'Published A product',
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: ORG,
        channelAccountId: account.id,
        externalId: 'SELLER-PRODUCT-1',
        channelName: 'Wing product',
        status: 'active',
      },
    });
    const option = await prisma.channelListingOption.create({
      data: {
        organizationId: ORG,
        listingId: listing.id,
        externalOptionId: 'VENDOR-ITEM-1',
        itemName: '1개',
        salePrice: 12_000,
        status: '판매중',
      },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: ORG,
        channelListingOptionId: option.id,
        masterProductId: product.id,
        quantity: 1,
      },
    });
    const sellpiaRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: ORG,
        sourceType: 'sellpia_product_profitability',
        status: 'completed',
      },
    });
    const formula = await prisma.masterProductAbcFormulaVersion.create({
      data: {
        organizationId: ORG,
        formulaKey: PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD.formulaKey,
        version: 1,
        formulaJson: JSON.parse(JSON.stringify(PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD)),
        formulaChecksum: PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD_HASH,
      },
    });
    const cutoff = new Date('2026-08-31T00:00:00.000Z');
    await prisma.masterProductAbcFormulaState.create({
      data: {
        organizationId: ORG,
        activeFormulaVersionId: formula.id,
        formulaRevision: 1,
        publicationRevision: 1,
        officialCutoffDate: cutoff,
        publishedAt: new Date('2026-09-01T00:00:00.000Z'),
        publishedSellpiaOperationId: sellpiaRun.id,
        publishedMappingGeneration: 0n,
        mappingGeneration: 0n,
      },
    });
    await prisma.masterProductAbcEvaluation.create({
      data: {
        organizationId: ORG,
        masterProductId: product.id,
        formulaVersionId: formula.id,
        abcGrade: 'A',
        weightedRevenue: 10_000_000,
        weightedOrderTimeSupplyCost: 6_000_000,
        weightedOperatingProfit: 3_000_000,
        operatingProfitVelocity30: 3_000_000,
        operatingMargin: 0.3,
        lossPersistence: 0,
        profitScore: 100,
        marginScore: 100,
        consistencyScore: 100,
        economicScore: 100,
        validObservationDays: 30,
        formulaRevision: 1,
        publicationRevision: 1,
        gradeBasisCutoffDate: cutoff,
        saleStartDate: new Date('2026-01-01T00:00:00.000Z'),
        sellpiaOperationId: sellpiaRun.id,
        sellpiaGeneration: 1n,
        mappingGeneration: 0n,
      },
    });

    const adReport = await seedAdReportRun(prisma, {
      organizationId: ORG, channelAccountId: account.id, start: '2026-08-31', end: '2026-08-31',
    });
    await seedAdCampaign(prisma, {
      organizationId: ORG, channelAccountId: account.id, operationId: adReport.id, campaignId: 'campaign-1', name: 'Campaign', budget: 10_000,
    });
    await seedAdProductDays(prisma, [{
      organizationId: ORG, channelAccountId: account.id, operationId: adReport.id, date: '2026-08-31',
      campaignId: 'campaign-1', vendorItemId: option.externalOptionId, listingId: listing.id, spend: 1_000,
    }]);

    const listingReader = new AdListingRepositoryAdapter(channelFactTestPorts(prisma as never).listings, channelFactTestPorts(prisma as never).recipes,
      prisma as never,
      new ProductTransactionalReadRepositoryAdapter(),
    );
    const keywordReader = new KeywordRankRepositoryAdapter(channelFactTestPorts(prisma as never).listings, channelFactTestPorts(prisma as never).recipes,
      prisma as never,
      new ProductTransactionalReadRepositoryAdapter(),
    );
    const actionReader = new AdActionRepositoryAdapter(channelFactTestPorts(prisma as never).listings, channelFactTestPorts(prisma as never).recipes, prisma as never, listingReader, profitCatalogTestReaders(prisma as never).accounts, new AdLedgerReadPersistenceAdapter());

    expect((await listingReader.findScopedAdListings(ORG, [listing.id]))
      .get(listing.id)?.masterProduct.abcGrade).toBe('A');
    const snapshot = await listingReader.findScopedAdListingsWithAbcCutoff(ORG, [listing.id]);
    expect(snapshot.listings.get(listing.id)?.masterProduct.abcGrade).toBe('A');
    expect(snapshot.abcOfficialCutoffDate).toBe('2026-08-31');
    // Without an advertised listing the snapshot still carries the cutoff.
    await expect(listingReader.findScopedAdListingsWithAbcCutoff(ORG, []))
      .resolves.toMatchObject({ abcOfficialCutoffDate: '2026-08-31' });
    expect((await keywordReader.listOwnVendorItems(ORG))[0]).toMatchObject({
      vendorItemId: option.externalOptionId,
      productName: 'Wing product',
      abcGrade: 'A',
    });
    expect((await actionReader.findRuleTargets(ORG))[0]).toMatchObject({
      targetType: 'campaign',
      listingId: listing.id,
      vendorItemIds: [option.externalOptionId],
      abcGrade: 'A',
    });
  });
});

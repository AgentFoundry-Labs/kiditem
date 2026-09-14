import type { PrismaClient } from '@prisma/client';
import {
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
} from '@kiditem/shared/product-abc';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../test-helpers/real-prisma';
import { AdActionRepositoryAdapter } from '../adapter/out/repository/ad-action.repository.adapter';
import { AdCampaignRepositoryAdapter } from '../adapter/out/repository/ad-campaign.repository.adapter';
import { AdListingRepositoryAdapter } from '../adapter/out/repository/ad-listing.repository.adapter';
import { AdStrategyContextRepositoryAdapter } from '../adapter/out/repository/ad-strategy-context.repository.adapter';
import { KeywordRankRepositoryAdapter } from '../adapter/out/repository/keyword-rank.repository.adapter';

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

  it('hydrates every advertising grade consumer from the retained Products publication', async () => {
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: ORG,
        channel: 'coupang',
        name: 'Published ABC advertising account',
        status: 'active',
      },
    });
    const product = await prisma.masterProduct.create({
      data: {
        organizationId: ORG,
        code: 'ABC-AD-CONSUMER',
        name: 'Published A product',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: ORG,
        channelAccountId: account.id,
        masterProductId: product.id,
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
    const sellpiaRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: ORG,
        sourceType: 'sellpia_product_profitability',
        status: 'completed',
      },
    });
    const advertisingRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: ORG,
        sourceType: 'coupang_ad_profitability',
        status: 'completed',
      },
    });
    const formula = await prisma.masterProductAbcFormulaVersion.create({
      data: {
        organizationId: ORG,
        formulaKey: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.formulaKey,
        version: 1,
        formulaJson: JSON.parse(JSON.stringify(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD)),
        formulaChecksum: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
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
        publishedSellpiaSourceImportRunId: sellpiaRun.id,
        publishedAdvertisingSourceImportRunId: advertisingRun.id,
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
        weightedAdvertisingSpend: 1_000_000,
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
        sellpiaSourceImportRunId: sellpiaRun.id,
        advertisingSourceImportRunId: advertisingRun.id,
        sellpiaGeneration: 1n,
        advertisingGeneration: 1n,
        mappingGeneration: 0n,
      },
    });

    const campaignSweep = await prisma.sourceImportRun.create({
      data: {
        organizationId: ORG,
        channelAccountId: account.id,
        sourceType: 'coupang_ad_campaign',
        parserVersion: 'ad-campaign-v1',
        status: 'completed',
        freshnessGeneration: 1n,
        plan: { captureMode: 'campaign_sweep' },
        coverageStartDate: new Date('2026-08-31T00:00:00.000Z'),
        coverageEndDate: new Date('2026-08-31T00:00:00.000Z'),
      },
    });
    await prisma.channelAdTargetDailySnapshot.create({
      data: {
        organizationId: ORG,
        channelAccountId: account.id,
        channel: 'coupang',
        businessDate: new Date('2026-08-31T00:00:00.000Z'),
        listingId: listing.id,
        listingOptionId: option.id,
        externalId: listing.externalId,
        externalOptionId: option.externalOptionId,
        targetType: 'product',
        targetKey: 'product:SELLER-PRODUCT-1',
        campaignId: 'campaign-1',
        campaignName: 'Campaign',
        spend: 1_000,
        sourceImportRunId: campaignSweep.id,
        metaJson: { data: { productName: 'Published A product' } },
      },
    });

    const listingReader = new AdListingRepositoryAdapter(prisma as never);
    const campaignReader = new AdCampaignRepositoryAdapter(prisma as never);
    const keywordReader = new KeywordRankRepositoryAdapter(prisma as never);
    const actionReader = new AdActionRepositoryAdapter(prisma as never, listingReader);

    expect((await listingReader.findScopedAdListings(ORG, [listing.id]))
      .get(listing.id)?.masterProduct.abcGrade).toBe('A');
    expect((await keywordReader.listOwnVendorItems(ORG))[0]).toMatchObject({
      vendorItemId: option.externalOptionId,
      productName: 'Wing product',
      abcGrade: 'A',
    });
    expect((await actionReader.findLatestTargetRows(ORG))[0]).toMatchObject({
      listingId: listing.id,
      listingOptionId: option.id,
      abcGrade: 'A',
    });
  });
});

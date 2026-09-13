import type { PrismaClient } from '@prisma/client';
import {
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
} from '@kiditem/shared/product-abc';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { findAutoBatchCandidates } from '../../ai/adapter/out/repository/thumbnail-generation-ledger.query';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { buildPerListingProfit } from '../../common/per-listing-profit';
import { ReviewsService } from '../../orders/services/reviews.service';
import { RulesService } from '../../rules/services/rules.service';
import { seedCompletedOrderCoverageRun, seedOrderWithLineItems } from '../../test-helpers/finance-seeds';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';

describe('published ABC dependent consumers (PostgreSQL)', () => {
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

  it('evaluates Rules against one publication while ABC is replaced between its reads', async () => {
    const product = await prisma.masterProduct.create({ data: {
      organizationId: ORG,
      code: 'RULES-PUBLICATION-RACE',
      name: 'Rules publication race',
    } });
    await seedOfficialEvaluation(prisma, product.id);
    await prisma.businessRule.create({ data: {
      organizationId: ORG,
      name: 'official-a-race',
      displayName: 'Review official A',
      category: 'advertising',
      severity: 'critical',
      field: 'abcGrade',
      operator: 'eq',
      threshold: { value: 'A' },
      messageTemplate: 'Grade {{value}}',
      actionType: 'review_grade',
    } });

    let replaced = false;
    const concurrentPrisma = prisma.$extends({ query: {
      masterProductAbcFormulaState: {
        async findUnique({ args, query }) {
          const state = await query(args);
          if (!replaced) {
            replaced = true;
            await prisma.$transaction(async (tx) => {
              await tx.masterProductAbcFormulaState.update({
                where: { organizationId: ORG },
                data: { publicationRevision: 2 },
              });
              await tx.masterProductAbcEvaluation.updateMany({
                where: { organizationId: ORG, masterProductId: product.id },
                data: { abcGrade: 'C', publicationRevision: 2 },
              });
            });
          }
          return state;
        },
      },
    } });
    const rules = new RulesService(
      concurrentPrisma as never,
      new SourceFailureAlerts(prisma as never),
    );
    const request = {
      organizationId: ORG,
      requestedByUserId: TEST_USER_ID,
      idempotencyKey: 'rules-publication-race',
    };
    const result = await rules.evaluateAll(request);

    expect(replaced).toBe(true);
    expect(result).toMatchObject({ productCount: 1, violationCount: 1, criticalCount: 1 });
    await expect(rules.evaluateAll(request)).resolves.toEqual(result);
  });

  it('keeps candidate filters, review labels, Rules inputs, and profit metadata on the official grade', async () => {
    const account = await prisma.channelAccount.create({ data: {
      organizationId: ORG,
      channel: 'coupang',
      name: 'ABC dependent consumers',
      status: 'active',
    } });
    const officialA = await prisma.masterProduct.create({ data: {
      organizationId: ORG,
      code: 'OFFICIAL-A',
      name: 'Official A',
      abcGrade: null,
    } });
    const staleCacheA = await prisma.masterProduct.create({ data: {
      organizationId: ORG,
      code: 'STALE-CACHE-A',
      name: 'Stale cache A',
      abcGrade: 'A',
    } });
    const listing = await prisma.channelListing.create({ data: {
      organizationId: ORG,
      channelAccountId: account.id,
      masterProductId: officialA.id,
      externalId: 'OFFICIAL-A-LISTING',
      channelName: 'Official A listing',
      status: 'active',
    } });
    const staleListing = await prisma.channelListing.create({ data: {
      organizationId: ORG,
      channelAccountId: account.id,
      masterProductId: staleCacheA.id,
      externalId: 'STALE-A-LISTING',
      channelName: 'Stale A listing',
      status: 'active',
    } });
    const option = await prisma.channelListingOption.create({ data: {
      organizationId: ORG,
      listingId: listing.id,
      externalOptionId: 'OFFICIAL-A-OPTION',
      salePrice: 12_000,
      costPriceOverride: 4_000,
      commissionRate: 0.1,
      otherCost: 0,
      status: '판매중',
    } });
    await prisma.thumbnail.createMany({ data: [
      { organizationId: ORG, listingId: listing.id, imageUrl: 'https://example.com/a.jpg' },
      { organizationId: ORG, listingId: staleListing.id, imageUrl: 'https://example.com/stale.jpg' },
    ] });
    const workspace = await prisma.contentWorkspace.create({ data: {
      organizationId: ORG,
      ownerType: 'channel_listing',
      channelListingId: listing.id,
      displayName: 'Official A workspace',
      normalizedTitle: 'official-a-workspace',
    } });
    await prisma.contentWorkspace.create({ data: {
      organizationId: ORG,
      ownerType: 'channel_listing',
      channelListingId: staleListing.id,
      displayName: 'Stale cache workspace',
      normalizedTitle: 'stale-cache-workspace',
    } });
    await seedOfficialEvaluation(prisma, officialA.id);

    const reviewRun = await prisma.sourceImportRun.create({ data: {
      organizationId: ORG,
      channelAccountId: account.id,
      sourceType: 'coupang_reviews',
      status: 'completed',
      importedAt: new Date('2026-09-01T01:00:00.000Z'),
    } });
    await prisma.review.create({ data: {
      organizationId: ORG,
      sourceImportRunId: reviewRun.id,
      listingId: listing.id,
      platform: 'coupang',
      externalReviewId: 'OFFICIAL-A-REVIEW',
      externalOptionId: option.externalOptionId,
      rating: 5,
      content: 'Published grade review',
      reviewedAt: new Date('2026-09-01T00:00:00.000Z'),
    } });
    await seedOrderWithLineItems(prisma, {
      organizationId: ORG,
      externalOrderId: 'OFFICIAL-A-ORDER',
      orderedAt: '2026-08-20T01:00:00.000Z',
      lineItems: [{
        quantity: 1,
        totalPrice: 12_000,
        optionId: option.externalOptionId,
        listingOptionId: option.id,
      }],
    });
    // Per-listing profit reads only orders a completed Orders collection published.
    await seedCompletedOrderCoverageRun(prisma, {
      organizationId: ORG,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });
    await prisma.businessRule.create({ data: {
      organizationId: ORG,
      name: 'official-a-rule',
      displayName: 'Official A rule',
      category: 'advertising',
      severity: 'warning',
      field: 'abcGrade',
      operator: 'eq',
      threshold: { value: 'A' },
      messageTemplate: 'Grade {{value}}',
      actionType: 'review_grade',
    } });

    await expect(findAutoBatchCandidates(prisma as never, ORG, 10))
      .resolves.toEqual([{ id: workspace.id }]);
    await expect(new ReviewsService(prisma as never).list(ORG, {}))
      .resolves.toMatchObject({ items: [{ listingId: listing.id, grade: 'A' }] });
    await expect(new RulesService(
      prisma as never,
      new SourceFailureAlerts(prisma as never),
    ).evaluateAll({
      organizationId: ORG,
      requestedByUserId: TEST_USER_ID,
      idempotencyKey: 'published-grade-rule',
    })).resolves.toMatchObject({ productCount: 2, violationCount: 1 });
    await expect(buildPerListingProfit(
      prisma as never,
      ORG,
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-09-01T00:00:00.000Z'),
      { hasAdAccount: true, publishedDates: 31, accountSpend: 0, coversWindow: true },
    )).resolves.toEqual([
      expect.objectContaining({ listingId: listing.id, grade: 'A' }),
    ]);
  });
});

async function seedOfficialEvaluation(prisma: PrismaClient, masterProductId: string) {
  const formula = await prisma.masterProductAbcFormulaVersion.create({ data: {
    organizationId: ORG,
    formulaKey: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.formulaKey,
    version: 1,
    formulaJson: JSON.parse(JSON.stringify(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD)),
    formulaChecksum: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
  } });
  const sellpia = await prisma.sourceImportRun.create({ data: {
    organizationId: ORG,
    sourceType: 'sellpia_product_profitability',
    status: 'completed',
  } });
  const advertising = await prisma.sourceImportRun.create({ data: {
    organizationId: ORG,
    sourceType: 'coupang_ad_profitability',
    status: 'completed',
  } });
  const cutoff = new Date('2026-08-31T00:00:00.000Z');
  await prisma.masterProductAbcFormulaState.create({ data: {
    organizationId: ORG,
    activeFormulaVersionId: formula.id,
    formulaRevision: 1,
    publicationRevision: 1,
    officialCutoffDate: cutoff,
    publishedAt: new Date('2026-09-01T00:00:00.000Z'),
    publishedSellpiaSourceImportRunId: sellpia.id,
    publishedAdvertisingSourceImportRunId: advertising.id,
    publishedMappingGeneration: 0n,
    mappingGeneration: 0n,
  } });
  await prisma.masterProductAbcEvaluation.create({ data: {
    organizationId: ORG,
    masterProductId,
    formulaVersionId: formula.id,
    abcGrade: 'A',
    weightedRevenue: 10_000,
    weightedOrderTimeSupplyCost: 4_000,
    weightedAdvertisingSpend: 0,
    weightedOperatingProfit: 6_000,
    operatingProfitVelocity30: 6_000,
    operatingMargin: 0.6,
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
    sellpiaSourceImportRunId: sellpia.id,
    advertisingSourceImportRunId: advertising.id,
    sellpiaGeneration: 1n,
    advertisingGeneration: 1n,
    mappingGeneration: 0n,
  } });
}

import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SellpiaInventorySkuReadRepositoryAdapter } from '../../inventory/adapter/out/repository/sellpia-inventory-sku-read.repository.adapter';
import { SellpiaInventorySkuReadService } from '../../inventory/application/service/sellpia-inventory-sku-read.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { ProductOperationsRepositoryAdapter } from '../../products/adapter/out/repository/product-operations.repository.adapter';
import { ProductVariantRecipeAutomationService } from '../../products/application/service/product-variant-recipe-automation.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { SellpiaRecipeEvidenceAdapter } from '../adapter/out/inventory/sellpia-recipe-evidence.adapter';
import { ChannelRecipeAutomationContextRepositoryAdapter } from '../adapter/out/repository/channel-recipe-automation-context.repository.adapter';
import { ChannelRecipeSuggestionContextRepositoryAdapter } from '../adapter/out/repository/channel-recipe-suggestion-context.repository.adapter';
import { ChannelRecipeAutomationService } from '../application/service/channel-recipe-automation.service';
import { ChannelRecipeSuggestionService } from '../application/service/channel-recipe-suggestion.service';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';

describe('ChannelRecipeAutomationService (PG integration)', () => {
  let prisma: PrismaClient;
  let service: ChannelRecipeAutomationService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    const evidence = new SellpiaRecipeEvidenceAdapter(
      new SellpiaInventorySkuReadService(
        new SellpiaInventorySkuReadRepositoryAdapter(prismaService),
      ),
    );
    service = new ChannelRecipeAutomationService(
      new ChannelRecipeAutomationContextRepositoryAdapter(prismaService),
      new ChannelRecipeSuggestionService(
        new ChannelRecipeSuggestionContextRepositoryAdapter(prismaService),
        evidence,
      ),
      new ProductVariantRecipeAutomationService(
        new ProductOperationsRepositoryAdapter(prismaService),
      ),
    );
  });

  afterAll(async () => { await prisma?.$disconnect(); });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.createMany({ data: [
      { id: ACCOUNT_ID, organizationId: TEST_ORGANIZATION_ID, channel: 'coupang', name: 'Wing' },
      { id: OTHER_ACCOUNT_ID, organizationId: OTHER_ORGANIZATION_ID, channel: 'coupang', name: 'Other' },
    ] });
  });

  it('previews without mutation and applies only empty deterministic quantity-one recipes', async () => {
    const auto = await createVariant('AUTO');
    const review = await createVariant('REVIEW');
    const conflict = await createVariant('CONFLICT');
    const ambiguous = await createVariant('AMBIGUOUS');
    const duplicateName = await createVariant('DUP-NAME');
    const noMatch = await createVariant('NO-MATCH');
    const configured = await createVariant('CONFIGURED');

    const autoSku = await createSku('SP-AUTO', 'Physical auto', null, null, 9);
    await createSku('SP-REVIEW', 'Physical review', null, null, 8);
    await createSku('SP-CONFLICT-A', 'Conflict A', null, null, 7);
    await createSku('SP-CONFLICT-B', 'Conflict B', null, null, 6);
    await createSku('SP-BAR-A', 'Barcode A', null, '001234567890', 5);
    await createSku('SP-BAR-B', 'Barcode B', null, '001-2345-6789-0', 4);
    await createSku('SP-NAME-A', 'Exact duplicate', null, null, 3);
    await createSku('SP-NAME-B', 'Exact duplicate', null, null, 2);
    const configuredSku = await createSku('SP-CONFIGURED', 'Configured', null, null, 1);

    await createOption(auto, { sellerSku: 'SP-AUTO', displayName: 'Auto listing' });
    await createOption(review, { sellerSku: 'SP-REVIEW', itemName: '블루 4개입' });
    await createOption(conflict, { sellerSku: 'SP-CONFLICT-A', modelNumber: 'SP-CONFLICT-B' });
    await createOption(ambiguous, { barcode: '001234567890' });
    await createOption(duplicateName, { displayName: 'Exact duplicate' });
    await createOption(noMatch, { displayName: 'Nothing matches' });
    await createOption(configured, { sellerSku: 'SP-CONFIGURED' });
    const configuredComponent = await prisma.productVariantComponent.create({ data: {
      organizationId: TEST_ORGANIZATION_ID,
      productVariantId: configured,
      sellpiaInventorySkuId: configuredSku,
      quantity: 2,
      source: 'manual',
      confirmedBy: TEST_USER_ID,
      confirmedAt: new Date('2026-07-18T00:00:00.000Z'),
    } });
    const stockBefore = await stockSnapshot();
    const componentCountBefore = await prisma.productVariantComponent.count();

    const preview = await service.preview(TEST_ORGANIZATION_ID, ACCOUNT_ID);

    expect(preview.summary).toEqual({
      variants: 7,
      affectedOptions: 7,
      autoApply: 1,
      operatorReview: 1,
      blocked: 4,
      alreadyConfigured: 1,
    });
    expect(await prisma.productVariantComponent.count()).toBe(componentCountBefore);
    expect(await stockSnapshot()).toEqual(stockBefore);
    expect(preview.items.find((item) => item.productVariantId === auto)).toMatchObject({
      decision: 'auto_apply', sellpiaInventorySkuId: autoSku, recommendedQuantity: 1,
    });
    expect(preview.items.find((item) => item.productVariantId === configured))
      .toMatchObject({ decision: 'already_configured', evidenceLabels: ['source: manual'] });

    await expect(service.apply(TEST_ORGANIZATION_ID, {
      channelAccountId: ACCOUNT_ID,
      proposalVersion: preview.proposalVersion,
    })).resolves.toMatchObject({ appliedVariants: 1, affectedOptions: 1 });
    expect(await prisma.productVariantComponent.findMany({
      where: { productVariantId: auto },
    })).toEqual([expect.objectContaining({
      sellpiaInventorySkuId: autoSku,
      quantity: 1,
      source: 'deterministic',
      confirmedBy: null,
    })]);
    for (const variantId of [review, conflict, ambiguous, duplicateName, noMatch]) {
      expect(await prisma.productVariantComponent.count({
        where: { productVariantId: variantId },
      })).toBe(0);
    }
    expect(await prisma.productVariantComponent.findUniqueOrThrow({
      where: { id: configuredComponent.id },
    })).toEqual(configuredComponent);
    expect(await stockSnapshot()).toEqual(stockBefore);

    const refreshed = await service.preview(TEST_ORGANIZATION_ID, ACCOUNT_ID);
    await expect(service.apply(TEST_ORGANIZATION_ID, {
      channelAccountId: ACCOUNT_ID,
      proposalVersion: refreshed.proposalVersion,
    })).resolves.toMatchObject({ appliedVariants: 0, affectedOptions: 0 });
    await expect(service.apply(TEST_ORGANIZATION_ID, {
      channelAccountId: ACCOUNT_ID,
      proposalVersion: '0'.repeat(64),
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns no preview rows for a foreign account under the current organization', async () => {
    await expect(service.preview(TEST_ORGANIZATION_ID, OTHER_ACCOUNT_ID))
      .resolves.toMatchObject({ items: [], summary: { variants: 0 } });
  });

  async function createVariant(label: string) {
    const master = await prisma.masterProduct.create({ data: {
      organizationId: TEST_ORGANIZATION_ID,
      code: `MP-${label}-${randomUUID()}`,
      name: label,
    } });
    return (await prisma.productVariant.create({ data: {
      organizationId: TEST_ORGANIZATION_ID,
      masterProductId: master.id,
      code: `PV-${label}-${randomUUID()}`,
      name: label,
    } })).id;
  }

  async function createSku(
    code: string,
    name: string,
    optionName: string | null,
    barcode: string | null,
    currentStock: number,
  ) {
    return (await prisma.sellpiaInventorySku.create({ data: {
      organizationId: TEST_ORGANIZATION_ID,
      code,
      name,
      optionName,
      barcode,
      currentStock,
    } })).id;
  }

  async function createOption(productVariantId: string, input: {
    sellerSku?: string | null;
    modelNumber?: string | null;
    barcode?: string | null;
    displayName?: string;
    itemName?: string | null;
  }) {
    const listing = await prisma.channelListing.create({ data: {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: ACCOUNT_ID,
      externalId: randomUUID(),
      displayName: input.displayName ?? randomUUID(),
    } });
    return prisma.channelListingOption.create({ data: {
      organizationId: TEST_ORGANIZATION_ID,
      listingId: listing.id,
      externalOptionId: randomUUID(),
      productVariantId,
      sellerSku: input.sellerSku ?? null,
      modelNumber: input.modelNumber ?? null,
      barcode: input.barcode ?? null,
      itemName: input.itemName ?? null,
      rawJson: { source: 'coupang_catalog_browser' },
    } });
  }

  async function stockSnapshot() {
    return prisma.sellpiaInventorySku.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
      select: { id: true, currentStock: true },
      orderBy: { id: 'asc' },
    });
  }
});

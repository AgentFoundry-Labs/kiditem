import { NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { SellpiaInventorySkuReadRepositoryAdapter } from '../../inventory/adapter/out/repository/sellpia-inventory-sku-read.repository.adapter';
import { SellpiaInventorySkuReadService } from '../../inventory/application/service/sellpia-inventory-sku-read.service';
import { SellpiaRecipeEvidenceAdapter } from '../adapter/out/inventory/sellpia-recipe-evidence.adapter';
import { ChannelRecipeSuggestionContextRepositoryAdapter } from '../adapter/out/repository/channel-recipe-suggestion-context.repository.adapter';
import { ChannelRecipeSuggestionService } from '../application/service/channel-recipe-suggestion.service';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';

describe('ChannelRecipeSuggestionService (PG integration)', () => {
  let prisma: PrismaClient;
  let service: ChannelRecipeSuggestionService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    const read = new SellpiaInventorySkuReadService(
      new SellpiaInventorySkuReadRepositoryAdapter(prismaService),
    );
    service = new ChannelRecipeSuggestionService(
      new ChannelRecipeSuggestionContextRepositoryAdapter(prismaService),
      new SellpiaRecipeEvidenceAdapter(read),
    );
  });

  afterAll(async () => { await prisma?.$disconnect(); });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.createMany({ data: [
      { id: ACCOUNT_ID, organizationId: TEST_ORGANIZATION_ID, channel: 'coupang', name: 'Wing' },
      { id: OTHER_ACCOUNT_ID, organizationId: OTHER_ORGANIZATION_ID, channel: 'coupang', name: 'Other Wing' },
    ] });
  });

  it('scopes lookup to the organization and proposes exact code evidence without writing a recipe', async () => {
    const product = await createProduct(TEST_ORGANIZATION_ID, 'KI-UNIQUE');
    const option = await createOption({ productVariantId: product.variantId, sellerSku: 'SP-UNIQUE' });
    const foreign = await createOption({
      organizationId: OTHER_ORGANIZATION_ID, accountId: OTHER_ACCOUNT_ID, productVariantId: null, externalId: 'OTHER',
    });
    const sku = await prisma.sellpiaInventorySku.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, code: 'SP-UNIQUE', name: 'Unique stock', currentStock: 8,
    } });
    const beforeComponents = await prisma.productVariantComponent.count();

    await expect(service.suggest(TEST_ORGANIZATION_ID, option.id)).resolves.toMatchObject({
      status: 'unique_code', proposals: [{ sellpiaInventorySkuId: sku.id, requiresQuantityConfirmation: true }],
    });
    await expect(service.suggest(TEST_ORGANIZATION_ID, foreign.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.productVariantComponent.count()).toBe(beforeComponents);
  });

  it('reports a single option seller SKU and model number conflict without writing a recipe', async () => {
    const product = await createProduct(TEST_ORGANIZATION_ID, 'KI-MODEL-CONFLICT');
    const option = await createOption({
      productVariantId: product.variantId,
      externalId: 'MODEL-CONFLICT',
      sellerSku: 'SP-SELLER',
      modelNumber: 'SP-MODEL',
    });
    const [sellerSku, modelSku] = await Promise.all([
      prisma.sellpiaInventorySku.create({ data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SP-SELLER',
        name: 'Seller candidate',
        currentStock: 4,
      } }),
      prisma.sellpiaInventorySku.create({ data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SP-MODEL',
        name: 'Model candidate',
        currentStock: 5,
      } }),
    ]);
    const beforeComponents = await prisma.productVariantComponent.count();

    const result = await service.suggest(TEST_ORGANIZATION_ID, option.id);

    expect(result.status).toBe('conflict');
    expect(result.proposals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sellpiaInventorySkuId: sellerSku.id,
        evidence: [expect.objectContaining({ kind: 'seller_sku_code', channelValue: 'SP-SELLER' })],
      }),
      expect.objectContaining({
        sellpiaInventorySkuId: modelSku.id,
        evidence: [expect.objectContaining({ kind: 'model_number_code', channelValue: 'SP-MODEL' })],
      }),
    ]));
    expect(await prisma.productVariantComponent.count()).toBe(beforeComponents);
  });

  it('reports shared-variant code conflicts, preserves existing recipes, and keeps names review-only', async () => {
    const product = await createProduct(TEST_ORGANIZATION_ID, 'KI-CONFLICT');
    const first = await createOption({ productVariantId: product.variantId, sellerSku: 'SP-A' });
    await createOption({ productVariantId: product.variantId, sellerSku: 'SP-B', externalId: 'SECOND' });
    await prisma.sellpiaInventorySku.createMany({ data: [
      { organizationId: TEST_ORGANIZATION_ID, code: 'SP-A', name: 'Name only', currentStock: 4 },
      { organizationId: TEST_ORGANIZATION_ID, code: 'SP-B', name: 'Other', currentStock: 5 },
    ] });
    await expect(service.suggest(TEST_ORGANIZATION_ID, first.id)).resolves.toMatchObject({ status: 'conflict' });

    const configured = await createProduct(TEST_ORGANIZATION_ID, 'KI-CONFIGURED');
    const configuredOption = await createOption({ productVariantId: configured.variantId, sellerSku: 'SP-A', externalId: 'CONFIGURED' });
    const configuredSku = await prisma.sellpiaInventorySku.findFirstOrThrow({ where: { organizationId: TEST_ORGANIZATION_ID, code: 'SP-A' } });
    await prisma.productVariantComponent.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, productVariantId: configured.variantId,
      sellpiaInventorySkuId: configuredSku.id, quantity: 2, source: 'manual',
    } });
    await expect(service.suggest(TEST_ORGANIZATION_ID, configuredOption.id)).resolves.toMatchObject({
      status: 'already_configured', proposals: [],
    });

    const named = await createProduct(TEST_ORGANIZATION_ID, 'KI-NAMED');
    const namedOption = await createOption({ productVariantId: named.variantId, sellerSku: null, externalId: 'NAMED', displayName: ' Name only ' });
    await expect(service.suggest(TEST_ORGANIZATION_ID, namedOption.id)).resolves.toMatchObject({
      status: 'name_review_only',
      proposals: [{ evidence: [{ kind: 'normalized_name' }], requiresQuantityConfirmation: true }],
    });
  });

  async function createProduct(organizationId: string, code: string) {
    const master = await prisma.masterProduct.create({ data: { organizationId, code, name: code } });
    const variant = await prisma.productVariant.create({ data: {
      organizationId, masterProductId: master.id, code: `${code}-V`, name: code,
    } });
    return { masterId: master.id, variantId: variant.id };
  }

  async function createOption({
    organizationId = TEST_ORGANIZATION_ID,
    accountId = ACCOUNT_ID,
    productVariantId,
    sellerSku = null,
    modelNumber = null,
    externalId = 'OPTION',
    displayName = 'Listing',
  }: {
    organizationId?: string;
    accountId?: string;
    productVariantId: string | null;
    sellerSku?: string | null;
    modelNumber?: string | null;
    externalId?: string;
    displayName?: string;
  }) {
    const listing = await prisma.channelListing.create({ data: {
      organizationId, channelAccountId: accountId, externalId: `${externalId}-P`, displayName,
    } });
    return prisma.channelListingOption.create({ data: {
      organizationId, listingId: listing.id, externalOptionId: `${externalId}-O`, productVariantId, sellerSku, modelNumber,
    } });
  }
});

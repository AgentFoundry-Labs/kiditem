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
import { ChannelRecipeAutomationContextRepositoryAdapter } from '../adapter/out/repository/channel-recipe-automation-context.repository.adapter';
import { ChannelRecipeSuggestionService } from '../application/service/channel-recipe-suggestion.service';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';

describe('ChannelRecipeSuggestionService (PG integration)', () => {
  let prisma: PrismaClient;
  let service: ChannelRecipeSuggestionService;
  let automationContexts: ChannelRecipeAutomationContextRepositoryAdapter;

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
    automationContexts = new ChannelRecipeAutomationContextRepositoryAdapter(prismaService);
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
      status: 'unique_code',
      automationDecision: 'auto_apply',
      proposals: [{ sellpiaInventorySkuId: sku.id, requiresQuantityConfirmation: false }],
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

  it('reports shared-variant code conflicts, preserves existing recipes, and auto-matches an exact optionless name', async () => {
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
      status: 'exact_name_option',
      automationDecision: 'auto_apply',
      proposals: [{ evidence: [{ kind: 'normalized_name_option' }], requiresQuantityConfirmation: false }],
    });
  });

  it('uses typed barcodes only and keeps duplicate active barcodes ambiguous', async () => {
    const product = await createProduct(TEST_ORGANIZATION_ID, 'KI-BARCODE');
    const rawOnly = await createOption({
      productVariantId: product.variantId,
      externalId: 'RAW-BARCODE',
      rawJson: { barcode: '001234567890' },
    });
    await prisma.sellpiaInventorySku.create({ data: {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'SP-RAW',
      name: 'Different name',
      barcode: '001234567890',
      currentStock: 3,
    } });
    await expect(service.suggest(TEST_ORGANIZATION_ID, rawOnly.id)).resolves.toMatchObject({
      status: 'no_match', automationDecision: 'blocked',
    });

    const typed = await createOption({
      productVariantId: product.variantId,
      externalId: 'TYPED-BARCODE',
      barcode: '001-2345-6789-0',
    });
    await prisma.sellpiaInventorySku.create({ data: {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'SP-DUP',
      name: 'Another name',
      barcode: '001234567890',
      currentStock: 2,
    } });
    await expect(service.suggest(TEST_ORGANIZATION_ID, typed.id)).resolves.toMatchObject({
      status: 'ambiguous', automationDecision: 'blocked',
    });
  });

  it('rejects duplicate exact names and code/name disagreement', async () => {
    const duplicated = await createProduct(TEST_ORGANIZATION_ID, 'KI-DUP-NAME');
    const duplicatedOption = await createOption({
      productVariantId: duplicated.variantId,
      externalId: 'DUP-NAME',
      displayName: '키즈 식판',
      itemName: '블루',
    });
    await prisma.sellpiaInventorySku.createMany({ data: [
      { organizationId: TEST_ORGANIZATION_ID, code: 'SP-NAME-A', name: '키즈 식판', optionName: '블루', currentStock: 2 },
      { organizationId: TEST_ORGANIZATION_ID, code: 'SP-NAME-B', name: '키즈 식판', optionName: '블루', currentStock: 3 },
    ] });
    await expect(service.suggest(TEST_ORGANIZATION_ID, duplicatedOption.id)).resolves.toMatchObject({
      status: 'ambiguous', automationDecision: 'blocked',
    });

    const conflict = await createProduct(TEST_ORGANIZATION_ID, 'KI-CODE-NAME');
    const conflictOption = await createOption({
      productVariantId: conflict.variantId,
      externalId: 'CODE-NAME',
      sellerSku: 'SP-CODE',
      displayName: '엄격 이름',
      itemName: null,
    });
    await prisma.sellpiaInventorySku.createMany({ data: [
      { organizationId: TEST_ORGANIZATION_ID, code: 'SP-CODE', name: 'Other', currentStock: 2 },
      { organizationId: TEST_ORGANIZATION_ID, code: 'SP-NAME', name: '엄격 이름', currentStock: 3 },
    ] });
    await expect(service.suggest(TEST_ORGANIZATION_ID, conflictOption.id)).resolves.toMatchObject({
      status: 'conflict', automationDecision: 'blocked',
    });
  });

  it('batch context lookup is account and organization fenced and groups one row per variant', async () => {
    const own = await createProduct(TEST_ORGANIZATION_ID, 'KI-BATCH');
    await createOption({
      productVariantId: own.variantId,
      externalId: 'BATCH',
      rawJson: { source: 'coupang_catalog_browser' },
    });
    const foreign = await createProduct(OTHER_ORGANIZATION_ID, 'KI-FOREIGN-BATCH');
    await createOption({
      organizationId: OTHER_ORGANIZATION_ID,
      accountId: OTHER_ACCOUNT_ID,
      productVariantId: foreign.variantId,
      externalId: 'FOREIGN-BATCH',
      rawJson: { source: 'coupang_catalog_browser' },
    });

    await expect(automationContexts.listContexts(
      TEST_ORGANIZATION_ID,
      ACCOUNT_ID,
    )).resolves.toEqual([
      expect.objectContaining({ productVariantId: own.variantId }),
    ]);
    await expect(automationContexts.listContexts(
      TEST_ORGANIZATION_ID,
      OTHER_ACCOUNT_ID,
    )).resolves.toEqual([]);
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
    barcode = null,
    itemName = null,
    rawJson,
    externalId = 'OPTION',
    displayName = 'Listing',
  }: {
    organizationId?: string;
    accountId?: string;
    productVariantId: string | null;
    sellerSku?: string | null;
    modelNumber?: string | null;
    barcode?: string | null;
    itemName?: string | null;
    rawJson?: Record<string, unknown>;
    externalId?: string;
    displayName?: string;
  }) {
    const listing = await prisma.channelListing.create({ data: {
      organizationId, channelAccountId: accountId, externalId: `${externalId}-P`, displayName,
    } });
    return prisma.channelListingOption.create({ data: {
      organizationId,
      listingId: listing.id,
      externalOptionId: `${externalId}-O`,
      productVariantId,
      sellerSku,
      modelNumber,
      barcode,
      itemName,
      rawJson,
    } });
  }
});

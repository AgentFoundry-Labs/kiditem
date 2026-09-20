import { NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SellpiaInventorySkuReadRepositoryAdapter } from '../../inventory/adapter/out/persistence/sellpia-inventory-sku-read.repository.adapter';
import { InventoryAvailabilityRepositoryAdapter } from '../../inventory/adapter/out/persistence/inventory-availability.repository.adapter';
import { InventoryAvailabilityService } from '../../inventory/application/usecase/inventory-availability.service';
import { SellpiaInventorySkuReadService } from '../../inventory/application/usecase/sellpia-inventory-sku-read.service';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
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
    const inventorySkus = new SellpiaInventorySkuReadService(
      new SellpiaInventorySkuReadRepositoryAdapter(prismaService),
    );
    service = new ChannelRecipeSuggestionService(
      new ChannelRecipeSuggestionContextRepositoryAdapter(prismaService, inventorySkus),
      new SellpiaRecipeEvidenceAdapter(inventorySkus, new InventoryAvailabilityService(
        new InventoryAvailabilityRepositoryAdapter(prismaService),
      )),
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

  it('scopes lookup to the organization and holds exact code evidence until quantity is known', async () => {
    const option = await createOption({ sellerSku: 'SP-UNIQUE', displayName: 'Unique stock' });
    const foreign = await createOption({
      organizationId: OTHER_ORGANIZATION_ID,
      accountId: OTHER_ACCOUNT_ID,
      externalId: 'OTHER',
    });
    const sku = await createSku('SP-UNIQUE', 'Unique stock', 8);
    const beforeComponents = await prisma.channelListingOptionInventoryComponent.count();

    await expect(service.suggest(TEST_ORGANIZATION_ID, option.id)).resolves.toMatchObject({
      status: 'quantity_review',
      automationDecision: 'quantity_review',
      proposals: [{ sellpiaInventorySkuId: sku.id, requiresQuantityConfirmation: true }],
    });
    await expect(service.suggest(TEST_ORGANIZATION_ID, foreign.id))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.channelListingOptionInventoryComponent.count()).toBe(beforeComponents);
  });

  it('reports seller SKU and model-number disagreement without mutating the option recipe', async () => {
    const option = await createOption({
      externalId: 'MODEL-CONFLICT',
      sellerSku: 'SP-SELLER',
      modelNumber: 'SP-MODEL',
    });
    const [sellerSku, modelSku] = await Promise.all([
      createSku('SP-SELLER', 'Seller candidate', 4),
      createSku('SP-MODEL', 'Model candidate', 5),
    ]);

    const result = await service.suggest(TEST_ORGANIZATION_ID, option.id);

    expect(result.status).toBe('conflict');
    expect(result.proposals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sellpiaInventorySkuId: sellerSku.id,
        evidence: [expect.objectContaining({ kind: 'seller_sku_code' })],
      }),
      expect.objectContaining({
        sellpiaInventorySkuId: modelSku.id,
        evidence: [expect.objectContaining({ kind: 'model_number_code' })],
      }),
    ]));
    expect(await prisma.channelListingOptionInventoryComponent.count()).toBe(0);
  });

  it('returns already configured from the selected channel option direct components', async () => {
    const option = await createOption({ sellerSku: 'SP-CONFIGURED' });
    const sku = await createSku('SP-CONFIGURED', 'Configured', 7);
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: option.id,
        sellpiaInventorySkuId: sku.id,
        quantity: 2,
      },
    });

    await expect(service.suggest(TEST_ORGANIZATION_ID, option.id)).resolves.toMatchObject({
      status: 'already_configured',
      automationDecision: 'already_configured',
      proposals: [],
      existingComponents: [{ sellpiaInventorySkuId: sku.id, quantity: 2 }],
    });
  });

  it('uses typed barcodes only and keeps duplicate active barcodes in operator review', async () => {
    const rawOnly = await createOption({
      externalId: 'RAW-BARCODE',
      rawJson: { barcode: '001234567890' },
    });
    await createSku('SP-RAW', 'Different name', 3, '001234567890');
    await expect(service.suggest(TEST_ORGANIZATION_ID, rawOnly.id)).resolves.toMatchObject({
      status: 'no_match',
      automationDecision: 'blocked',
    });

    const typed = await createOption({
      externalId: 'TYPED-BARCODE',
      displayName: 'Typed barcode product',
      itemName: 'Typed barcode product',
      barcode: '001-2345-6789-0',
    });
    await createSku('SP-DUP', 'Typed barcode product', 2, '001234567890');
    await createSku('SP-DUP-2', 'Typed barcode product', 2, '001234567890');
    await expect(service.suggest(TEST_ORGANIZATION_ID, typed.id)).resolves.toMatchObject({
      status: 'identifier_name_mismatch',
      automationDecision: 'operator_review',
    });
  });

  it('rejects an incompatible typed barcode while retaining the legitimate name candidate', async () => {
    const option = await createOption({
      externalId: 'SLIME-WATERGUN-BARCODE',
      displayName: '퓨어 클리어 슬라임 투명 9개 x 150g',
      barcode: '8806384804294',
    });
    const watergun = await createSku(
      '10054-1',
      '어린이 물총 워터건',
      27,
      '8806384804294',
    );
    const slime = await createSku(
      '10429-1',
      '2000퓨어클리어슬라임(쿠팡용)',
      31,
      '8806384804966',
    );
    const beforeComponents = await prisma.channelListingOptionInventoryComponent.count();
    const beforeStock = await prisma.sellpiaInventorySku.findMany({
      where: { id: { in: [watergun.id, slime.id] } },
      select: { id: true, currentStock: true },
      orderBy: { id: 'asc' },
    });

    const result = await service.suggest(TEST_ORGANIZATION_ID, option.id);

    expect(result).toMatchObject({
      status: 'identifier_name_mismatch',
      automationDecision: 'operator_review',
    });
    expect(result.proposals.map(({ sellpiaInventorySkuId }) => sellpiaInventorySkuId))
      .toEqual([watergun.id, slime.id]);
    expect(await prisma.channelListingOptionInventoryComponent.count()).toBe(beforeComponents);
    await expect(prisma.sellpiaInventorySku.findMany({
      where: { id: { in: [watergun.id, slime.id] } },
      select: { id: true, currentStock: true },
      orderBy: { id: 'asc' },
    })).resolves.toEqual(beforeStock);
  });

  it('proposes an exact listing-and-option name without creating a component', async () => {
    const option = await createOption({
      externalId: 'NAMED',
      displayName: '키즈 식판',
      itemName: '블루 단품',
    });
    const sku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SP-NAMED',
        name: '키즈 식판',
        optionName: '블루 단품',
        currentStock: 3,
      },
    });

    await expect(service.suggest(TEST_ORGANIZATION_ID, option.id)).resolves.toMatchObject({
      status: 'exact_name_option',
      automationDecision: 'auto_apply',
      proposals: [{
        sellpiaInventorySkuId: sku.id,
        evidence: [expect.objectContaining({ kind: 'normalized_name_option' })],
      }],
    });
    expect(await prisma.channelListingOptionInventoryComponent.count()).toBe(0);
  });

  function createSku(code: string, name: string, currentStock: number, barcode?: string) {
    return prisma.sellpiaInventorySku.create({
      data: { organizationId: TEST_ORGANIZATION_ID, code, name, currentStock, barcode },
    });
  }

  async function createOption({
    organizationId = TEST_ORGANIZATION_ID,
    accountId = ACCOUNT_ID,
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
    sellerSku?: string | null;
    modelNumber?: string | null;
    barcode?: string | null;
    itemName?: string | null;
    rawJson?: Record<string, unknown>;
    externalId?: string;
    displayName?: string;
  }) {
    const listing = await prisma.channelListing.create({ data: {
      organizationId,
      channelAccountId: accountId,
      externalId: `${externalId}-P`,
      displayName,
    } });
    return prisma.channelListingOption.create({ data: {
      organizationId,
      listingId: listing.id,
      externalOptionId: `${externalId}-O`,
      sellerSku,
      modelNumber,
      barcode,
      itemName,
      rawJson,
    } });
  }
});

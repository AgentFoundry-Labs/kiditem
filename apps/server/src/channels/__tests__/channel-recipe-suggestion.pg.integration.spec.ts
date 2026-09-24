import type { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProductAvailabilityRepositoryAdapter } from '../../products/adapter/out/persistence/product-availability.repository.adapter';
import { ProductSourceReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-source-read.repository.adapter';
import { ProductAvailabilityUseCase } from '../../products/application/service/product-availability.usecase';
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
import { ChannelRecipeSuggestionService } from '../application/service/listing/channel-recipe-suggestion.service';
import { ChannelNotFoundError } from '../domain/exception/channel-business-error';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';

describe('ChannelRecipeSuggestionService (PG integration)', () => {
  let prisma: PrismaClient;
  let service: ChannelRecipeSuggestionService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    const products = new ProductSourceReadRepositoryAdapter(prismaService);
    const availability = new ProductAvailabilityUseCase(
      new ProductAvailabilityRepositoryAdapter(prismaService),
    );
    service = new ChannelRecipeSuggestionService(
      new ChannelRecipeSuggestionContextRepositoryAdapter(prismaService, products),
      new SellpiaRecipeEvidenceAdapter(products, availability),
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

  it('scopes lookup to the organization and links a name-corroborated seller code as one unit', async () => {
    const option = await createOption({ sellerSku: 'SP-UNIQUE', displayName: 'Unique stock' });
    const foreign = await createOption({
      organizationId: OTHER_ORGANIZATION_ID,
      accountId: OTHER_ACCOUNT_ID,
      externalId: 'OTHER',
    });
    const sku = await createSku('SP-UNIQUE', 'Unique stock', 8);
    const beforeComponents = await prisma.channelListingOptionInventoryComponent.count();

    // 사장님 2026-09-19 "코드가 맞으면 1개로 잇는다" — 셀러코드가 이름으로 확인되면 수량 1로 자동 연결한다.
    await expect(service.suggest(TEST_ORGANIZATION_ID, option.id)).resolves.toMatchObject({
      automationDecision: 'auto_apply',
      recommendedQuantity: 1,
      proposals: [{ masterProductId: sku.id }],
    });
    await expect(service.suggest(TEST_ORGANIZATION_ID, foreign.id))
      .rejects.toBeInstanceOf(ChannelNotFoundError); // 도메인 예외; HTTP 404 는 ChannelBusinessExceptionFilter 가 맡는다
    expect(await prisma.channelListingOptionInventoryComponent.count()).toBe(beforeComponents);
  });

  it('holds exact model-number evidence without a seller code until the quantity is known', async () => {
    const option = await createOption({ modelNumber: 'SP-MODEL-ONLY', displayName: 'Model only stock' });
    const sku = await createSku('SP-MODEL-ONLY', 'Model only stock', 8);

    await expect(service.suggest(TEST_ORGANIZATION_ID, option.id)).resolves.toMatchObject({
      status: 'quantity_review',
      automationDecision: 'quantity_review',
      recommendedQuantity: null,
      proposals: [{ masterProductId: sku.id, requiresQuantityConfirmation: true }],
    });
    expect(await prisma.channelListingOptionInventoryComponent.count()).toBe(0);
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
        masterProductId: sellerSku.id,
        evidence: [expect.objectContaining({ kind: 'seller_sku_code' })],
      }),
      expect.objectContaining({
        masterProductId: modelSku.id,
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
        masterProductId: sku.id,
        quantity: 2,
      },
    });

    await expect(service.suggest(TEST_ORGANIZATION_ID, option.id)).resolves.toMatchObject({
      status: 'already_configured',
      automationDecision: 'already_configured',
      proposals: [],
      existingComponents: [{ masterProductId: sku.id, quantity: 2 }],
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
    const beforeStock = await prisma.masterProduct.findMany({
      where: { id: { in: [watergun.id, slime.id] } },
      select: { id: true, currentStock: true },
      orderBy: { id: 'asc' },
    });

    const result = await service.suggest(TEST_ORGANIZATION_ID, option.id);

    expect(result).toMatchObject({
      status: 'identifier_name_mismatch',
      automationDecision: 'operator_review',
    });
    expect(result.proposals.map(({ masterProductId }) => masterProductId))
      .toEqual([watergun.id, slime.id]);
    expect(await prisma.channelListingOptionInventoryComponent.count()).toBe(beforeComponents);
    await expect(prisma.masterProduct.findMany({
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
    const sku = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'KID00000001',
        sourceAccountKey: 'kiditem',
        sourceProductCode: 'SP-NAMED',
        sourceOptionCode: '',
        name: '키즈 식판',
        optionName: '블루 단품',
        currentStock: 3,
      },
    });

    await expect(service.suggest(TEST_ORGANIZATION_ID, option.id)).resolves.toMatchObject({
      status: 'exact_name_option',
      automationDecision: 'auto_apply',
      proposals: [{
        masterProductId: sku.id,
        evidence: [expect.objectContaining({ kind: 'normalized_name_option' })],
      }],
    });
    expect(await prisma.channelListingOptionInventoryComponent.count()).toBe(0);
  });

  async function createSku(code: string, name: string, currentStock: number, barcode?: string) {
    const [{ value }] = await prisma.$queryRaw<Array<{ value: bigint }>>`
      SELECT nextval('kid_item_code_seq'::regclass) AS value
    `;
    return prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: code.length <= 11 ? code : `KID${value.toString().padStart(8, '0')}`,
        sourceAccountKey: 'kiditem',
        sourceProductCode: code,
        sourceOptionCode: '',
        name,
        currentStock,
        barcode,
      },
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
    rawJson?: Prisma.InputJsonValue;
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

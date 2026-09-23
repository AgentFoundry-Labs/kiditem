import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import { SalesProductRepositoryAdapter } from '../adapter/out/persistence/sales-product.repository.adapter';
import { RegistrationTargetRepositoryAdapter } from '../adapter/out/persistence/registration-target.repository.adapter';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MallPriceAdoptionWrite } from '../domain/sales-product/sales-product-mall-prices';
import type { SabangnetImportProductWrite } from '../application/port/out/persistence/sales-product.repository.port';
import { SalesProductUseCase } from '../application/service/sales-product/sales-product.usecase';
import type { SalesProductListQuery } from '@kiditem/shared/sales-product';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { productTransactionalRead } from './product-transactional-read.fake';
import * as XLSX from 'xlsx';
import { SabangnetProductImportService } from '../application/service/collection/sabangnet-product-import.service';
import { SalesProductLinkService } from '../application/service/sales-product/sales-product-link.service';
import { SalesProductImageService } from '../application/service/sales-product/sales-product-image.service';
import { ChannelsDocumentsAdapter } from '../adapter/out/documents/channel-documents.adapter';
import { ChannelIntegrityAdapter } from '../adapter/out/integrity/channel-integrity.adapter';
import { mirroredImageKey } from '../domain/sales-product/sales-product-images';
import type { SalesProductImageMirrorPort } from '../application/port/out/storage/sales-product-image-mirror.port';
import type { ProductSourceReadPort } from '../../products/application/port/in/product-source-read.port';
import { makeChannelRecipes } from '../../test-helpers/channel-catalog-ports';
import { ProductTransactionalReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { seedSourceProduct } from '../../test-helpers/inventory-seeds';

describe('sales product repository mall price adoption (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let targets: RegistrationTargetRepositoryAdapter;
  let repository: SalesProductRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    targets = new RegistrationTargetRepositoryAdapter(prisma as unknown as PrismaService, productTransactionalRead());
    repository = new SalesProductRepositoryAdapter(
      prisma as unknown as PrismaService,
      undefined as never,
      targets,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('updates only explicitly supplied option prices and accepts zero', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const { productId, options } = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const targetId = await targets.create(TEST_ORGANIZATION_ID, {
      salesProductId: productId,
      channelAccountId: accountId,
      displayName: null,
      registrationInput: {},
      selectedOptions: [selected(options[0]!.id, { salePrice: 1_500 }), selected(options[1]!.id, { salePrice: 2_500 })],
    });

    await expect(repository.setChannelOverrideSalePrices(TEST_ORGANIZATION_ID, [write({
      salesProductId: productId,
      channelAccountId: accountId,
      targetId,
      expectedVersion: 1,
      salePrice: 0,
      optionPrices: [{ salesProductOptionId: options[0]!.id, salePrice: 0 }],
    })])).resolves.toBe(1);

    await expect(targets.get(TEST_ORGANIZATION_ID, targetId)).resolves.toMatchObject({
      version: 2,
      selectedOptions: [
        { salesProductOptionId: options[0]!.id, salePrice: 0 },
        { salesProductOptionId: options[1]!.id, salePrice: 2_500 },
      ],
    });
  });

  it('rejects a stale target version without changing the target', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const { productId, options } = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const targetId = await targets.create(TEST_ORGANIZATION_ID, {
      salesProductId: productId,
      channelAccountId: accountId,
      displayName: null,
      registrationInput: {},
      selectedOptions: [selected(options[0]!.id)],
    });

    await expect(repository.setChannelOverrideSalePrices(TEST_ORGANIZATION_ID, [write({
      salesProductId: productId,
      channelAccountId: accountId,
      targetId,
      expectedVersion: 0,
      optionPrices: [{ salesProductOptionId: options[0]!.id, salePrice: 1_000 }],
    })])).rejects.toThrow('등록 대상이 다른 곳에서 변경되었습니다.');

    await expect(targets.get(TEST_ORGANIZATION_ID, targetId)).resolves.toMatchObject({
      version: 1,
      selectedOptions: [{ salesProductOptionId: options[0]!.id, salePrice: null }],
    });
  });

  it('rejects duplicate target and option writes before applying a last-wins value', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const { productId, options } = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const targetId = await targets.create(TEST_ORGANIZATION_ID, {
      salesProductId: productId,
      channelAccountId: accountId,
      displayName: null,
      registrationInput: {},
      selectedOptions: [selected(options[0]!.id)],
    });
    const baseWrite = write({
      salesProductId: productId,
      channelAccountId: accountId,
      targetId,
      expectedVersion: 1,
      optionPrices: [{ salesProductOptionId: options[0]!.id, salePrice: 1_000 }],
    });

    await expect(repository.setChannelOverrideSalePrices(TEST_ORGANIZATION_ID, [
      write({ ...baseWrite, salePrice: 1_000_000_001 }),
    ])).rejects.toThrow('대표 판매가가 올바르지 않습니다.');
    await expect(repository.setChannelOverrideSalePrices(TEST_ORGANIZATION_ID, [
      write({ ...baseWrite, optionPrices: [{ salesProductOptionId: options[0]!.id, salePrice: 1_000_000_001 }] }),
    ])).rejects.toThrow('옵션별 최종 판매가가 올바르지 않습니다.');

    await expect(repository.setChannelOverrideSalePrices(TEST_ORGANIZATION_ID, [
      baseWrite,
      write({ ...baseWrite, optionPrices: [{ salesProductOptionId: options[0]!.id, salePrice: 2_000 }] }),
    ])).rejects.toThrow(ConflictException);
    await expect(repository.setChannelOverrideSalePrices(TEST_ORGANIZATION_ID, [
      write({ ...baseWrite, optionPrices: [
        { salesProductOptionId: options[0]!.id, salePrice: 1_000 },
        { salesProductOptionId: options[0]!.id, salePrice: 2_000 },
      ] }),
    ])).rejects.toThrow(ConflictException);

    await expect(targets.get(TEST_ORGANIZATION_ID, targetId)).resolves.toMatchObject({
      version: 1,
      selectedOptions: [{ salesProductOptionId: options[0]!.id, salePrice: null }],
    });
  });

  /** 등록 설정은 상품 × 몰 계정당 하나다(KID-310 · ADR-0022). 그래도 고칠 설정은 불러야 한다. */
  it('requires the caller to name the setting it is writing, and fences organizations', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const { productId, options } = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const firstTargetId = await targets.create(TEST_ORGANIZATION_ID, {
      salesProductId: productId,
      channelAccountId: accountId,
      displayName: '첫 대상',
      registrationInput: {},
      selectedOptions: [selected(options[0]!.id)],
    });

    await expect(repository.setChannelOverrideSalePrices(TEST_ORGANIZATION_ID, [write({
      salesProductId: productId,
      channelAccountId: accountId,
      targetId: undefined as unknown as string,
      expectedVersion: 1,
      optionPrices: [{ salesProductOptionId: options[0]!.id, salePrice: 1_000 }],
    })])).rejects.toThrow(ConflictException);
    await expect(targets.get(TEST_ORGANIZATION_ID, firstTargetId)).resolves.toMatchObject({ version: 1 });

    const otherAccountId = await createAccount(prisma, OTHER_ORGANIZATION_ID);
    const otherProduct = await createProduct(prisma, OTHER_ORGANIZATION_ID);
    const otherTargetId = await targets.create(OTHER_ORGANIZATION_ID, {
      salesProductId: otherProduct.productId,
      channelAccountId: otherAccountId,
      displayName: null,
      registrationInput: {},
      selectedOptions: [selected(otherProduct.options[0]!.id)],
    });
    await expect(repository.setChannelOverrideSalePrices(TEST_ORGANIZATION_ID, [write({
      salesProductId: otherProduct.productId,
      channelAccountId: otherAccountId,
      targetId: otherTargetId,
      expectedVersion: 1,
      optionPrices: [{ salesProductOptionId: otherProduct.options[0]!.id, salePrice: 1_000 }],
    })])).rejects.toThrow(ConflictException);
    await expect(targets.get(OTHER_ORGANIZATION_ID, otherTargetId)).resolves.toMatchObject({ version: 1 });
  });

  it('reports the one registration setting of each mall, and only this organization\'s', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const secondAccountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const { productId, options } = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const firstTargetId = await targets.create(TEST_ORGANIZATION_ID, {
      salesProductId: productId,
      channelAccountId: accountId,
      displayName: '기본 등록',
      registrationInput: { mallRegisterValues: { categoryPath: '완구>블록' } },
      selectedOptions: [selected(options[0]!.id, { salePrice: 3_300, supplyPrice: 2_000 })],
    });
    const secondTargetId = await targets.create(TEST_ORGANIZATION_ID, {
      salesProductId: productId,
      channelAccountId: secondAccountId,
      displayName: '별도 몰 등록',
      registrationInput: {},
      selectedOptions: [
        selected(options[0]!.id, { salePrice: 7_700 }),
        selected(options[1]!.id, { salePrice: 8_800 }),
      ],
    });
    const channel = (await prisma.channelAccount.findUniqueOrThrow({ where: { id: accountId } })).channel;
    const secondChannel = (await prisma.channelAccount.findUniqueOrThrow({ where: { id: secondAccountId } })).channel;

    const [product] = await repository.readMallSheetProducts(TEST_ORGANIZATION_ID, [productId]);
    expect(product!.overrides.map((item) => [item.targetId, item.mallKey, item.name, item.selectedOptionIds?.length]))
      .toEqual([
        [firstTargetId, channel, '기본 등록', 1],
        [secondTargetId, secondChannel, '별도 몰 등록', 2],
      ]);
    expect(product!.overrides[0]!.optionPrices)
      .toEqual([{ salesProductOptionId: options[0]!.id, salePrice: 3_300, normalPrice: null, supplyPrice: 2_000 }]);
    expect(product!.overrides[0]!.adapterValues).toEqual({ categoryPath: '완구>블록' });

    await expect(repository.readMallSheetProducts(OTHER_ORGANIZATION_ID, [productId])).resolves.toEqual([]);
  });

  /**
   * 설정이 하나뿐이라 고를 것이 없다(KID-310). 분류는 그 상품 · 그 몰의 설정에만 붙고, 다른
   * 몰의 설정은 손대지 않는다.
   */
  it('saves a mall category on that product and mall only', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const otherAccountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const { productId, options } = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const targetId = await targets.create(TEST_ORGANIZATION_ID, {
      salesProductId: productId,
      channelAccountId: accountId,
      displayName: '기본 등록',
      registrationInput: {},
      selectedOptions: [selected(options[0]!.id)],
    });
    const otherMallTargetId = await targets.create(TEST_ORGANIZATION_ID, {
      salesProductId: productId,
      channelAccountId: otherAccountId,
      displayName: '다른 몰 등록',
      registrationInput: {},
      selectedOptions: [selected(options[1]!.id)],
    });

    await expect(repository.setMallCategoryPaths(TEST_ORGANIZATION_ID, [
      { salesProductId: productId, channelAccountId: accountId, path: '완구>블록' },
    ])).resolves.toBe(1);
    await expect(targets.get(TEST_ORGANIZATION_ID, targetId)).resolves.toMatchObject({
      version: 2,
      registrationInput: { mallRegisterValues: { categoryPath: '완구>블록' } },
    });
    await expect(targets.get(TEST_ORGANIZATION_ID, otherMallTargetId)).resolves.toMatchObject({ version: 1 });
  });

  it('leaves another product and mall setting alone while it makes its own', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const { productId } = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const otherAccountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const otherProduct = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const strangerId = await targets.create(TEST_ORGANIZATION_ID, {
      salesProductId: otherProduct.productId,
      channelAccountId: otherAccountId,
      displayName: null,
      registrationInput: {},
      selectedOptions: [selected(otherProduct.options[0]!.id)],
    });

    await expect(repository.setMallCategoryPaths(TEST_ORGANIZATION_ID, [
      { salesProductId: productId, channelAccountId: accountId, path: '완구>블록' },
    ])).resolves.toBe(1);
    await expect(prisma.registrationTarget.count({
      where: { organizationId: TEST_ORGANIZATION_ID, salesProductId: productId, channelAccountId: accountId },
    })).resolves.toBe(1);
    await expect(targets.get(TEST_ORGANIZATION_ID, strangerId)).resolves.toMatchObject({ version: 1 });
  });

  it('still makes the one setting a category needs when the product and mall has none', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const { productId } = await createProduct(prisma, TEST_ORGANIZATION_ID);

    await expect(repository.setMallCategoryPaths(TEST_ORGANIZATION_ID, [
      { salesProductId: productId, channelAccountId: accountId, path: '완구>블록' },
    ])).resolves.toBe(1);
    const made = await prisma.registrationTarget.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, salesProductId: productId, channelAccountId: accountId },
    });
    expect(made.registrationInput).toEqual({ mallRegisterValues: { categoryPath: '완구>블록' } });
  });

  it('does not silently ignore a legacy rate-only import', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const input = importWrite(accountId);

    await expect(repository.importSabangnet(TEST_ORGANIZATION_ID, [input]))
      .rejects.toThrow('가격 비율만으로는 단품별 최종 판매가를 물질화할 수 없습니다.');
    await expect(prisma.salesProduct.findFirst({
      where: { organizationId: TEST_ORGANIZATION_ID, code: input.create.code },
    })).resolves.toBeNull();
  });

  it('materializes typed source option prices by exact bootstrap code', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const input = importWrite(accountId, {
      sourceOptionCodes: ['SOURCE-B', 'SOURCE-A'],
      optionPrices: [
        { sabangnetOptionCode: 'SOURCE-A', salePrice: 111 },
        { sabangnetOptionCode: 'SOURCE-B', salePrice: 222 },
      ],
      // A legacy scalar must not flatten the per-option values.
      salePrice: 9_999,
      priceRateBp: null,
    });

    await expect(repository.importSabangnet(TEST_ORGANIZATION_ID, [input])).resolves.toMatchObject({
      created: 1,
      overridesSaved: 1,
    });
    const product = await prisma.salesProduct.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, code: input.create.code },
      select: { id: true },
    });
    await expect(prisma.registrationTarget.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, salesProductId: product.id, channelAccountId: accountId },
      include: { selectedOptions: { orderBy: { sortOrder: 'asc' } } },
    })).resolves.toMatchObject({
      selectedOptions: [
        { salePrice: 222 },
        { salePrice: 111 },
      ],
    });
  });

  it('rejects missing or duplicate exact source option mappings', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const missing = importWrite(accountId, {
      sourceOptionCodes: ['SOURCE-A', 'SOURCE-B'],
      optionPrices: [{ sabangnetOptionCode: 'SOURCE-A', salePrice: 111 }],
      priceRateBp: null,
    });
    await expect(repository.importSabangnet(TEST_ORGANIZATION_ID, [missing]))
      .rejects.toThrow(/가져온 단품별 최종 판매가에 현재 단품이 빠졌습니다/);
    await expect(prisma.salesProduct.findFirst({
      where: { organizationId: TEST_ORGANIZATION_ID, code: missing.create.code },
    })).resolves.toBeNull();

    const duplicate = importWrite(accountId, {
      sourceOptionCodes: ['SOURCE-C'],
      optionPrices: [
        { sabangnetOptionCode: 'SOURCE-C', salePrice: 111 },
        { sabangnetOptionCode: 'SOURCE-C', salePrice: 222 },
      ],
      priceRateBp: null,
    });
    await expect(repository.importSabangnet(TEST_ORGANIZATION_ID, [duplicate]))
      .rejects.toThrow(/단품별 최종 판매가에 사방넷 단품코드가 겹칩니다/);
  });

  it('preserves an edited registration target during reimport', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const first = importWrite(accountId, {
      optionPrices: [{ sabangnetOptionCode: 'SOURCE-EDIT', salePrice: 111 }],
      priceRateBp: null,
    });
    await repository.importSabangnet(TEST_ORGANIZATION_ID, [first]);
    const product = await prisma.salesProduct.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, code: first.create.code },
      select: { id: true },
    });
    const targetBefore = await prisma.registrationTarget.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, salesProductId: product.id, channelAccountId: accountId },
      select: { id: true },
    });
    await prisma.registrationTargetOption.updateMany({
      where: { organizationId: TEST_ORGANIZATION_ID, registrationTargetId: targetBefore.id },
      data: { salePrice: 777 },
    });

    // 상품 × 몰 계정당 설정 하나이므로, 손으로 만든 편집값은 다른 몰 계정의 설정이다.
    const otherAccountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const secondTarget = await prisma.registrationTarget.create({
      data: { organizationId: TEST_ORGANIZATION_ID, salesProductId: product.id,
        channelAccountId: otherAccountId, displayName: '기획전 편집값' },
    });
    const second = importWrite(accountId, {
      code: first.create.code!,
      optionPrices: [{ sabangnetOptionCode: 'SOURCE-EDIT', salePrice: 999 }],
      priceRateBp: null,
    });
    await expect(repository.importSabangnet(TEST_ORGANIZATION_ID, [second])).resolves.toMatchObject({
      unchanged: 1,
      overridesSaved: 0,
    });
    await expect(prisma.registrationTargetOption.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, registrationTargetId: targetBefore.id },
      select: { salePrice: true },
    })).resolves.toEqual({ salePrice: 777 });
    await expect(prisma.registrationTarget.findFirstOrThrow({
      where: { id: secondTarget.id, organizationId: TEST_ORGANIZATION_ID },
      select: { displayName: true },
    })).resolves.toEqual({ displayName: '기획전 편집값' });
  });
});

function write(input: Omit<MallPriceAdoptionWrite, 'salePrice'> & Partial<Pick<MallPriceAdoptionWrite, 'salePrice'>>): MallPriceAdoptionWrite {
  return {
    ...input,
    salePrice: input.salePrice ?? input.optionPrices[0]!.salePrice,
  };
}

function selected(
  salesProductOptionId: string,
  overrides: Partial<{ salePrice: number | null; normalPrice: number | null; supplyPrice: number | null }> = {},
) {
  return {
    salesProductOptionId,
    salePrice: null,
    normalPrice: null,
    supplyPrice: null,
    ...overrides,
  };
}

async function createAccount(prisma: PrismaClient, organizationId: string): Promise<string> {
  const id = randomUUID();
  await prisma.channelAccount.create({
    data: {
      id,
      organizationId,
      channel: `test-${id.slice(0, 8)}`,
      name: 'Integration account',
      externalAccountId: `external-${id}`,
      status: 'active',
    },
  });
  return id;
}

async function createDraft(prisma: PrismaClient, organizationId: string) {
  const productId = randomUUID();
  await prisma.salesProduct.create({
    data: { id: productId, organizationId, code: null, status: 'draft', name: '초안 상품' },
  });
  await prisma.salesProductOption.create({
    data: {
      id: randomUUID(),
      organizationId,
      salesProductId: productId,
      optionCode: null,
      optionKey: '',
      values: [],
      salePrice: null,
      sortOrder: 0,
    },
  });
  return { productId };
}

function emptyBasics(name: string) {
  return {
    name, ownCode: null, shortName: null, englishName: null, printName: null, modelName: null, modelNo: null,
    brand: null, manufacturer: null, originCountry: null, originRegion: null, keywords: [], standardCategory: null,
    description: '', targetAudience: null, ageGroup: null, productSize: null, colorVariantNames: [],
    boxSetQuantity: null, registrationDefaults: null, taxType: 'taxable' as const, deliveryFeeType: null,
    deliveryFee: null, stockManaged: false, imageUrls: [], detailHtml: null, extraDetailHtml: [], noticeCategory: null,
    noticeValues: [], certifications: [], kcStatus: 'unknown' as const, importDeclarationNo: null, adminMemo: null,
  };
}

async function createProduct(prisma: PrismaClient, organizationId: string) {
  const productId = randomUUID();
  await prisma.salesProduct.create({
    data: {
      id: productId,
      organizationId,
      code: `SP-${productId.slice(0, 8)}`,
      status: 'active',
      name: '공통 상품',
    },
  });
  const options = await Promise.all([
    prisma.salesProductOption.create({
      data: {
        id: randomUUID(),
        organizationId,
        salesProductId: productId,
        optionCode: `${productId.slice(0, 8)}-0001`,
        optionKey: '파랑',
        values: ['파랑'],
        salePrice: 3_000,
        normalPrice: 5_000,
        sortOrder: 0,
      },
    }),
    prisma.salesProductOption.create({
      data: {
        id: randomUUID(),
        organizationId,
        salesProductId: productId,
        optionCode: `${productId.slice(0, 8)}-0002`,
        optionKey: '노랑',
        values: ['노랑'],
        salePrice: 4_000,
        normalPrice: null,
        sortOrder: 1,
      },
    }),
  ]);
  return { productId, options };
}

function importWrite(channelAccountId: string, options: {
  code?: string;
  mode?: SabangnetImportProductWrite['mode'];
  sourceOptionCodes?: readonly string[];
  optionPrices?: readonly { sabangnetOptionCode: string; salePrice: number }[];
  salePrice?: number | null;
  priceRateBp?: number | null;
} = {}): SabangnetImportProductWrite {
  const code = options.code ?? `IMPORT-${randomUUID().slice(0, 8)}`;
  const sourceOptionCodes = options.sourceOptionCodes
    ?? options.optionPrices?.map((option) => option.sabangnetOptionCode)
    ?? [`${code}-0001`];
  const priceRateBp = Object.prototype.hasOwnProperty.call(options, 'priceRateBp')
    ? options.priceRateBp ?? null
    : options.optionPrices ? null : 10_000;
  return {
    mode: options.mode ?? 'upsert',
    create: {
      code,
      sabangnetGoodsNo: code,
      name: '가져오기 상품',
      description: '',
      targetAudience: null,
      ageGroup: null,
      productSize: null,
      colorVariantNames: [],
      boxSetQuantity: null,
      registrationDefaults: null,
      kcStatus: 'unknown' as const,
      ownCode: null,
      shortName: null,
      englishName: null,
      printName: null,
      modelName: null,
      modelNo: null,
      brand: null,
      manufacturer: null,
      originCountry: null,
      originRegion: null,
      keywords: [],
      standardCategory: null,
      status: 'active',
      taxType: 'taxable',
      deliveryFeeType: null,
      deliveryFee: null,
      stockManaged: false,
      imageUrls: [],
      detailHtml: null,
      extraDetailHtml: [],
      noticeCategory: null,
      noticeValues: [],
      certifications: [],
      importDeclarationNo: null,
      adminMemo: null,
      optionAxes: ['색상'],
      sourceRaw: null,
    },
    plan: {
      writes: sourceOptionCodes.map((sabangnetOptionCode, index) => ({
        id: null,
        optionCode: `${code}-${String(index + 1).padStart(4, '0')}`,
        sabangnetOptionCode,
        optionKey: `옵션${index + 1}`,
        values: [`옵션${index + 1}`],
        alias: null,
        barcode: null,
        salePrice: 1_000,
        normalPrice: null,
        supplyStatus: 'selling' as const,
        safetyStock: null,
        sortOrder: index,
        components: [],
      })),
      retireIds: [],
      deleteIds: [],
    },
    overrides: [{
      channelAccountId,
      data: {
        optionPrices: options.optionPrices,
        salePrice: options.salePrice ?? null,
        priceRateBp,
        costPrice: null,
        name: null,
        detailHtml: null,
        promoText: null,
        noticeCategory: null,
        stockPercent: null,
      },
    }],
  };
}

/**
 * 미등록(아직 몰에 없는) 목록과 후보 재사용 · 되돌리기의 저장소 계약.
 *
 * Products 는 남의 소유라 읽기 계약만 세워 둔다(구성 없는 상품만 다루므로 비어 있는 답으로 충분하다).
 */
describe('sales product preparation list and reuse (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let repository: SalesProductRepositoryAdapter;
  let service: SalesProductUseCase;

  const productsRead = {
    lock: async () => ({}),
    readSourceIdentities: async () => [],
    readAvailability: async () => ({ items: [] }),
  } as unknown as ConstructorParameters<typeof SalesProductRepositoryAdapter>[1];

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new SalesProductRepositoryAdapter(
      prisma as unknown as PrismaService,
      productsRead,
      new RegistrationTargetRepositoryAdapter(prisma as unknown as PrismaService, productTransactionalRead()),
    );
    service = new SalesProductUseCase(repository);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  const listQuery = (focus: SalesProductListQuery['focus']) =>
    ({ focus, page: 1, limit: 50 }) satisfies SalesProductListQuery;

  it('shows every selling product no mall carries yet, whether or not a collected product started it', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const sourceRecordId = randomUUID();
    const fromSource = await createProduct(prisma, TEST_ORGANIZATION_ID);
    await prisma.salesProduct.update({
      where: { id: fromSource.productId },
      data: { sourceRecordId, name: '원본에서 만든 상품' },
    });
    const standalone = await createProduct(prisma, TEST_ORGANIZATION_ID);
    await prisma.salesProduct.update({ where: { id: standalone.productId }, data: { name: '직접 만든 상품' } });
    // 초안은 KID 가 없어 몰에 갈 수 없다 — 미등록 판매 상품이 아니라 수집상품 화면의 것이다.
    await createDraft(prisma, TEST_ORGANIZATION_ID);
    const listed = await createProduct(prisma, TEST_ORGANIZATION_ID);
    await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: accountId,
        salesProductId: listed.productId,
        externalId: `ext-${randomUUID()}`,
        isActive: true,
      },
    });

    const unregistered = await repository.list(TEST_ORGANIZATION_ID, listQuery('unregistered'));

    expect(unregistered.items.map((item) => item.id).sort())
      .toEqual([fromSource.productId, standalone.productId].sort());
    expect(unregistered.total).toBe(2);
    expect(unregistered.summary).toMatchObject({ total: 4, unregistered: 2, draft: 1 });
    expect(unregistered.items.find((item) => item.id === fromSource.productId)?.sourceRecordId)
      .toBe(sourceRecordId);
    expect(unregistered.items.find((item) => item.id === standalone.productId)?.sourceRecordId)
      .toBeNull();
  });

  it('비활성 몰 상품만 남은 판매상품은 미등록 목록으로 돌아오지 않는다 — 비활성화는 등록된 상태에서 내린 것이다', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    // 사장님 2026-09-23: "몰 상품이 비활성화된 것은 등록은 되어있는 상태에서 비활성화된 거니까
    // 미등록 목록으로 되돌아오도록 하면 안 된다." 그래서 기준은 '한 번이라도 몰에 올라간 적 있음'
    // 이고, 탭 이름 '아직 몰에 없음' 이 그대로 사실이 된다.
    const removed = await createProduct(prisma, TEST_ORGANIZATION_ID);
    await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: accountId,
        salesProductId: removed.productId,
        externalId: `ext-${randomUUID()}`,
        isActive: false,
      },
    });
    const archived = await createProduct(prisma, TEST_ORGANIZATION_ID);
    await prisma.salesProduct.update({ where: { id: archived.productId }, data: { status: 'archived' } });
    const never = await createProduct(prisma, TEST_ORGANIZATION_ID);

    const unregistered = await repository.list(TEST_ORGANIZATION_ID, listQuery('unregistered'));

    expect(unregistered.items.map((item) => item.id)).toEqual([never.productId]);
    expect(unregistered.summary.unregistered).toBe(1);
    // 보관한 상품은 판매를 접었으니 미등록 판매 상품도 아니다. 보관 탭에서만 보인다.
    const onlyArchived = await repository.list(
      TEST_ORGANIZATION_ID,
      { ...listQuery('all'), status: 'archived' },
    );
    expect(onlyArchived.items.map((item) => item.id)).toEqual([archived.productId]);
  });

  it('lists only drafts on the collected-products screen — a product leaves it when its KID is issued', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const draft = await createDraft(prisma, TEST_ORGANIZATION_ID);
    await createProduct(prisma, TEST_ORGANIZATION_ID);
    const archived = await createProduct(prisma, TEST_ORGANIZATION_ID);
    await prisma.salesProduct.update({ where: { id: archived.productId }, data: { status: 'archived' } });
    const listed = await createProduct(prisma, TEST_ORGANIZATION_ID);
    await prisma.channelListing.create({
      data: { organizationId: TEST_ORGANIZATION_ID, channelAccountId: accountId, salesProductId: listed.productId,
        externalId: `ext-${randomUUID()}`, isActive: true },
    });

    const preparing = await repository.list(TEST_ORGANIZATION_ID, listQuery('preparing'));

    expect(preparing.items.map((item) => item.id)).toEqual([draft.productId]);
    expect(preparing.items[0]).toMatchObject({ status: 'draft', code: null });

    await repository.ensureCodes(TEST_ORGANIZATION_ID, draft.productId);

    expect((await repository.list(TEST_ORGANIZATION_ID, listQuery('preparing'))).items).toEqual([]);
  });

  it('never lets another organization see its unregistered products', async () => {
    const mine = await createProduct(prisma, TEST_ORGANIZATION_ID);
    await createProduct(prisma, OTHER_ORGANIZATION_ID);

    const unregistered = await repository.list(TEST_ORGANIZATION_ID, listQuery('unregistered'));

    expect(unregistered.items.map((item) => item.id)).toEqual([mine.productId]);
    expect(unregistered.summary.unregistered).toBe(1);
  });

  it('lets the collected-products tabs filter drafts by their source platform without a Sourcing join', async () => {
    await service.createDraft(TEST_ORGANIZATION_ID, { sourceRecordId: randomUUID(), name: '1688 상품', sourcePlatform: '1688' });
    await service.createDraft(TEST_ORGANIZATION_ID, { sourceRecordId: randomUUID(), name: '쿠팡 상품', sourcePlatform: 'coupang' });

    const tab = await repository.list(TEST_ORGANIZATION_ID, { ...listQuery('all'), sourcePlatform: '1688' });

    expect(tab.items.map((item) => item.name)).toEqual(['1688 상품']);
    expect(tab.items[0]).toMatchObject({ sourcePlatform: '1688', status: 'draft', salePrice: null });
    expect(tab.summary.draft).toBe(1);
  });

  it('keeps a standalone product whole when it is archived, and drops it from the default list', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const created = await service.create(TEST_ORGANIZATION_ID, {
      name: '직접 만든 상품',
      optionAxes: ['색상'],
      options: [{ values: ['빨강'], salePrice: 4_000 }, { values: ['파랑'], salePrice: 4_500 }],
    });
    const before = await repository.readOptionState(TEST_ORGANIZATION_ID, created.id);
    const targetId = await new RegistrationTargetRepositoryAdapter(prisma as unknown as PrismaService, productTransactionalRead())
      .create(TEST_ORGANIZATION_ID, {
        salesProductId: created.id,
        channelAccountId: accountId,
        displayName: null,
        registrationInput: {},
        selectedOptions: [selected(before!.options[0]!.id)],
      });

    const archived = await service.update(
      TEST_ORGANIZATION_ID,
      created.id,
      { expectedVersion: created.version, status: 'archived' },
    );

    expect(archived).toMatchObject({ id: created.id, code: created.code, status: 'archived' });
    const after = await repository.readOptionState(TEST_ORGANIZATION_ID, created.id);
    expect(after!.options.map((option) => option.id)).toEqual(before!.options.map((option) => option.id));
    expect(after!.options.map((option) => option.optionCode)).toEqual(before!.options.map((option) => option.optionCode));
    expect(await prisma.registrationTarget.count({ where: { id: targetId, organizationId: TEST_ORGANIZATION_ID } }))
      .toBe(1);
    expect((await repository.list(TEST_ORGANIZATION_ID, listQuery('all'))).items).toEqual([]);
    expect((await repository.list(TEST_ORGANIZATION_ID, listQuery('unregistered'))).items).toEqual([]);
    const onlyArchived = await repository.list(
      TEST_ORGANIZATION_ID,
      { ...listQuery('all'), status: 'archived' },
    );
    expect(onlyArchived.items.map((item) => item.id)).toEqual([created.id]);
  });

  it('keeps a priced draft a draft; only the KID issue makes it active, and nothing brings it back', async () => {
    const draft = await createDraft(prisma, TEST_ORGANIZATION_ID);
    const before = await service.get(TEST_ORGANIZATION_ID, draft.productId);

    const priced = await service.replaceOptions(TEST_ORGANIZATION_ID, draft.productId, {
      expectedVersion: before.version,
      optionAxes: ['옵션'],
      options: [{ values: ['빨강'], salePrice: 3_000 }, { values: ['파랑'], salePrice: 3_500 }],
    });
    expect(priced).toMatchObject({ status: 'draft', code: null });

    const issued = await repository.ensureCodes(TEST_ORGANIZATION_ID, draft.productId);
    const active = await service.get(TEST_ORGANIZATION_ID, draft.productId);
    expect(active).toMatchObject({ status: 'active', code: issued.code });
    expect(active.options.every((option) => option.optionCode !== null)).toBe(true);

    // 다시 발급해도 그대로다(멱등) — active 가 초안으로 돌아가지 않는다.
    await repository.ensureCodes(TEST_ORGANIZATION_ID, draft.productId);
    await expect(service.get(TEST_ORGANIZATION_ID, draft.productId))
      .resolves.toMatchObject({ status: 'active', code: issued.code });
  });

  it('archives a selling product, refuses to archive a draft, and takes no other status from the screen', async () => {
    const selling = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const draft = await createDraft(prisma, TEST_ORGANIZATION_ID);

    const archived = await service.update(TEST_ORGANIZATION_ID, selling.productId, { expectedVersion: 1, status: 'archived' });
    expect(archived.status).toBe('archived');

    await expect(service.update(TEST_ORGANIZATION_ID, draft.productId, { expectedVersion: 1, status: 'archived' }))
      .rejects.toThrow('초안');
    await expect(service.update(TEST_ORGANIZATION_ID, selling.productId, { expectedVersion: archived.version, status: 'active' }))
      .rejects.toThrow('판매상품 내용이 올바르지 않습니다.');
    expect((await prisma.salesProduct.findUniqueOrThrow({ where: { id: draft.productId } })).status).toBe('draft');
  });

  it('lands a raw insert without a code as a draft — the column default never makes an uncoded selling product', async () => {
    const row = await prisma.salesProduct.create({ data: { organizationId: TEST_ORGANIZATION_ID, name: '코드 없는 줄' } });

    expect(row).toMatchObject({ code: null, status: 'draft' });
  });

  it('refuses a write whose status and KID disagree and leaves no row', async () => {
    await expect(repository.create(TEST_ORGANIZATION_ID, {
      ...emptyBasics('코드 없는 판매 상품'),
      status: 'active',
      code: null,
      sabangnetGoodsNo: null,
      optionAxes: [],
      sourceRaw: null,
    }, { writes: [], retireIds: [], deleteIds: [] })).rejects.toThrow('어긋납니다');

    expect(await prisma.salesProduct.count({ where: { organizationId: TEST_ORGANIZATION_ID } })).toBe(0);
  });
});

/**
 * 사방넷 다시 가져오기는 지난 가져오기 뒤 사람이 고친 칸을 지키고, 고치지 않은 칸만 파일 값으로 바꾼다
 * (KID-304). 기준값은 저장된 원문이다 — 병합 결과가 실제 DB 에 어떻게 남는지 본다.
 */
describe('Sabangnet reimport keeps operator edits (PostgreSQL)', () => {
  const GOODS_NO = '100017';
  const OWN_CODE = 'OWN-100017';
  const IMAGE_A = 'https://pic.sabangnet.co.kr/product_image/100017_1.jpg';
  const IMAGE_B = 'https://pic.sabangnet.co.kr/product_image/100017_2.jpg';
  const IMAGE_C = 'https://pic.sabangnet.co.kr/product_image/100017_3.jpg';
  const HEADERS = [
    '품번코드', '상품명', '자체상품코드', '브랜드명', '판매가', '옵션제목(1)', '옵션상세명칭(1)', '대표이미지', '부가이미지2',
    '부가이미지3', '상품상세설명', '속성분류코드', '속성값1', '속성값2', '인증번호', '인증기관', '관리자메모',
  ];
  const integrity = new ChannelIntegrityAdapter();
  let prisma: PrismaClient;
  let service: SabangnetProductImportService;
  let imageMirror: SalesProductImageService;
  let mirroredUrl: (url: string) => string;

  type Row = Partial<Record<(typeof HEADERS)[number], string | number>>;
  function file(row: Row) {
    const base: Row = {
      품번코드: GOODS_NO, 상품명: '투명우산 그리기', 자체상품코드: OWN_CODE, 브랜드명: '키드아이템', 판매가: 2880,
      '옵션제목(1)': '단품', '옵션상세명칭(1)': '단품', 대표이미지: IMAGE_A, 부가이미지2: IMAGE_B,
      상품상세설명: '<p>상세 1</p>', 속성분류코드: '35', 속성값1: '면', 속성값2: '중국', 인증번호: 'CB-1', 인증기관: 'KTR',
      관리자메모: '사방넷 메모 1',
    };
    const merged = { ...base, ...row };
    const sheet = XLSX.utils.aoa_to_sheet([HEADERS, HEADERS.map((header) => merged[header] ?? '')]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
    return [{ originalname: 'products.xlsx', buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer }];
  }

  async function product() {
    return prisma.salesProduct.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, sabangnetGoodsNo: GOODS_NO },
    });
  }

  async function reimport(row: Row) {
    const preview = await service.import(TEST_ORGANIZATION_ID, file(row), true);
    const [change] = preview.existingChanges;
    const saved = await service.import(TEST_ORGANIZATION_ID, file(row), false, [{
      salesProductId: change!.salesProductId,
      expectedVersion: change!.expectedVersion,
    }]);
    return { preview, saved };
  }

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    const repository = new SalesProductRepositoryAdapter(
      prismaService,
      productTransactionalRead(),
      new RegistrationTargetRepositoryAdapter(prismaService, productTransactionalRead()),
    );
    const logger = { log() {}, warn() {} };
    // 사진 저장소는 바깥 경계다 — 옮긴 주소만 정해 준다.
    const images: SalesProductImageMirrorPort = {
      mirror: async ({ key }) => ({ ok: true, url: `https://storage.example/${key}` }),
      urlFor: (key: string) => `https://storage.example/${key}`,
      isOwnedUrl: (url: string) => url.startsWith('https://storage.example/'),
    };
    mirroredUrl = (url) => images.urlFor(mirroredImageKey(TEST_ORGANIZATION_ID, url, integrity.sha256)!);
    // 셀피아 상품은 Products 소유다. 이 시험은 단품 연결을 보지 않으므로 빈 목록이면 된다.
    const sourceProducts = { listActiveForMatching: async () => [] } as unknown as ProductSourceReadPort;
    service = new SabangnetProductImportService(
      repository,
      sourceProducts,
      new SalesProductLinkService(repository, makeChannelRecipes(prisma), logger),
      images,
      new ChannelsDocumentsAdapter(),
      logger,
      integrity,
    );
    imageMirror = new SalesProductImageService(repository, images, logger, integrity, new ChannelsDocumentsAdapter());
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('keeps edited notice, KC, image and memo while unedited fields take the new file', async () => {
    await service.import(TEST_ORGANIZATION_ID, file({}), false);
    const imported = await product();
    await prisma.salesProduct.update({
      where: { id: imported.id },
      data: {
        noticeValues: ['면', '한국'],
        kcStatus: 'none',
        certifications: Prisma.JsonNull,
        imageUrls: [IMAGE_A, 'https://storage.example/own.jpg'],
        adminMemo: '운영자 메모',
      },
    });

    const { preview } = await reimport({
      상품명: '투명우산 그리기 세트', 브랜드명: '새 브랜드', 상품상세설명: '<p>상세 2</p>', 속성값2: '베트남',
      인증번호: 'CB-2', 관리자메모: '사방넷 메모 2', 부가이미지3: IMAGE_C,
    });

    expect(preview.existingChanges).toEqual([expect.objectContaining({
      changed: true,
      baselineOnly: false,
      preserved: ['imageUrls', 'noticeValues', 'certifications', 'kcStatus', 'adminMemo'],
      updated: ['name', 'brand', 'detailHtml'],
    })]);
    const after = await product();
    expect(after).toMatchObject({
      id: imported.id,
      code: imported.code,
      ownCode: OWN_CODE,
      name: '투명우산 그리기 세트',
      brand: '새 브랜드',
      detailHtml: '<p>상세 2</p>',
      noticeValues: ['면', '한국'],
      kcStatus: 'none',
      certifications: null,
      imageUrls: [IMAGE_A, 'https://storage.example/own.jpg'],
      adminMemo: '운영자 메모',
    });
    // 다음 가져오기는 이번 파일과 비교한다: 사람이 다시 고치지 않은 이름은 파일 값을 받는다.
    expect(after.sourceRaw).toMatchObject({ 상품명: '투명우산 그리기 세트', 관리자메모: '사방넷 메모 2' });
    await reimport({ 상품명: '투명우산', 상품상세설명: '<p>상세 2</p>', 인증번호: 'CB-2', 관리자메모: '사방넷 메모 2' });
    await expect(product()).resolves.toMatchObject({ name: '투명우산', adminMemo: '운영자 메모' });
  });

  it('keeps a mirrored image address and the KID and own code while the file adds an image', async () => {
    await service.import(TEST_ORGANIZATION_ID, file({}), false);
    const imported = await product();
    await prisma.salesProduct.update({
      where: { id: imported.id },
      data: { imageUrls: [mirroredUrl(IMAGE_A), IMAGE_B] },
    });

    const { preview } = await reimport({ 자체상품코드: 'OWN-OTHER', 부가이미지3: IMAGE_C });

    expect(preview.existingChanges[0]).toMatchObject({ preserved: [], updated: ['imageUrls'] });
    await expect(product()).resolves.toMatchObject({
      code: imported.code,
      ownCode: OWN_CODE,
      imageUrls: [mirroredUrl(IMAGE_A), IMAGE_B, IMAGE_C],
    });
  });

  it('keeps every current value of a product imported without a source row', async () => {
    await service.import(TEST_ORGANIZATION_ID, file({}), false);
    const imported = await product();
    await prisma.salesProduct.update({ where: { id: imported.id }, data: { sourceRaw: Prisma.JsonNull } });

    const { preview } = await reimport({ 상품명: '다른 이름', 관리자메모: '사방넷 메모 2' });

    // 바뀐 것은 저장된 원문(기준값)뿐이다.
    expect(preview.existingChanges[0]).toMatchObject({ changed: true, baselineOnly: true, updated: [] });
    await expect(product()).resolves.toMatchObject({
      name: '투명우산 그리기',
      adminMemo: '사방넷 메모 1',
      sourceRaw: expect.objectContaining({ 상품명: '다른 이름' }),
    });
  });

  it('takes a new file detail after the mirror job rewrote the imported detail images', async () => {
    const imported = `<p><img src="${IMAGE_A}"></p>`;
    await service.import(TEST_ORGANIZATION_ID, file({ 상품상세설명: imported }), false);
    await imageMirror.mirror(TEST_ORGANIZATION_ID);
    await expect(product()).resolves.toMatchObject({ detailHtml: `<p><img src="${mirroredUrl(IMAGE_A)}"></p>` });

    const { preview } = await reimport({ 상품상세설명: '<p>상세 2</p>' });

    expect(preview.existingChanges[0]!.preserved).not.toContain('detailHtml');
    await expect(product()).resolves.toMatchObject({ detailHtml: '<p>상세 2</p>' });
  });

  it('keeps an operator-edited detail across a mirror and a reimport', async () => {
    await service.import(TEST_ORGANIZATION_ID, file({}), false);
    const imported = await product();
    const edited = `<p>운영자 상세 <img src="${IMAGE_A}"></p>`;
    await prisma.salesProduct.update({ where: { id: imported.id }, data: { detailHtml: edited } });
    await imageMirror.mirror(TEST_ORGANIZATION_ID);

    await reimport({ 상품상세설명: '<p>상세 2</p>' });

    await expect(product()).resolves.toMatchObject({
      detailHtml: `<p>운영자 상세 <img src="${mirroredUrl(IMAGE_A)}"></p>`,
    });
  });

  it('keeps the Sabangnet goods number when a reimported row carries only the own code', async () => {
    await service.import(TEST_ORGANIZATION_ID, file({}), false);
    const imported = await product();

    const preview = await service.import(TEST_ORGANIZATION_ID, file({ 품번코드: '', 상품명: '자체코드로 온 줄' }), true);
    const [change] = preview.existingChanges;
    expect(change).toMatchObject({ salesProductId: imported.id });
    await service.import(TEST_ORGANIZATION_ID, file({ 품번코드: '', 상품명: '자체코드로 온 줄' }), false, [{
      salesProductId: imported.id,
      expectedVersion: change!.expectedVersion,
    }]);

    await expect(prisma.salesProduct.findFirstOrThrow({ where: { id: imported.id } })).resolves.toMatchObject({
      sabangnetGoodsNo: GOODS_NO,
      ownCode: OWN_CODE,
      name: '자체코드로 온 줄',
    });
  });

  it('fills an empty own code from the file and never replaces one that is set', async () => {
    await service.import(TEST_ORGANIZATION_ID, file({ 자체상품코드: '' }), false);
    await expect(product()).resolves.toMatchObject({ ownCode: null });

    await reimport({ 자체상품코드: OWN_CODE });
    await expect(product()).resolves.toMatchObject({ ownCode: OWN_CODE });

    await reimport({ 자체상품코드: 'OWN-OTHER', 상품명: '다른 이름' });
    await expect(product()).resolves.toMatchObject({ ownCode: OWN_CODE, name: '다른 이름' });
  });

  it('still holds an identity conflict and writes nothing', async () => {
    await service.import(TEST_ORGANIZATION_ID, file({}), false);
    const imported = await product();
    // 다른 판매상품의 자체상품코드가 이 상품의 사방넷 품번과 같다 — 파일 줄이 어느 상품인지 정할 수 없다.
    await prisma.salesProduct.create({
      data: { organizationId: TEST_ORGANIZATION_ID, code: 'KID-OTHER', status: 'active', name: '다른 상품', ownCode: GOODS_NO },
    });

    await expect(service.import(TEST_ORGANIZATION_ID, file({ 상품명: '바뀐 이름' }), false, [{
      salesProductId: imported.id,
      expectedVersion: imported.version,
    }])).rejects.toThrow(/Ambiguous source product identity/);
    const after = await product();
    expect(after).toMatchObject({ name: '투명우산 그리기', version: imported.version, ownCode: OWN_CODE });
  });
});

describe('sales product reference cost (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let repository: SalesProductRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    // 원천 매입가는 Products 의 실제 reader 로 읽는다.
    repository = new SalesProductRepositoryAdapter(
      prisma as unknown as PrismaService,
      new ProductTransactionalReadRepositoryAdapter() as unknown as ConstructorParameters<typeof SalesProductRepositoryAdapter>[1],
      new RegistrationTargetRepositoryAdapter(prisma as unknown as PrismaService, productTransactionalRead()),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('prices each option from its sources and says 계산 불가 when a price or the recipe is missing', async () => {
    const priced = await seedSourceProduct(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'SRC-PRICED', name: '매입가 있는 원천', purchasePrice: 1_200,
    });
    const unpriced = await seedSourceProduct(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'SRC-UNPRICED', name: '매입가 없는 원천', purchasePrice: null,
    });
    const product = await prisma.salesProduct.create({
      data: { organizationId: TEST_ORGANIZATION_ID, code: null, name: '참고 원가 상품' },
    });
    const option = async (optionKey: string, sortOrder: number, components: { masterProductId: string; quantity: number }[]) => {
      const created = await prisma.salesProductOption.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          salesProductId: product.id,
          values: [optionKey],
          optionKey,
          sortOrder,
          salePrice: null,
        },
      });
      if (components.length > 0) await prisma.salesProductOptionComponent.createMany({
        data: components.map((component) => ({
          ...component, organizationId: TEST_ORGANIZATION_ID, salesProductOptionId: created.id,
        })),
      });
    };
    await option('두 개 묶음', 0, [{ masterProductId: priced.id, quantity: 2 }]);
    await option('섞인 구성', 1, [
      { masterProductId: priced.id, quantity: 1 },
      { masterProductId: unpriced.id, quantity: 1 },
    ]);
    await option('구성 없음', 2, []);

    const read = await repository.get(TEST_ORGANIZATION_ID, product.id);

    expect(read?.options.map((row) => [row.optionKey, row.referenceCost])).toEqual([
      ['두 개 묶음', 2_400],
      ['섞인 구성', null],
      ['구성 없음', null],
    ]);
  });
});

import { ownerTransaction } from '../../prisma/owner-transaction';
import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
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

async function createProduct(prisma: PrismaClient, organizationId: string) {
  const productId = randomUUID();
  await prisma.salesProduct.create({
    data: {
      id: productId,
      organizationId,
      code: `SP-${productId.slice(0, 8)}`,
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

  it('shows every product no mall carries yet, whether or not a collected product started it', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const candidateId = randomUUID();
    const fromCandidate = await createProduct(prisma, TEST_ORGANIZATION_ID);
    await prisma.salesProduct.update({
      where: { id: fromCandidate.productId },
      data: { sourceCandidateId: candidateId, name: '후보에서 만든 상품' },
    });
    const standalone = await createProduct(prisma, TEST_ORGANIZATION_ID);
    await prisma.salesProduct.update({ where: { id: standalone.productId }, data: { name: '직접 만든 상품' } });
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
      .toEqual([fromCandidate.productId, standalone.productId].sort());
    expect(unregistered.total).toBe(2);
    expect(unregistered.summary).toMatchObject({ total: 3, unregistered: 2 });
    expect(unregistered.items.find((item) => item.id === fromCandidate.productId)?.sourceCandidateId)
      .toBe(candidateId);
    expect(unregistered.items.find((item) => item.id === standalone.productId)?.sourceCandidateId)
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
    const onlyArchived = await repository.list(
      TEST_ORGANIZATION_ID,
      { ...listQuery('unregistered'), status: 'archived' },
    );
    expect(onlyArchived.items.map((item) => item.id)).toEqual([archived.productId]);
  });

  it('never lets another organization see its unregistered products', async () => {
    const mine = await createProduct(prisma, TEST_ORGANIZATION_ID);
    await createProduct(prisma, OTHER_ORGANIZATION_ID);

    const unregistered = await repository.list(TEST_ORGANIZATION_ID, listQuery('unregistered'));

    expect(unregistered.items.map((item) => item.id)).toEqual([mine.productId]);
    expect(unregistered.summary.unregistered).toBe(1);
  });

  it('answers one draft when the same collected product arrives twice at once', async () => {
    const candidateId = randomUUID();
    const draft = () => service.createFromSource(TEST_ORGANIZATION_ID, {
      candidateId,
      name: '비눗방울총',
      description: '수집한 설명',
      imageUrls: ['https://img.example.com/a.jpg'],
      sourcePlatform: '1688',
      sourceUrl: 'https://detail.1688.com/offer/1.html',
    });

    const [left, right] = await Promise.all([draft(), draft()]);

    expect(new Set([left.id, right.id]).size).toBe(1);
    expect(await prisma.salesProduct.count({ where: { organizationId: TEST_ORGANIZATION_ID, sourceCandidateId: candidateId } }))
      .toBe(1);
    const row = await prisma.salesProduct.findFirstOrThrow({ where: { organizationId: TEST_ORGANIZATION_ID, sourceCandidateId: candidateId } });
    expect(row).toMatchObject({ status: 'draft', description: '수집한 설명', sourcePlatform: '1688' });
    const options = await prisma.salesProductOption.findMany({ where: { salesProductId: row.id } });
    expect(options.map((option) => option.salePrice)).toEqual([null]);
    // KID 는 팔기로 정한 순간에 발급한다(ADR-0022). 수집 초안은 아직 '미발급'이다.
    expect(row.code).toBeNull();
    expect(options[0]!.optionCode).toBeNull();
  });

  it('lets the collected-products tabs filter drafts by their source platform without a Sourcing join', async () => {
    await service.createFromSource(TEST_ORGANIZATION_ID, { candidateId: randomUUID(), name: '1688 상품', sourcePlatform: '1688' });
    await service.createFromSource(TEST_ORGANIZATION_ID, { candidateId: randomUUID(), name: '쿠팡 상품', sourcePlatform: 'coupang' });

    const tab = await repository.list(TEST_ORGANIZATION_ID, { ...listQuery('all'), sourcePlatform: '1688' });

    expect(tab.items.map((item) => item.name)).toEqual(['1688 상품']);
    expect(tab.items[0]).toMatchObject({ sourcePlatform: '1688', status: 'draft', salePrice: null });
    expect(tab.summary.draft).toBe(1);
  });

  it('keeps the edited draft when the same collected product is captured again', async () => {
    const candidateId = randomUUID();
    const first = await service.createFromSource(TEST_ORGANIZATION_ID, { candidateId, name: '수집 이름' });
    await service.update(TEST_ORGANIZATION_ID, first.id, { expectedVersion: first.version, name: '사람이 고친 이름' });

    const again = await service.createFromSource(TEST_ORGANIZATION_ID, { candidateId, name: '다시 수집한 이름' });

    expect(again).toMatchObject({ id: first.id, code: first.code, name: '사람이 고친 이름' });
  });

  /** 초안 내리기는 부르는 쪽(Sourcing)의 트랜잭션에서 돈다. 여기서는 spec 이 그 역할을 한다. */
  function retireDraft(organizationId: string, candidateId: string) {
    return prisma.$transaction((tx) =>
      service.retireDraftForSource(ownerTransaction(tx), organizationId, candidateId));
  }

  /**
   * 같은 후보를 두 입구(Agent · 확장)가 동시에 담는다.
   *
   * 유일키에 기대면 진 쪽이 아직 커밋되지 않은 승자를 조회하다 못 찾고 그대로 던진다 — 수집이
   * 실패로 보인다. 후보 id 로 직렬화해 두 번째가 첫 커밋 뒤에 읽게 한다.
   */
  it('⭐ 같은 후보를 동시에 담아도 초안은 하나이고 둘 다 그것을 돌려받는다', async () => {
    const candidateId = randomUUID();

    const [left, right] = await Promise.all([
      service.createFromSource(TEST_ORGANIZATION_ID, { candidateId, name: '동시 수집' }),
      service.createFromSource(TEST_ORGANIZATION_ID, { candidateId, name: '동시 수집' }),
    ]);

    expect(left.id).toBe(right.id);
    expect(await prisma.salesProduct.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sourceCandidateId: candidateId },
    })).toBe(1);
    expect(await prisma.salesProductOption.count({
      where: { organizationId: TEST_ORGANIZATION_ID, salesProductId: left.id },
    })).toBe(1);
  });

  it('sends the draft to unused when its source candidate is rejected, and keeps it when a mall holds it', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const candidateId = randomUUID();
    const draft = await service.createFromSource(TEST_ORGANIZATION_ID, { candidateId, name: '버려진 상품' });

    await expect(retireDraft(TEST_ORGANIZATION_ID, candidateId))
      .resolves.toMatchObject({ salesProductId: draft.id, retired: true, blockedReason: null });
    expect((await prisma.salesProduct.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('unused');

    const listedCandidateId = randomUUID();
    const listed = await service.createFromSource(TEST_ORGANIZATION_ID, { candidateId: listedCandidateId, name: '몰에 올라간 상품' });
    await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: accountId,
        salesProductId: listed.id,
        externalId: `ext-${randomUUID()}`,
        isActive: true,
      },
    });

    const blocked = await retireDraft(TEST_ORGANIZATION_ID, listedCandidateId);

    expect(blocked).toMatchObject({ salesProductId: listed.id, retired: false });
    expect(blocked.blockedReason).toContain('몰');
    expect((await prisma.salesProduct.findUniqueOrThrow({ where: { id: listed.id } })).status).toBe('draft');
  });

  it('never touches another organization draft for the same source candidate id', async () => {
    const candidateId = randomUUID();
    const mine = await service.createFromSource(TEST_ORGANIZATION_ID, { candidateId, name: '우리 초안' });
    const theirs = await service.createFromSource(OTHER_ORGANIZATION_ID, { candidateId, name: '남의 초안' });

    await retireDraft(TEST_ORGANIZATION_ID, candidateId);

    expect((await prisma.salesProduct.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe('unused');
    expect((await prisma.salesProduct.findUniqueOrThrow({ where: { id: theirs.id } })).status).toBe('draft');
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

  it('raises a draft to active on the save that fills every selling price, and leaves a human status alone', async () => {
    const candidateId = randomUUID();
    const draft = await service.createFromSource(TEST_ORGANIZATION_ID, {
      candidateId,
      name: '비눗방울총',
      optionNames: ['빨강', '파랑'],
    });
    expect(draft.status).toBe('draft');

    const half = await service.replaceOptions(TEST_ORGANIZATION_ID, draft.id, {
      expectedVersion: draft.version,
      optionAxes: ['옵션'],
      options: [{ values: ['빨강'], salePrice: 3_000 }, { values: ['파랑'], salePrice: null }],
    });
    expect(half.status).toBe('draft');

    const priced = await service.replaceOptions(TEST_ORGANIZATION_ID, draft.id, {
      expectedVersion: half.version,
      optionAxes: ['옵션'],
      options: [{ values: ['빨강'], salePrice: 3_000 }, { values: ['파랑'], salePrice: 3_500 }],
    });

    expect(priced.status).toBe('active');
    expect(priced.code).toBe(draft.code);
    expect(priced.options.map((option) => option.optionCode)).toEqual(half.options.map((option) => option.optionCode));

    const paused = await service.update(TEST_ORGANIZATION_ID, draft.id, { expectedVersion: priced.version, status: 'paused' });
    const kept = await service.replaceOptions(TEST_ORGANIZATION_ID, draft.id, {
      expectedVersion: paused.version,
      optionAxes: ['옵션'],
      options: [{ values: ['빨강'], salePrice: 4_000 }, { values: ['파랑'], salePrice: 4_500 }],
    });
    expect(kept.status).toBe('paused');
  });
});

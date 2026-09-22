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

describe('sales product repository mall price adoption (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let targets: RegistrationTargetRepositoryAdapter;
  let repository: SalesProductRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    targets = new RegistrationTargetRepositoryAdapter(prisma as unknown as PrismaService);
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

  it('requires an explicit target even when multiple targets exist and fences organizations', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const { productId, options } = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const firstTargetId = await targets.create(TEST_ORGANIZATION_ID, {
      salesProductId: productId,
      channelAccountId: accountId,
      displayName: '첫 대상',
      registrationInput: {},
      selectedOptions: [selected(options[0]!.id)],
    });
    const secondTargetId = await targets.create(TEST_ORGANIZATION_ID, {
      salesProductId: productId,
      channelAccountId: accountId,
      displayName: '둘째 대상',
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
    await expect(targets.get(TEST_ORGANIZATION_ID, secondTargetId)).resolves.toMatchObject({ version: 1 });

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

    const secondTarget = await prisma.registrationTarget.create({
      data: { organizationId: TEST_ORGANIZATION_ID, salesProductId: product.id,
        channelAccountId: accountId, displayName: '기획전 편집값' },
    });
    const second = importWrite(accountId, {
      code: first.create.code,
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
      new RegistrationTargetRepositoryAdapter(prisma as unknown as PrismaService),
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

  it('counts a product whose mall listing was turned off as unregistered again, and keeps archived ones out', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
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

    const unregistered = await repository.list(TEST_ORGANIZATION_ID, listQuery('unregistered'));

    expect(unregistered.items.map((item) => item.id)).toEqual([removed.productId]);
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
});

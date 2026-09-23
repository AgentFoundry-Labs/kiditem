import { realRegistrableDetailPages, realRegistrationContentWorkspace } from '../../test-helpers/registration-content-workspace';
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
import type { RegistrationMallInput, SalesProductListQuery } from '@kiditem/shared/sales-product';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { productTransactionalRead } from './product-transactional-read.fake';
import { realDraftDeletionPorts, untouchedRegistrationStates } from '../../test-helpers/sales-product-draft-port';
import * as XLSX from 'xlsx';
import { SabangnetProductImportService } from '../application/service/collection/sabangnet-product-import.service';
import { SalesProductLinkService } from '../application/service/sales-product/sales-product-link.service';
import { SalesProductImageService } from '../application/service/sales-product/sales-product-image.service';
import { SalesProductMallSheetService } from '../application/service/sales-product/sales-product-mall-sheet.service';
import { ChannelsDocumentsAdapter } from '../adapter/out/documents/channel-documents.adapter';
import { ChannelIntegrityAdapter } from '../adapter/out/integrity/channel-integrity.adapter';
import { mirroredImageKey } from '../domain/sales-product/sales-product-images';
import type { ChannelRegistrableDetailPagePort } from '../application/port/out/content/registrable-detail-page.port';
import { DetailPageRepositoryAdapter } from '../../content/adapter/out/repository/detail-page.repository.adapter';
import { ownerTransaction } from '../../prisma/owner-transaction';
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
    targets = new RegistrationTargetRepositoryAdapter(prisma as unknown as PrismaService, productTransactionalRead(), realRegistrationContentWorkspace(prisma));
    repository = new SalesProductRepositoryAdapter(
      prisma as unknown as PrismaService,
      undefined as never,
      targets,
    realRegistrationContentWorkspace(prisma),
      realRegistrableDetailPages(prisma),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('writes the adopted mall price to the selling product options, accepts zero and leaves other options alone', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const { productId, options } = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const version = (await prisma.salesProduct.findUniqueOrThrow({ where: { id: productId } })).version;

    await expect(repository.applyMallPriceAdoption(TEST_ORGANIZATION_ID, [write({
      salesProductId: productId,
      expectedVersion: version,
      channelAccountIds: [accountId],
      optionPrices: [{ salesProductOptionId: options[0]!.id, salePrice: 0 }],
    })])).resolves.toBe(1);

    await expect(prisma.salesProductOption.findMany({
      where: { salesProductId: productId },
      orderBy: { sortOrder: 'asc' },
      select: { salePrice: true, normalPrice: true },
    })).resolves.toEqual([{ salePrice: 0, normalPrice: 5_000 }, { salePrice: 4_000, normalPrice: null }]);
    await expect(prisma.salesProduct.findUniqueOrThrow({ where: { id: productId } }))
      .resolves.toMatchObject({ version: version + 1 });
  });

  it('rejects a stale product version, a foreign option and another organization without changing any price', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const { productId, options } = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const other = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const foreign = await createProduct(prisma, OTHER_ORGANIZATION_ID);
    const version = (await prisma.salesProduct.findUniqueOrThrow({ where: { id: productId } })).version;
    const base = { salesProductId: productId, expectedVersion: version, channelAccountIds: [accountId] };

    await expect(repository.applyMallPriceAdoption(TEST_ORGANIZATION_ID, [write({
      ...base, expectedVersion: version - 1,
      optionPrices: [{ salesProductOptionId: options[0]!.id, salePrice: 1_000 }],
    })])).rejects.toThrow('판매상품이 다른 곳에서 변경되었습니다.');
    await expect(repository.applyMallPriceAdoption(TEST_ORGANIZATION_ID, [write({
      ...base, optionPrices: [{ salesProductOptionId: other.options[0]!.id, salePrice: 1_000 }],
    })])).rejects.toThrow(ConflictException);
    await expect(repository.applyMallPriceAdoption(TEST_ORGANIZATION_ID, [write({
      salesProductId: foreign.productId, expectedVersion: 1, channelAccountIds: [accountId],
      optionPrices: [{ salesProductOptionId: foreign.options[0]!.id, salePrice: 1_000 }],
    })])).rejects.toThrow(ConflictException);
    await expect(repository.applyMallPriceAdoption(TEST_ORGANIZATION_ID, [write({
      ...base, optionPrices: [{ salesProductOptionId: options[0]!.id, salePrice: 1_000_000_001 }],
    })])).rejects.toThrow('옵션 판매가가 올바르지 않습니다.');

    await expect(prisma.salesProductOption.findMany({
      where: { salesProductId: { in: [productId, other.productId, foreign.productId] } },
      select: { salePrice: true },
    })).resolves.toEqual(expect.not.arrayContaining([{ salePrice: 1_000 }]));
  });

  it('reads each selling product with its version and the prices of the mall options linked to it', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const { productId, options } = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const listing = await prisma.channelListing.create({
      data: { organizationId: TEST_ORGANIZATION_ID, channelAccountId: accountId, externalId: `ext-${productId}`, isActive: true },
    });
    await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID, listingId: listing.id,
        externalOptionId: 'opt-1', salePrice: 3_300, isActive: true, salesProductOptionId: options[0]!.id,
      },
    });

    const candidates = await repository.readMallPriceCandidates(TEST_ORGANIZATION_ID);

    expect(candidates.products).toContainEqual(expect.objectContaining({
      id: productId,
      version: expect.any(Number),
      options: expect.arrayContaining([expect.objectContaining({ id: options[0]!.id, salePrice: 3_000 })]),
    }));
    expect(candidates.listingOptions).toEqual([
      { channelAccountId: accountId, salesProductOptionId: options[0]!.id, salePrice: 3_300 },
    ]);
  });

  it('reports the one registration setting of each mall, and only this organization\'s', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const secondAccountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const { productId, options } = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const firstTargetId = await targets.create(TEST_ORGANIZATION_ID, {
      salesProductId: productId,
      channelAccountId: accountId,
      registrationInput: mallInput({ mallCategory: { key: '완구>블록', label: null }, mallFields: { supplyPrice: '2000', stockPercent: 30 } }),
      selectedOptions: [selected(options[0]!.id)],
    });
    const secondTargetId = await targets.create(TEST_ORGANIZATION_ID, {
      salesProductId: productId,
      channelAccountId: secondAccountId,
      registrationInput: mallInput(),
      selectedOptions: [selected(options[0]!.id), selected(options[1]!.id)],
    });
    const channel = (await prisma.channelAccount.findUniqueOrThrow({ where: { id: accountId } })).channel;
    const secondChannel = (await prisma.channelAccount.findUniqueOrThrow({ where: { id: secondAccountId } })).channel;

    const [product] = await repository.readMallSheetProducts(TEST_ORGANIZATION_ID, [productId]);
    expect(product!.overrides.map((item) => [item.targetId, item.mallKey, item.selectedOptionIds?.length]))
      .toEqual([
        [firstTargetId, channel, 1],
        [secondTargetId, secondChannel, 2],
      ]);
    // 몰 시트는 고른 카테고리와 글자 칸만 받는다 — 이름 · 가격은 판매 상품에서 온다(KID-313 W2).
    expect(product!.overrides[0]).toMatchObject({ categoryPath: '완구>블록', adapterValues: { supplyPrice: '2000' } });

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
      registrationInput: mallInput(),
      selectedOptions: [selected(options[0]!.id)],
    });
    const otherMallTargetId = await targets.create(TEST_ORGANIZATION_ID, {
      salesProductId: productId,
      channelAccountId: otherAccountId,
      registrationInput: mallInput(),
      selectedOptions: [selected(options[1]!.id)],
    });

    await expect(repository.setMallCategoryPaths(TEST_ORGANIZATION_ID, [
      { salesProductId: productId, channelAccountId: accountId, path: '완구>블록' },
    ])).resolves.toBe(1);
    await expect(targets.get(TEST_ORGANIZATION_ID, targetId)).resolves.toMatchObject({
      version: 2,
      registrationInput: { mallCategory: { key: '완구>블록', label: null } },
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
      registrationInput: mallInput(),
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
    expect(made.registrationInput).toEqual({ mallCategory: { key: '완구>블록', label: null }, mallFields: {}, adapter: {} });
  });

  it('makes the first setting of an imported mall with its mall-only values, selecting every option and no price', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const input = importWrite(accountId, { sourceOptionCodes: ['SOURCE-B', 'SOURCE-A'], stockPercent: 40 });

    await expect(repository.importSabangnet(TEST_ORGANIZATION_ID, [input])).resolves.toMatchObject({
      created: 1,
      overridesSaved: 1,
    });
    const product = await prisma.salesProduct.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, code: input.create.code },
      select: { id: true, options: { orderBy: { sortOrder: 'asc' }, select: { id: true } } },
    });
    await expect(prisma.registrationTarget.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, salesProductId: product.id, channelAccountId: accountId },
      include: { selectedOptions: { orderBy: { sortOrder: 'asc' } } },
    })).resolves.toMatchObject({
      registrationInput: { mallCategory: null, mallFields: { stockPercent: 40 }, adapter: {} },
      selectedOptions: product.options.map((option) => ({ salesProductOptionId: option.id })),
    });
  });

  it('leaves an existing registration target alone during reimport', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const first = importWrite(accountId, { stockPercent: 40 });
    await repository.importSabangnet(TEST_ORGANIZATION_ID, [first]);
    const product = await prisma.salesProduct.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, code: first.create.code },
      select: { id: true },
    });
    const target = await prisma.registrationTarget.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, salesProductId: product.id, channelAccountId: accountId },
      select: { id: true },
    });
    const edited = { mallCategory: { key: '사람이 고른 분류', label: null }, mallFields: { stockPercent: 70 }, adapter: {} };
    await prisma.registrationTarget.update({ where: { id: target.id }, data: { registrationInput: edited } });

    await expect(repository.importSabangnet(TEST_ORGANIZATION_ID, [
      importWrite(accountId, { code: first.create.code!, stockPercent: 10 }),
    ])).resolves.toMatchObject({ overridesSaved: 0 });
    await expect(prisma.registrationTarget.findUniqueOrThrow({
      where: { id: target.id },
      select: { registrationInput: true },
    })).resolves.toEqual({ registrationInput: edited });
  });
});

function write(input: MallPriceAdoptionWrite): MallPriceAdoptionWrite {
  return input;
}

function mallInput(overrides: Partial<RegistrationMallInput> = {}): RegistrationMallInput {
  return { mallCategory: null, mallFields: {}, adapter: {}, ...overrides };
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
    deliveryFee: null, stockManaged: false, imageUrls: [], noticeCategory: null,
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
  stockPercent?: number | null;
} = {}): SabangnetImportProductWrite {
  const code = options.code ?? `IMPORT-${randomUUID().slice(0, 8)}`;
  const sourceOptionCodes = options.sourceOptionCodes ?? [`${code}-0001`];
  return {
    mode: options.mode ?? 'upsert',
    create: {
      code,
      sabangnetGoodsNo: code,
      ...emptyBasics('가져오기 상품'),
      status: 'active',
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
    overrides: [{ channelAccountId, data: { stockPercent: options.stockPercent ?? null } }],
    detail: null,
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
      new RegistrationTargetRepositoryAdapter(prisma as unknown as PrismaService, productTransactionalRead(), realRegistrationContentWorkspace(prisma)),
    realRegistrationContentWorkspace(prisma),
      realRegistrableDetailPages(prisma),
    );
    service = new SalesProductUseCase(repository, ...realDraftDeletionPorts(prisma), untouchedRegistrationStates);
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
    const targetId = await new RegistrationTargetRepositoryAdapter(prisma as unknown as PrismaService, productTransactionalRead(), realRegistrationContentWorkspace(prisma))
      .create(TEST_ORGANIZATION_ID, {
        salesProductId: created.id,
        channelAccountId: accountId,
        registrationInput: mallInput(),
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
    '부가이미지3', '상품상세설명', '추가상품상세설명_1', '속성분류코드', '속성값1', '속성값2', '인증번호', '인증기관', '관리자메모',
  ];
  const integrity = new ChannelIntegrityAdapter();
  let prisma: PrismaClient;
  let service: SabangnetProductImportService;
  let imageMirror: SalesProductImageService;
  let mirroredUrl: (url: string) => string;
  let detailPages: ChannelRegistrableDetailPagePort;
  let editor: DetailPageRepositoryAdapter;

  async function detail() {
    const { id } = await product();
    return detailPages.read({ organizationId: TEST_ORGANIZATION_ID, salesProductId: id, selectedDetailPageRevisionId: null });
  }

  async function revisions() {
    const { id } = await product();
    return prisma.detailPageRevision.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID, detailPage: { contentWorkspace: { salesProductId: id } } },
      orderBy: { createdAt: 'asc' },
      select: { revisionType: true, html: true },
    });
  }

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
      new RegistrationTargetRepositoryAdapter(prismaService, productTransactionalRead(), realRegistrationContentWorkspace(prismaService)),
    realRegistrationContentWorkspace(prismaService),
      realRegistrableDetailPages(prismaService),
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
    detailPages = realRegistrableDetailPages(prismaService);
    imageMirror = new SalesProductImageService(repository, images, logger, integrity, detailPages);
    editor = new DetailPageRepositoryAdapter(prismaService);
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
      updated: ['name', 'brand'],
    })]);
    const after = await product();
    expect(after).toMatchObject({
      id: imported.id,
      code: imported.code,
      ownCode: OWN_CODE,
      name: '투명우산 그리기 세트',
      brand: '새 브랜드',
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

  it('puts the file detail in the product\'s content as its first revision, and a same-detail reimport adds none', async () => {
    await service.import(TEST_ORGANIZATION_ID, file({ 상품상세설명: '<p>상세 1</p>' }), false);

    await expect(prisma.contentWorkspace.count({
      where: { organizationId: TEST_ORGANIZATION_ID, salesProductId: (await product()).id, status: 'active', isDeleted: false },
    })).resolves.toBe(1);
    await expect(detail()).resolves.toMatchObject({ html: '<p>상세 1</p>' });

    await reimport({ 상품상세설명: '<p>상세 1</p>', 관리자메모: '사방넷 메모 2' });
    await expect(revisions()).resolves.toEqual([{ revisionType: 'imported', html: '<p>상세 1</p>' }]);

    await reimport({ 상품상세설명: '<p>상세 2</p>' });
    await expect(detail()).resolves.toMatchObject({ html: '<p>상세 2</p>' });
  });

  it('records the source and the 상품상세설명 digest on the imported revision, and imports nothing from a row with only the extra detail', async () => {
    await service.import(TEST_ORGANIZATION_ID, file({ 상품상세설명: '<p>상세 1</p>', 추가상품상세설명_1: '<p>추가 1</p>' }), false);
    const imported = await product();
    await expect(prisma.detailPageRevision.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID, detailPage: { contentWorkspace: { salesProductId: imported.id } } },
      select: { source: true, sourceDigest: true, html: true },
    })).resolves.toEqual([{ source: 'sabangnet', sourceDigest: integrity.sha256('<p>상세 1</p>'), html: '<p>상세 1</p>' }]);
    expect(imported.sourceRaw).toMatchObject({ '#digest:상품상세설명': integrity.sha256('<p>상세 1</p>') });

    // 추가 상세만 바뀐 파일은 같은 상세다.
    await reimport({ 상품상세설명: '<p>상세 1</p>', 추가상품상세설명_1: '<p>추가 2</p>', 관리자메모: '사방넷 메모 2' });
    await expect(revisions()).resolves.toHaveLength(1);

    await service.import(TEST_ORGANIZATION_ID, file({ 품번코드: '100018', 자체상품코드: 'OWN-100018', 상품상세설명: '', 추가상품상세설명_1: '<p>추가만</p>' }), false);
    const onlyExtra = await prisma.salesProduct.findFirstOrThrow({ where: { organizationId: TEST_ORGANIZATION_ID, sabangnetGoodsNo: '100018' } });
    await expect(prisma.detailPageRevision.count({
      where: { organizationId: TEST_ORGANIZATION_ID, detailPage: { contentWorkspace: { salesProductId: onlyExtra.id } } },
    })).resolves.toBe(0);
    await expect(detailPages.read({
      organizationId: TEST_ORGANIZATION_ID, salesProductId: onlyExtra.id, selectedDetailPageRevisionId: null,
    })).resolves.toBeNull();
  });

  it('keeps an operator-edited detail current across a reimport — the new file detail only joins the history', async () => {
    await service.import(TEST_ORGANIZATION_ID, file({}), false);
    const importedPage = await prisma.detailPage.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, source: 'imported' },
    });
    await prisma.$transaction((tx) => editor.appendRevision(ownerTransaction(tx), {
      organizationId: TEST_ORGANIZATION_ID,
      detailPageId: importedPage.id,
      revisionType: 'manual_edit',
      html: '<p>운영자 상세</p>',
      imageUrls: [],
      createdByUserId: null,
    }));

    await reimport({ 상품상세설명: '<p>상세 2</p>' });

    await expect(detail()).resolves.toMatchObject({ html: '<p>운영자 상세</p>' });
    await expect(revisions()).resolves.toEqual([
      { revisionType: 'imported', html: '<p>상세 1</p>' },
      { revisionType: 'manual_edit', html: '<p>운영자 상세</p>' },
      { revisionType: 'imported', html: '<p>상세 2</p>' },
    ]);
  });

  it('moves the Sabangnet photos inside imported details with the product photos, keeping the source digest so a same-file reimport adds nothing', async () => {
    const DETAIL_IMAGE = 'https://pic.sabangnet.co.kr/detail/100017_d1.jpg';
    const html = `<p>상세</p><img src="${DETAIL_IMAGE}"><img src="${IMAGE_A}">`;
    await service.import(TEST_ORGANIZATION_ID, file({ 상품상세설명: html }), false);

    await expect(imageMirror.external(TEST_ORGANIZATION_ID)).resolves.toEqual({ images: 3, products: 1 });
    const result = await imageMirror.mirror(TEST_ORGANIZATION_ID);

    expect(result).toMatchObject({ mirrored: 3, failedCount: 0, remaining: 0 });
    const [revision] = await prisma.detailPageRevision.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID, source: 'sabangnet' },
      select: { html: true, imageUrls: true, sourceDigest: true },
    });
    expect(revision).toEqual({
      html: `<p>상세</p><img src="${mirroredUrl(DETAIL_IMAGE)}"><img src="${mirroredUrl(IMAGE_A)}">`,
      imageUrls: [mirroredUrl(DETAIL_IMAGE), mirroredUrl(IMAGE_A)],
      sourceDigest: integrity.sha256(html),
    });
    await expect(detail()).resolves.toMatchObject({ imageUrls: [mirroredUrl(DETAIL_IMAGE), mirroredUrl(IMAGE_A)] });
    await expect(imageMirror.external(TEST_ORGANIZATION_ID)).resolves.toEqual({ images: 0, products: 0 });

    await reimport({ 상품상세설명: html, 관리자메모: '사방넷 메모 2' });
    await expect(revisions()).resolves.toHaveLength(1);
  });

  it('stores the mall template values a target can hold, and names a 25 000-character 상단추가문구 in an issue line instead', async () => {
    await service.import(TEST_ORGANIZATION_ID, file({}), false);
    const { id: productId } = await product();
    const accountId = randomUUID();
    await prisma.channelAccount.create({ data: {
      id: accountId, organizationId: TEST_ORGANIZATION_ID, channel: '11st', name: '11번가', externalAccountId: `external-${accountId}`, status: 'active',
    } });
    const target = await prisma.registrationTarget.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, salesProductId: productId, channelAccountId: accountId,
      registrationInput: { mallCategory: null, mallFields: { deliveryTemplate: 'T1' }, adapter: {} },
    } });
    const book = (title: string, headers: string[], rows: (string | null)[][]) => {
      const sheet = XLSX.utils.aoa_to_sheet([[title], headers, headers.map((header) => `▶${header} 설명`), ...rows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
      return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    };
    const files = [
      { originalname: '쇼핑몰상품수정_다운로드.xlsx', buffer: book('상품관리 > 쇼핑몰상품수정', ['쇼핑몰코드', '쇼핑몰상품코드', '품번코드', '부가정보코드'], [
        ['shop0464', '438217859', GOODS_NO, '00102324'],
      ]) },
      { originalname: '부가정보.xlsx', buffer: book(' 쇼핑몰관리 > 쇼핑몰부가정보 > 수정파일', [
        '부가정보코드\n[수정불가]', '쇼핑몰명\n[수정불가]', '부가정보 제목', '카테고리(쇼핑몰)\n[수정불가]', '사용여부',
        '상품설명 상단 추가문구', '상품설명 하단 추가문구', '상품명 추가 앞문구', '상품명 추가 뒷문구',
      ], [['00102324', '11번가', '무료배송', '장난감 > 역할놀이', '사용', 'a'.repeat(25_000), null, '[키드아이템]', null]]) },
    ];

    const result = await service.import(TEST_ORGANIZATION_ID, files, false);

    expect(result.mallValues).toMatchObject({ pairs: 1 });
    expect(result.issues).toContainEqual(expect.objectContaining({ code: GOODS_NO, message: expect.stringContaining('sabangnetDetailTop') }));
    const stored = await prisma.registrationTarget.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored.registrationInput).toEqual({
      mallCategory: null,
      mallFields: {
        deliveryTemplate: 'T1',
        sabangnetTemplateCode: '00102324',
        sabangnetTemplateTitle: '무료배송',
        sabangnetCategoryPath: '장난감 > 역할놀이',
        sabangnetNamePrefix: '[키드아이템]',
      },
      adapter: {},
    });
  });

  it('never matches a draft by own code — the row becomes an issue naming the draft and the rest of the file still lands', async () => {
    const draft = await prisma.salesProduct.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, status: 'draft', name: '직접 작성 초안', ownCode: 'OWN-1',
    } });
    const row = (goodsNo: string, ownCode: string, name: string) => HEADERS.map((header) => ({
      품번코드: goodsNo, 상품명: name, 자체상품코드: ownCode, 판매가: 1000, '옵션제목(1)': '단품', '옵션상세명칭(1)': '단품',
    } as Row)[header] ?? '');
    const sheet = XLSX.utils.aoa_to_sheet([HEADERS, row('200001', 'OWN-1', '초안과 같은 자체코드'), row('200002', 'OWN-2', '새 상품')]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
    const files = [{ originalname: 'products.xlsx', buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer }];

    const preview = await service.import(TEST_ORGANIZATION_ID, files, true);
    expect(preview.existingChanges).toEqual([]);
    const saved = await service.import(TEST_ORGANIZATION_ID, files, false, [{
      salesProductId: draft.id, expectedVersion: draft.version,
    }]);

    expect(saved.issues).toContainEqual(expect.objectContaining({
      kind: 'products', code: 'OWN-1', message: expect.stringContaining('직접 작성 초안'),
    }));
    expect(saved.products).toMatchObject({ created: 1, updated: 0 });
    expect(await prisma.salesProduct.findFirstOrThrow({ where: { ownCode: 'OWN-2' } }))
      .toMatchObject({ status: 'active', code: expect.stringMatching(/^KID\d{8}$/) });
    expect(await prisma.salesProduct.findUniqueOrThrow({ where: { id: draft.id } }))
      .toMatchObject({ status: 'draft', code: null, name: '직접 작성 초안', sabangnetGoodsNo: null, version: draft.version });
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

describe('mall sheets read the detail from the product\'s content revision (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let repository: SalesProductRepositoryAdapter;
  let sheets: SalesProductMallSheetService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    repository = new SalesProductRepositoryAdapter(
      prismaService,
      productTransactionalRead(),
      new RegistrationTargetRepositoryAdapter(prismaService, productTransactionalRead(), realRegistrationContentWorkspace(prismaService)),
      realRegistrationContentWorkspace(prismaService),
      realRegistrableDetailPages(prismaService),
    );
    // 몰 양식 파일 · 카테고리표는 저장소 경계 밖이다 — 빈 표면 된다.
    const files = {
      categoryTables: async () => ({ paths: {}, esmBySite: {}, coupang: {}, icecream: { byCode: {}, ambiguous: {}, notices: {}, brands: {} } }),
      write: async () => Buffer.from('sheet'),
    } as unknown as ConstructorParameters<typeof SalesProductMallSheetService>[1];
    sheets = new SalesProductMallSheetService(repository, files, { log() {}, warn() {} }, realRegistrableDetailPages(prismaService));
  });
  afterAll(async () => { await prisma?.$disconnect(); });
  beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); });

  it('puts the current revision into the mall sheet and blocks a product whose content has none', async () => {
    const withDetail = importWrite(await createAccount(prisma, TEST_ORGANIZATION_ID));
    withDetail.detail = { html: '<p>콘텐츠 상세</p>', digest: 'digest-1' };
    const withoutDetail = importWrite(await createAccount(prisma, TEST_ORGANIZATION_ID));
    await repository.importSabangnet(TEST_ORGANIZATION_ID, [withDetail, withoutDetail]);
    const ids = await repository.readProductIdsByCodes(TEST_ORGANIZATION_ID, [withDetail.create.code!, withoutDetail.create.code!]);

    const check = await sheets.check(TEST_ORGANIZATION_ID, 'teacherville', { salesProductIds: [...ids.values()] });
    const problems = Object.fromEntries(check.products.map((item) => [item.salesProductId, item.problems]));
    expect(problems[ids.get(withDetail.create.code!)!]).not.toContain('상세설명이 비어 있습니다.');
    expect(problems[ids.get(withoutDetail.create.code!)!]).toContain('상세설명이 비어 있습니다.');
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
      new RegistrationTargetRepositoryAdapter(prisma as unknown as PrismaService, productTransactionalRead(), realRegistrationContentWorkspace(prisma)),
    realRegistrationContentWorkspace(prisma),
      realRegistrableDetailPages(prisma),
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

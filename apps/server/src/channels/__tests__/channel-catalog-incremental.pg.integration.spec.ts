import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import {
  updateChannelCatalogDetails,
  upsertChannelCatalogBasics,
} from '../adapter/out/repository/channel-catalog-identity-upsert';
import { ChannelListingQueryPersistenceAdapter } from '../adapter/out/persistence/channel-listing-query.persistence.adapter';
import type {
  ChannelCatalogDetailIdentityProduct,
  ChannelCatalogIdentityProduct,
} from '../domain/collection/catalog-identities';
import { publishWingCatalogWorkbook } from '../adapter/out/repository/channel-catalog-import.repository.adapter';
import { ChannelsProductMappingGenerationAdapter } from '../adapter/out/products/product-mapping-generation.adapter';
import { ProductMappingGenerationRepositoryAdapter } from '../../products/adapter/out/persistence/product-mapping-generation.repository.adapter';
import type { ParsedWingCatalogRow } from '../application/port/out/documents/channel-document.models';
import { resolveChannelListingSaleStatus } from '@kiditem/shared/channel-listing';
import { makeChannelRecipes } from '../../test-helpers/channel-catalog-ports';
import { makeWingCatalogOperations } from '../../test-helpers/wing-catalog-operations';

const workbookDeps = (prisma: PrismaClient) => ({
  recipes: makeChannelRecipes(prisma),
  productMapping: new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()),
});

/**
 * KID-348·349: 목록·상세·엑셀이 rawJson의 자기 구역만 쓰고, 증분 동기화가 상세 대상만 받는
 * 흐름을 실제 PostgreSQL에서 확인한다.
 */
describe('Wing catalog incremental sync and rawJson sections (PG integration)', () => {
  let prisma: PrismaClient;
  let channelAccountId: string;

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
    channelAccountId = (await prisma.channelAccount.create({
      data: { organizationId: ORG, channel: 'coupang', name: 'Wing', vendorId: 'V1' },
    })).id;
  });

  const writeBasics = (products: ChannelCatalogIdentityProduct[]) =>
    prisma.$transaction((tx) => upsertChannelCatalogBasics(tx, {
      organizationId: ORG,
      channelAccountId,
      products,
      lastImportRunId: null,
      rawSource: 'coupang_catalog_basics',
    }));

  const writeDetails = (products: ChannelCatalogDetailIdentityProduct[]) =>
    prisma.$transaction((tx) => updateChannelCatalogDetails(tx, {
      organizationId: ORG,
      channelAccountId,
      products,
      lastImportRunId: ORG,
      rawSource: 'coupang_catalog_details',
    }));

  const writeExcel = (rows: ParsedWingCatalogRow[], observedAt = '2026-09-24T09:00:00.000Z') =>
    prisma.$transaction((tx) => publishWingCatalogWorkbook(tx, workbookDeps(prisma), {
      organizationId: ORG,
      channelAccountId,
      operationId: randomUUID(),
      rows,
      skippedRows: [],
      observedAt,
    }));

  const listingRow = (externalId = 'P1') => prisma.channelListing.findFirstOrThrow({
    where: { organizationId: ORG, channelAccountId, externalId },
    select: {
      id: true,
      isActive: true,
      rawJson: true,
      options: { select: { rawJson: true, attributesJson: true, barcode: true, modelNumber: true, itemName: true, status: true } },
    },
  });

  const expectAllPathsKept = async () => {
    const row = await listingRow();
    expect(row.rawJson).toMatchObject({
      list: { modifiedOn: '2026-09-01T10:00:00' },
      detail: { documents: [{ id: 'D1', kind: 'notices', value: { 품명: '장난감' } }] },
      catalogExcel: { observedAt: '2026-09-24T09:00:00.000Z', row: { 검색어: '블록,장난감' } },
    });
    const option = row.options[0]!;
    expect(option.rawJson).toMatchObject({
      vendorItemId: 'VI-P1',
      list: { raw: { stockQuantity: 7, originalPrice: 12_000 } },
      detail: { documentIds: ['D1'] },
      catalogExcel: { row: { '옵션 ID': 'P1-O' } },
    });
    // 엑셀 바코드 칸이 비어도 상세가 준 바코드가 남는다.
    expect(option.barcode).toBe('8800000000001');
    expect(option.modelNumber).toBe('MODEL-X');
    expect(option.attributesJson).toEqual(expect.arrayContaining([
      { kind: 'purchase', attributeTypeId: '1001', name: '색상', value: '빨강', exposed: null },
      { kind: 'search', attributeTypeId: null, name: '재질', value: '플라스틱', exposed: null },
    ]));
    expect(option.attributesJson).toHaveLength(2);
  };

  it('목록 → 상세 → 엑셀 순서로 써도 앞 구역의 값과 두 kind의 속성이 모두 남는다', async () => {
    await writeBasics([basicProduct('P1', { modifiedOn: '2026-09-01T10:00:00' })]);
    await writeDetails([detailProduct('P1')]);
    await writeExcel([excelRow('P1')]);
    await expectAllPathsKept();
  });

  it('엑셀 → 상세 → 목록 역순으로 써도 결과가 같다', async () => {
    await writeExcel([excelRow('P1', { barcode: '8800000000001' })]);
    await writeBasics([basicProduct('P1', { modifiedOn: '2026-09-01T10:00:00' })]);
    await writeDetails([detailProduct('P1')]);
    await expectAllPathsKept();
  });

  it('엑셀 구매옵션 줄이 일부 속성만 채우면 그 속성만 바꾸고 상세가 준 다른 구매속성은 남는다', async () => {
    await writeBasics([basicProduct('P1')]);
    await writeDetails([detailProduct('P1')]);
    await writeExcel([excelRow('P1', {
      attributesJson: [{ kind: 'purchase', type: '수량', value: '2개', attributeTypeId: '2002' }],
    })]);
    const option = (await listingRow()).options[0]!;
    expect(option.attributesJson).toEqual([
      { kind: 'purchase', attributeTypeId: '1001', name: '색상', value: '빨강', exposed: null },
      { kind: 'purchase', attributeTypeId: '2002', name: '수량', value: '2개', exposed: null },
    ]);
  });

  it('엑셀의 빈 칸은 저장된 바코드·모델번호·옵션명·판매상태를 지우지 않고, 엑셀은 목록에 없는 상품을 끄지 않는다', async () => {
    await writeBasics([basicProduct('P1'), basicProduct('P2')]);
    await writeDetails([detailProduct('P1')]);
    await writeExcel([excelRow('P1', { modelNumber: null, optionName: null, skuStatus: null })]);
    const row = await listingRow();
    expect(row.options[0]).toMatchObject({
      barcode: '8800000000001',
      modelNumber: null,
      itemName: '기본',
      status: 'ONSALE',
    });
    await expect(listingRow('P2')).resolves.toMatchObject({ isActive: true });
  });

  it('엑셀로 처음 만든 리스팅에도 판매상태·승인상태 평면 키가 있어 판매상태 읽기가 동작한다', async () => {
    await writeExcel([excelRow('P-EXCEL', { skuStatus: '판매중', productStatus: '승인완료', exposedProductId: 'E-1', adult: false })]);
    const row = await listingRow('P-EXCEL');
    expect(row.rawJson).toMatchObject({
      source: 'coupang_wing_catalog',
      saleStatus: '판매중',
      productStatus: '승인완료',
      // 파서가 정규화한 상품 칸도 리스팅 엑셀 구역에 남는다.
      catalogExcel: { row: { 등록상품ID: 'P-EXCEL' }, searchTags: ['블록', '장난감'], exposedProductId: 'E-1', adult: false },
    });
    expect((row.options[0]!.rawJson as { catalogExcel: Record<string, unknown> }).catalogExcel)
      .not.toHaveProperty('searchTags');
  });

  it('옛 교체 경로가 남긴 평면 판매상태보다 엑셀이 쓴 saleStatus를 판매상태 읽기가 먼저 본다', async () => {
    // 구역 이전 엑셀 가져오기는 raw_json을 한글 헤더 그대로 통째로 바꿨다.
    await prisma.channelListing.create({
      data: {
        organizationId: ORG,
        channelAccountId,
        externalId: 'P-LEGACY',
        rawJson: { 등록상품ID: 'P-LEGACY', 판매상태: '판매중지' },
      },
    });
    await writeExcel([excelRow('P-LEGACY', { skuStatus: '판매중' })]);
    const raw = (await listingRow('P-LEGACY')).rawJson as Record<string, unknown>;
    expect(raw).toMatchObject({ saleStatus: '판매중', 판매상태: '판매중지' });
    // Products·Analytics·매칭의 판매상태 읽기는 이 순서의 첫 키를 본다.
    const readerKeys = ['saleStatus', 'salesStatus', 'sale_status', '판매상태'];
    const rawStatus = readerKeys.map((key) => raw[key]).find((value) => typeof value === 'string' && value.trim());
    expect(resolveChannelListingSaleStatus({ rawStatus: rawStatus as string, isActive: true })).toBe('판매중');
  });

  it('목록은 list 구역에, 상세는 detail 구역에 쓰고 평면 modifiedOn·detailDocuments는 쓰지 않는다', async () => {
    await writeBasics([basicProduct('P1', { modifiedOn: '2026-09-01T10:00:00', createdOn: '2026-01-02 03:04:05', saleStatus: 'ONSALE', listOnly: 1 })]);
    await writeDetails([detailProduct('P1')]);

    const row = await listingRow();
    const raw = row.rawJson as Record<string, unknown>;
    expect(raw).not.toHaveProperty('modifiedOn');
    expect(raw).not.toHaveProperty('detailDocuments');
    expect(raw).not.toHaveProperty('listOnly');
    expect(raw).toMatchObject({
      source: 'coupang_catalog_details',
      externalProductId: 'P1',
      createdOn: '2026-01-02 03:04:05',
      saleStatus: 'ONSALE',
      list: {
        modifiedOn: '2026-09-01T10:00:00',
        createdOn: '2026-01-02 03:04:05',
        raw: { listOnly: 1 },
      },
      detail: {
        documents: [{ id: 'D1', kind: 'notices', value: { 품명: '장난감' } }],
        raw: { detailOnly: true },
      },
    });
    const option = row.options[0]!;
    const optionRaw = option.rawJson as Record<string, unknown>;
    expect(optionRaw).not.toHaveProperty('detailDocumentIds');
    expect(optionRaw).not.toHaveProperty('stockQuantity');
    expect(optionRaw).toMatchObject({
      vendorItemId: 'VI-P1',
      registrationType: 'NORMAL',
      list: { raw: { stockQuantity: 7, originalPrice: 12_000 } },
      detail: { documentIds: ['D1'] },
    });
    expect(option.attributesJson).toEqual([
      { kind: 'purchase', attributeTypeId: '1001', name: '색상', value: '빨강', exposed: null },
    ]);
    expect(option.barcode).toBe('8800000000001');
  });

  it('구역 이전의 평면 행을 그대로 읽고, 다음 쓰기에서 구역을 얻는다', async () => {
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: ORG,
        channelAccountId,
        externalId: 'P1',
        rawJson: {
          source: 'coupang_catalog_details',
          modifiedOn: '2026-08-01T00:00:00',
          // 옛 행에는 모양이 틀린 문서가 섞여 있을 수 있다: 읽기는 건너뛴다.
          detailDocuments: [{ id: 'OLD', kind: 'notices', value: { 품명: '옛 문서' } }, { id: '', kind: 'notices' }],
        },
      },
      select: { id: true },
    });
    await prisma.channelListingOption.create({
      data: {
        organizationId: ORG,
        listingId: listing.id,
        externalOptionId: 'P1-O',
        rawJson: { vendorItemId: 'VI-P1', detailDocumentIds: ['OLD'] },
        attributesJson: [{ type: '사이즈', value: 'L' }],
      },
    });
    const reader = new ChannelListingQueryPersistenceAdapter(prisma as never);

    const legacy = await reader.getWorkspace(ORG, listing.id);
    expect(legacy?.providerDetail?.sourceDetail).toEqual({
      documents: [{ id: 'OLD', kind: 'notices', value: { 품명: '옛 문서' } }],
      options: [{ externalOptionId: 'P1-O', documentIds: ['OLD'] }],
    });
    expect(legacy?.providerDetail?.options[0]?.attributes).toEqual([
      { kind: 'purchase', attributeTypeId: null, name: '사이즈', value: 'L', exposed: null },
    ]);

    await writeBasics([basicProduct('P1', { modifiedOn: '2026-09-01T10:00:00' })]);
    const migrated = (await listingRow()).rawJson as Record<string, unknown>;
    expect(migrated).toMatchObject({ list: { modifiedOn: '2026-09-01T10:00:00' } });
    // 옛 상세 문서는 새 구역이 생길 때까지 평면 키로 남아 계속 읽힌다.
    const afterBasics = await reader.getWorkspace(ORG, listing.id);
    expect(afterBasics?.providerDetail?.sourceDetail?.documents).toEqual([
      { id: 'OLD', kind: 'notices', value: { 품명: '옛 문서' } },
    ]);
  });
});

function basicProduct(
  id: string,
  raw: Record<string, unknown> = {},
): ChannelCatalogIdentityProduct {
  return {
    externalProductId: id,
    registeredName: id,
    displayName: id,
    category: null,
    manufacturer: null,
    brand: null,
    productStatus: 'APPROVED',
    raw,
    media: [],
    options: [{
      externalOptionId: `${id}-O`,
      optionName: '기본',
      salePrice: 10_000,
      sellerSku: null,
      barcode: null,
      modelNumber: null,
      skuStatus: 'ONSALE',
      attributes: [],
      raw: { vendorItemId: `VI-${id}`, registrationType: 'NORMAL', stockQuantity: 7, originalPrice: 12_000 },
    }],
  };
}

function detailProduct(id: string): ChannelCatalogDetailIdentityProduct {
  return {
    externalProductId: id,
    documents: [{ id: 'D1', kind: 'notices', value: { 품명: '장난감' } }],
    raw: { detailOnly: true },
    options: [{
      externalOptionId: `${id}-O`,
      vendorItemId: `VI-${id}`,
      barcode: '8800000000001',
      attributes: [{ type: '색상', value: '빨강', attributeTypeId: '1001' }],
      documentIds: ['D1'],
      raw: {},
    }],
  };
}

function excelRow(id: string, overrides: Partial<ParsedWingCatalogRow> = {}): ParsedWingCatalogRow {
  return {
    rowNumber: 5,
    externalProductId: id,
    registeredName: id,
    displayName: id,
    category: '완구',
    manufacturer: null,
    brand: null,
    productStatus: '승인완료',
    externalSkuId: `${id}-O`,
    optionName: '기본',
    skuStatus: '판매중',
    modelNumber: 'MODEL-X',
    barcode: null,
    attributesJson: [{ kind: 'search', type: '재질', value: '플라스틱' }],
    searchTags: ['블록', '장난감'],
    exposedProductId: null,
    adult: null,
    rawJson: { 등록상품ID: id, '옵션 ID': `${id}-O`, 검색어: '블록,장난감', 바코드: '' },
    ...overrides,
  };
}

type SyncProduct = { id: string; modifiedOn: string | null };

/**
 * 브라우저 동기화(목록 kind → 상세 kind, KID-354)를 실제 실행 계약과 PostgreSQL로 돌린다. 확장이 하는 일
 * (목록 전체 → 목록 result의 `next` scope로 상세 → finish)을 서버 포트로 그대로 밟는다.
 */
describe('Wing catalog incremental browser sync over the operation contract (PG integration)', () => {
  let prisma: PrismaClient;
  let wing: ReturnType<typeof makeWingCatalogOperations>;
  let channelAccountId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    wing = makeWingCatalogOperations(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    channelAccountId = (await prisma.channelAccount.create({
      data: { organizationId: ORG, channel: 'coupang', name: 'Wing', vendorId: 'V1' },
    })).id;
  });

  type DetailsScope = { channelAccountId: string; detailTargetProductIds: string[]; absentProductIds: string[]; via?: 'list' | 'manual' };

  /** 목록 kind를 끝까지 돌리고 result(상세 계획·next)를 돌려준다. */
  async function runList(products: readonly SyncProduct[], optionCount = 1) {
    const finished = await wing.runList(channelAccountId, products.map((product) => wireBasicProduct(product, optionCount)));
    expect(finished.status).toBe('succeeded');
    return finished.result as {
      listedProductCount: number;
      detailTargetProductIds: string[];
      absentProductIds: string[];
      next: { kind: string; scope: DetailsScope } | null;
    };
  }

  const detailsScopeOf = (list: Awaited<ReturnType<typeof runList>>): DetailsScope =>
    list.next?.scope ?? { channelAccountId, detailTargetProductIds: [], absentProductIds: [] };

  const detailSection = async (id: string) => {
    const row = await prisma.channelListing.findFirstOrThrow({
      where: { organizationId: ORG, channelAccountId, externalId: id },
      select: { rawJson: true },
    });
    return (row.rawJson as { detail?: unknown }).detail ?? null;
  };

  async function syncAll(products: readonly SyncProduct[]) {
    const list = await runList(products);
    const scope = detailsScopeOf(list);
    const details = await wing.runDetails(scope, scope.detailTargetProductIds.map((id) => wireDetailProduct(id, '장난감')));
    return { list, details };
  }

  it('목록 kind가 리스팅을 lastOperationId로 반영하고 신규·modifiedOn 변경·상세 없는 상품만 result.next의 상세 대상으로 계획한다', async () => {
    const first: SyncProduct[] = [
      { id: 'P1', modifiedOn: '2026-09-01T00:00:00' },
      { id: 'P2', modifiedOn: '2026-09-01T00:00:00' },
      { id: 'P3', modifiedOn: '2026-09-01T00:00:00' },
    ];
    const initial = await syncAll(first);
    expect(initial.list).toEqual({
      listedProductCount: 3,
      detailTargetProductIds: ['P1', 'P2', 'P3'],
      absentProductIds: [],
      next: {
        kind: 'channels.wing_catalog_details',
        scope: { channelAccountId, detailTargetProductIds: ['P1', 'P2', 'P3'], absentProductIds: [], via: 'list' },
      },
    });
    expect(initial.details).toMatchObject({ status: 'succeeded', lockKeys: [] });
    const p2Detail = await detailSection('P2');
    expect(p2Detail).toMatchObject({ documents: [{ id: 'P2-D1' }], modifiedOn: '2026-09-01T00:00:00' });
    await expect(prisma.channelListing.findFirstOrThrow({
      where: { organizationId: ORG, channelAccountId, externalId: 'P1' },
      select: { lastImportRunId: true, lastOperationId: true, options: { select: { lastImportRunId: true, lastOperationId: true } } },
    })).resolves.toEqual({
      lastImportRunId: null,
      lastOperationId: initial.details.id,
      options: [{ lastImportRunId: null, lastOperationId: initial.details.id }],
    });

    const second: SyncProduct[] = [
      { id: 'P1', modifiedOn: '2026-09-20T00:00:00' },
      { id: 'P2', modifiedOn: '2026-09-01T00:00:00' },
      { id: 'P3', modifiedOn: '2026-09-01T00:00:00' },
      { id: 'P4', modifiedOn: '2026-09-20T00:00:00' },
    ];
    const list = await runList(second);
    expect(list).toMatchObject({ listedProductCount: 4, detailTargetProductIds: ['P1', 'P4'], absentProductIds: [] });
    const details = await wing.runDetails(detailsScopeOf(list), [wireDetailProduct('P1', '바뀐 장난감'), wireDetailProduct('P4', '장난감')]);
    expect(details.result).toEqual({
      detailTargets: 2, detailApplied: 2, detailUnchanged: 0, deletedProducts: 0, unconfirmedAbsentProductIds: [],
    });

    // 대상 밖 상품의 상세 구역은 그대로다.
    await expect(detailSection('P2')).resolves.toEqual(p2Detail);
    await expect(detailSection('P1')).resolves.toMatchObject({
      documents: [{ id: 'P1-D2', value: { 품명: '바뀐 장난감' } }],
      modifiedOn: '2026-09-20T00:00:00',
    });
    // 바뀐 게 없으면 연쇄하지 않는다.
    await expect(runList(second)).resolves.toMatchObject({ detailTargetProductIds: [], absentProductIds: [], next: null });
  });

  const listingState = (id: string) => prisma.channelListing.findFirstOrThrow({
    where: { organizationId: ORG, channelAccountId, externalId: id },
    select: { status: true, isActive: true, options: { select: { isActive: true } } },
  });

  const listingAndOptionStamps = (id: string) => prisma.channelListing.findFirstOrThrow({
    where: { organizationId: ORG, channelAccountId, externalId: id },
    select: { updatedAt: true, rawJson: true, options: { select: { updatedAt: true, rawJson: true, attributesJson: true } } },
  });

  it('상세 청크는 실행 청크에만 쌓이고 finish 트랜잭션이 한 번에 반영하며 result가 품질 보고다', async () => {
    const products: SyncProduct[] = [
      { id: 'P1', modifiedOn: '2026-09-01T00:00:00' },
      { id: 'P2', modifiedOn: '2026-09-01T00:00:00' },
    ];
    const scope = detailsScopeOf(await runList(products));
    const begun = await wing.operations.begin(ORG, { kind: 'channels.wing_catalog_details', scope }, { userId: USER });
    const payload = [wireDetailProduct('P1', '장난감'), wireDetailProduct('P2', '장난감')];
    await wing.operations.putChunk({
      organizationId: ORG, operationId: begun.operation.id, token: begun.token, chunkKind: 'full_details', sequence: 1,
      request: { checksum: createHash('sha256').update(JSON.stringify(payload)).digest('hex'), payload },
    });
    // 청크를 받는 동안 리스팅은 그대로다.
    await expect(detailSection('P1')).resolves.toBeNull();

    const finished = await wing.operations.finish({
      organizationId: ORG, operationId: begun.operation.id, token: begun.token, request: { outcome: 'succeeded' },
    });
    expect(finished.operation.result).toEqual({
      detailTargets: 2, detailApplied: 2, detailUnchanged: 0, deletedProducts: 0, unconfirmedAbsentProductIds: [],
    });
    await expect(detailSection('P1')).resolves.toMatchObject({ documents: [{ id: 'P1-D1' }] });
  });

  it('상세 kind가 실패로 끝나면 리스팅에 아무것도 반영되지 않고, 다음 목록 kind가 같은 대상을 다시 잡는다(못 끝낸 대상 추적 없음)', async () => {
    await syncAll([
      { id: 'P1', modifiedOn: '2026-09-01T00:00:00' },
      { id: 'P2', modifiedOn: '2026-09-01T00:00:00' },
    ]);
    const before = await listingAndOptionStamps('P1');

    const changed: SyncProduct[] = [
      { id: 'P1', modifiedOn: '2026-09-20T00:00:00' },
      { id: 'P2', modifiedOn: '2026-09-01T00:00:00' },
    ];
    const list = await runList(changed);
    expect(list.detailTargetProductIds).toEqual(['P1']);
    const failed = await wing.runDetails(detailsScopeOf(list), [wireDetailProduct('P1', '바뀐 장난감')], [], { outcome: 'failed' });
    expect(failed).toMatchObject({ status: 'failed', lockKeys: [] });
    const after = await listingAndOptionStamps('P1');
    expect((after.rawJson as { detail: unknown }).detail).toEqual((before.rawJson as { detail: unknown }).detail);
    expect(after.options.map((option) => (option.rawJson as { detail: unknown }).detail))
      .toEqual(before.options.map((option) => (option.rawJson as { detail: unknown }).detail));

    await expect(runList(changed)).resolves.toMatchObject({ detailTargetProductIds: ['P1'] });
  });

  it('같은 상세를 다시 받으면 리스팅·옵션 내용은 쓰지 않고 detailModifiedOn만 올려 다음 동기화의 대상이 아니다', async () => {
    await syncAll([{ id: 'P1', modifiedOn: '2026-09-01T00:00:00' }]);
    // 가격만 바뀌어 modifiedOn이 올라갔고 상세 내용은 같다.
    const bumped: SyncProduct[] = [{ id: 'P1', modifiedOn: '2026-09-20T00:00:00' }];
    const list = await runList(bumped);
    expect(list.detailTargetProductIds).toEqual(['P1']);
    const afterList = await listingAndOptionStamps('P1');
    const details = await wing.runDetails(detailsScopeOf(list), [wireDetailProduct('P1', '장난감')]);

    expect(details.result).toMatchObject({ detailTargets: 1, detailApplied: 0, detailUnchanged: 1 });
    const afterDetails = await listingAndOptionStamps('P1');
    expect(afterDetails.options).toEqual(afterList.options);
    const { modifiedOn: basis, ...detailContent } = (afterDetails.rawJson as { detail: Record<string, unknown> }).detail;
    const { modifiedOn: _old, ...detailBefore } = (afterList.rawJson as { detail: Record<string, unknown> }).detail;
    expect(detailContent).toEqual(detailBefore);
    expect(basis).toBe('2026-09-20T00:00:00');

    await expect(runList(bumped)).resolves.toMatchObject({ detailTargetProductIds: [], next: null });
  });

  const confirmation = (externalProductId: string, outcome: 'deleted' | 'present' | 'not_found') =>
    ({ externalProductId, outcome, productStatus: null });

  it('상태 칸이 비어(NULL) 있는 리스팅도 삭제로 확인되면 DELETED로 끄고 다음 계획에 다시 넣지 않는다', async () => {
    await syncAll([
      { id: 'P1', modifiedOn: '2026-09-01T00:00:00' },
      { id: 'P-NULL', modifiedOn: '2026-09-01T00:00:00' },
    ]);
    await prisma.channelListing.updateMany({
      where: { organizationId: ORG, channelAccountId, externalId: 'P-NULL' },
      data: { status: null },
    });
    const listed: SyncProduct[] = [{ id: 'P1', modifiedOn: '2026-09-01T00:00:00' }];
    const list = await runList(listed);
    expect(list.absentProductIds).toEqual(['P-NULL']);
    const details = await wing.runDetails(detailsScopeOf(list), [], [confirmation('P-NULL', 'deleted')]);
    expect(details.result).toMatchObject({ deletedProducts: 1, unconfirmedAbsentProductIds: [] });
    await expect(listingState('P-NULL')).resolves.toEqual({ status: 'DELETED', isActive: false, options: [{ isActive: false }] });
    await expect(runList(listed)).resolves.toMatchObject({ absentProductIds: [], next: null });
  });

  it('삭제 확인: deleted만 DELETED로 끄고, present·unconfirmed는 그대로 두며 미확인을 result에 남긴다', async () => {
    await syncAll(['P1', 'P2', 'P3', 'P4'].map((id) => ({ id, modifiedOn: '2026-09-01T00:00:00' })));
    const listed: SyncProduct[] = [{ id: 'P1', modifiedOn: '2026-09-01T00:00:00' }];
    const list = await runList(listed);
    expect(list).toMatchObject({ detailTargetProductIds: [], absentProductIds: ['P2', 'P3', 'P4'] });
    // 목록 kind는 사라진 상품을 끄지 않는다.
    await expect(listingState('P2')).resolves.toMatchObject({ isActive: true });

    // 사라진 목록 밖 상품의 확인은 거절되고 실행은 executing으로 남는다 — runner가 failed로 닫는다.
    await expect(wing.runDetails(detailsScopeOf(list), [], [confirmation('P1', 'deleted')])).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { reason: 'catalog_scope_mismatch', externalProductId: 'P1' },
    });
    await wing.operations.cancel(ORG, (await wing.operations.findLive(ORG, `account:${channelAccountId}`))!.id);

    const details = await wing.runDetails(detailsScopeOf(list), [], [
      confirmation('P2', 'deleted'),
      confirmation('P3', 'present'),
      confirmation('P4', 'not_found'),
    ]);
    expect(details.result).toEqual({
      detailTargets: 0, detailApplied: 0, detailUnchanged: 0, deletedProducts: 1, unconfirmedAbsentProductIds: ['P4'],
    });
    await expect(listingState('P2')).resolves.toEqual({ status: 'DELETED', isActive: false, options: [{ isActive: false }] });
    await expect(listingState('P3')).resolves.toEqual({ status: 'APPROVED', isActive: true, options: [{ isActive: true }] });
    await expect(listingState('P4')).resolves.toEqual({ status: 'APPROVED', isActive: true, options: [{ isActive: true }] });

    // 삭제로 기록한 상품은 다시 확인하지 않는다.
    await expect(runList(listed)).resolves.toMatchObject({ absentProductIds: ['P3', 'P4'] });
  });

  it('상품 하나 다시 받기는 목록 없이 상세 kind를 scope로 직접 시작하고 같은 finalize로 반영한다', async () => {
    await syncAll([
      { id: 'P1', modifiedOn: '2026-09-01T00:00:00' },
      { id: 'P2', modifiedOn: '2026-09-01T00:00:00' },
    ]);
    const p1Before = await detailSection('P1');

    await expect(wing.runDetails({ channelAccountId, detailTargetProductIds: ['P-UNKNOWN'], absentProductIds: [] }, []))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'catalog_scope_mismatch', externalProductId: 'P-UNKNOWN' } });
    // 사라진 상품은 저장돼 있고 아직 삭제로 기록되지 않은 것만 받는다.
    await expect(wing.runDetails({ channelAccountId, detailTargetProductIds: [], absentProductIds: ['P-GONE'] }, []))
      .rejects.toMatchObject({ details: { reason: 'catalog_scope_mismatch', externalProductId: 'P-GONE' } });

    const refetch = await wing.runDetails(
      { channelAccountId, detailTargetProductIds: ['P2'], absentProductIds: [] },
      [wireDetailProduct('P2', '다시 받은 장난감')],
    );
    expect(refetch.result).toMatchObject({ detailTargets: 1, detailApplied: 1, detailUnchanged: 0, deletedProducts: 0 });
    await expect(detailSection('P2')).resolves.toMatchObject({
      documents: [{ id: 'P2-D2', value: { 품명: '다시 받은 장난감' } }],
    });
    await expect(detailSection('P1')).resolves.toEqual(p1Before);
  });

  it('계정당 하나: 목록이 도는 동안 상세·엑셀은 OPERATION_IN_PROGRESS로 거절되고, 다른 계정의 목록 kind는 계정 불일치로 거절된다', async () => {
    const begun = await wing.operations.begin(ORG, { kind: 'channels.wing_catalog_list', scope: { channelAccountId } }, { userId: USER });
    // 확장은 plan의 판매자 ID로 다른 판매자로 로그인된 Wing의 목록을 거절한다.
    expect(begun.operation.plan).toEqual({ channelAccountId, startedBy: USER, vendorId: 'V1' });
    await expect(wing.runDetails({ channelAccountId, detailTargetProductIds: [], absentProductIds: [] }, []))
      .rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS', details: { operationId: begun.operation.id } });
    await expect(wing.uploadWorkbook(channelAccountId, Buffer.from('not-a-workbook')))
      .rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    const rocket = await prisma.channelAccount.create({ data: { organizationId: ORG, channel: 'rocket', name: 'Rocket' } });
    await expect(wing.runList(rocket.id, [])).rejects.toMatchObject({ code: 'CHANNELS_ACCOUNT_INVALID' });
    await expect(wing.runList('99999999-9999-4999-8999-999999999999', [])).rejects.toMatchObject({ code: 'CHANNELS_ACCOUNT_NOT_FOUND' });
  });

  it('상세 대상 320개(옵션 3 · 이미지 30 · 문서 약 50KB)를 한 번의 finish 트랜잭션으로 반영한다(시간 측정)', async () => {
    const products: SyncProduct[] = Array.from({ length: 320 }, (_, index) => ({
      id: `P${String(index).padStart(4, '0')}`,
      modifiedOn: '2026-09-01T00:00:00',
    }));
    const list = await runList(products, 3);
    expect(list.detailTargetProductIds).toHaveLength(320);
    const scope = detailsScopeOf(list);
    const begun = await wing.operations.begin(ORG, { kind: 'channels.wing_catalog_details', scope }, { userId: USER });
    // 청크는 1MiB 상한이라 50KB 상품은 10개씩 보낸다.
    for (let start = 0, sequence = 1; start < products.length; start += 10, sequence += 1) {
      const payload = products.slice(start, start + 10).map((product) => realisticDetailProduct(product.id));
      await wing.operations.putChunk({
        organizationId: ORG, operationId: begun.operation.id, token: begun.token, chunkKind: 'full_details', sequence,
        request: { checksum: createHash('sha256').update(JSON.stringify(payload)).digest('hex'), payload },
      });
    }
    const started = performance.now();
    const finished = await wing.operations.finish({
      organizationId: ORG, operationId: begun.operation.id, token: begun.token, request: { outcome: 'succeeded' },
    });
    const elapsedMs = Math.round(performance.now() - started);
    process.stdout.write(`WING_DETAILS_FINALIZE_MEASUREMENT ${JSON.stringify({
      targets: 320, options: 960, media: 9_600, documentBytesPerProduct: 50_000, elapsedMs,
    })}\n`);
    expect(finished.operation.result).toMatchObject({ detailTargets: 320, detailApplied: 320, detailUnchanged: 0 });
    await expect(prisma.channelListing.count({
      where: { organizationId: ORG, channelAccountId, rawJson: { path: ['detail', 'documents', '0', 'kind'], equals: 'contents' } },
    })).resolves.toBe(320);
  }, 180_000);

  it('상세 → 엑셀 뒤에 같은 상세를 다시 받아도 속성 순서 때문에 바뀐 것으로 세지 않는다', async () => {
    await syncAll([{ id: 'P1', modifiedOn: '2026-09-01T00:00:00' }]);
    await prisma.$transaction((tx) => publishWingCatalogWorkbook(tx, workbookDeps(prisma), {
      organizationId: ORG, channelAccountId, operationId: randomUUID(),
      rows: [excelRow('P1', { attributesJson: [{ kind: 'search', type: '가재질', value: '면' }] })],
      skippedRows: [], observedAt: '2026-09-24T09:00:00.000Z',
    }));
    const list = await runList([{ id: 'P1', modifiedOn: '2026-09-20T00:00:00' }]);
    const details = await wing.runDetails(detailsScopeOf(list), [wireDetailProduct('P1', '장난감')]);
    expect(details.result).toMatchObject({ detailApplied: 0, detailUnchanged: 1 });
  });
});

function wireBasicProduct(product: SyncProduct, optionCount = 1) {
  const base = wireBasicProductWithOneOption(product);
  if (optionCount === 1) return base;
  return {
    ...base,
    options: Array.from({ length: optionCount }, (_, index) => ({
      ...base.options[0]!,
      externalOptionId: `${product.id}-O${index}`,
      vendorItemId: `VI-${product.id}-${index}`,
      raw: { vendorItemId: `VI-${product.id}-${index}` },
    })),
  };
}

function wireBasicProductWithOneOption(product: SyncProduct) {
  return {
    externalProductId: product.id,
    registeredName: product.id,
    displayName: product.id,
    category: null,
    manufacturer: null,
    brand: null,
    productStatus: 'APPROVED',
    options: [{
      externalOptionId: `${product.id}-O`,
      vendorItemId: `VI-${product.id}`,
      vendorInventoryItemId: null,
      sellerProductItemId: null,
      skuId: null,
      externalSkuCode: null,
      stock: 5,
      stockQuantity: 5,
      soldOut: false,
      optionName: '기본',
      skuStatus: 'ONSALE',
      salePrice: 10_000,
      sellerSku: null,
      modelNumber: null,
      barcode: null,
      attributes: [],
      media: [],
      raw: { vendorItemId: `VI-${product.id}` },
    }],
    media: [],
    raw: product.modifiedOn ? { modifiedOn: product.modifiedOn } : {},
  };
}

/**
 * 실제에 가까운 상세: 옵션 3개, 상품당 이미지 30장(상세 24 · 옵션 6), 상세 문서 약 50KB.
 */
function realisticDetailProduct(id: string) {
  const options = Array.from({ length: 3 }, (_, index) => `${id}-O${index}`);
  const contents = `<div>${'상품 상세 설명 '.repeat(2_600)}</div>`;
  return {
    externalProductId: id,
    options: options.map((externalOptionId, index) => ({
      externalOptionId,
      vendorItemId: `VI-${id}-${index}`,
      sellerProductItemId: null,
      barcode: `88000000${String(index).padStart(5, '0')}`,
      attributes: [
        { type: '색상', value: ['빨강', '파랑', '노랑'][index]!, attributeTypeId: '1001' },
        { type: '수량', value: '1개', attributeTypeId: '2002' },
      ],
      documentIds: [`${id}-contents`, `${id}-notices`],
      raw: { registrationType: 'NORMAL', originalPrice: 15_000, salePrice: 12_900 },
    })),
    documents: [
      { id: `${id}-contents`, kind: 'contents' as const, value: contents },
      { id: `${id}-notices`, kind: 'notices' as const, value: { 품명: '장난감', 제조국: '중국', 인증: 'KC' } },
    ],
    media: [
      ...Array.from({ length: 24 }, (_, index) => ({
        sourceUrl: `https://image.example/${id}/detail-${index}.jpg`,
        role: 'detail' as const,
        sortOrder: index,
        externalOptionIds: options,
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        sourceUrl: `https://image.example/${id}/option-${index}.jpg`,
        role: 'option' as const,
        sortOrder: 24 + index,
        externalOptionIds: [options[index % 3]!],
      })),
    ],
    raw: { status: 'APPROVED', saleStartedAt: '2026-01-01T00:00:00', itemCount: 3 },
  };
}

function wireDetailProduct(id: string, notice: string) {
  // 확장은 문서 ID를 내용에서 만든다: 내용이 바뀌면 ID도 바뀐다.
  const documentId = `${id}-D${notice === '장난감' ? 1 : 2}`;
  return {
    externalProductId: id,
    options: [{
      externalOptionId: `${id}-O`,
      vendorItemId: `VI-${id}`,
      sellerProductItemId: null,
      barcode: '8800000000001',
      attributes: [{ type: '색상', value: '빨강', attributeTypeId: '1001' }],
      documentIds: [documentId],
      raw: {},
    }],
    documents: [{ id: documentId, kind: 'notices' as const, value: { 품명: notice } }],
    media: [{
      sourceUrl: `https://image.example/${id}/detail.jpg`,
      role: 'detail' as const,
      sortOrder: 0,
      externalOptionIds: [`${id}-O`],
    }],
    raw: {},
  };
}

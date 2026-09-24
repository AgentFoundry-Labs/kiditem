import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
import { ChannelCatalogImportRepositoryAdapter } from '../adapter/out/repository/channel-catalog-import.repository.adapter';
import { ChannelOptionRecipeRepositoryAdapter } from '../adapter/out/persistence/channel-option-recipe.repository.adapter';
import { ChannelOptionRecipeService } from '../application/service/listing/channel-option-recipe.service';
import { ProductTransactionalReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { ChannelsProductMappingGenerationAdapter } from '../adapter/out/products/product-mapping-generation.adapter';
import { ProductMappingGenerationRepositoryAdapter } from '../../products/adapter/out/persistence/product-mapping-generation.repository.adapter';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import type { ParsedWingCatalogRow } from '../application/port/out/documents/channel-document.models';
import { randomUUID } from 'node:crypto';
import { resolveChannelListingSaleStatus } from '@kiditem/shared/channel-listing';
import { ChannelIntegrityAdapter } from '../adapter/out/integrity/channel-integrity.adapter';
import { ChannelCatalogCollectionService } from '../application/service/collection/channel-catalog-collection.service';
import { ChannelCatalogCollectionRepositoryAdapter } from '../adapter/out/repository/channel-catalog-collection.repository.adapter';
import { ChannelCatalogPublicationRepositoryAdapter } from '../adapter/out/repository/channel-catalog-publication.repository.adapter';
import { AiCatalogMediaPublicationRepositoryAdapter } from '../../content/adapter/out/repository/ai-catalog-media-publication.repository.adapter';
import { makeChannelListingQuery } from '../../test-helpers/channel-catalog-ports';
import { hashCatalogChunkPayload } from '../domain/collection/catalog-collection-hash';
import type {
  CoupangCatalogCollectionPermit,
  CoupangCatalogCollectionRun,
  PutCoupangCatalogChunkRequest,
} from '@kiditem/shared/coupang-catalog-snapshot';

/**
 * KID-348·349: 목록·상세·엑셀이 rawJson의 자기 구역만 쓰고, 증분 동기화가 상세 대상만 받는
 * 흐름을 실제 PostgreSQL에서 확인한다.
 */
describe('Wing catalog incremental sync and rawJson sections (PG integration)', () => {
  let prisma: PrismaClient;
  let channelAccountId: string;
  let workbookImports: ChannelCatalogImportRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const mappingGeneration = new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter());
    workbookImports = new ChannelCatalogImportRepositoryAdapter(
      prisma as never,
      new SourceFailureAlerts(prisma as never),
      new ChannelOptionRecipeService(new ChannelOptionRecipeRepositoryAdapter(
        prisma as never,
        new ProductTransactionalReadRepositoryAdapter(),
        mappingGeneration,
      )),
      mappingGeneration,
    );
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

  let workbookSequence = 0;
  const writeExcel = async (rows: ParsedWingCatalogRow[], observedAt = '2026-09-24T09:00:00.000Z') => {
    workbookSequence += 1;
    const claim = await workbookImports.claimCoupangWingImport({
      organizationId: ORG,
      userId: USER,
      channelAccountId,
      fileName: 'wing.xlsx',
      fileHash: String(workbookSequence).padStart(64, '0'),
      rowCount: rows.length,
    });
    if (claim.kind !== 'started') throw new Error('workbook import was not admitted');
    return workbookImports.upsertCoupangWingCatalog({
      organizationId: ORG,
      channelAccountId,
      runId: claim.runId,
      attemptToken: claim.attemptToken,
      rows,
      skippedRows: [],
      observedAt,
    });
  };

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
    await writeExcel([excelRow('P-EXCEL', { skuStatus: '판매중', productStatus: '승인완료' })]);
    const row = await listingRow('P-EXCEL');
    expect(row.rawJson).toMatchObject({
      source: 'coupang_wing_catalog',
      saleStatus: '판매중',
      productStatus: '승인완료',
      catalogExcel: { row: { 등록상품ID: 'P-EXCEL' } },
    });
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
          detailDocuments: [{ id: 'OLD', kind: 'notices', value: { 품명: '옛 문서' } }],
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

const channelIntegrity = new ChannelIntegrityAdapter();

type SyncProduct = { id: string; modifiedOn: string | null };

/**
 * 브라우저 동기화 흐름(목록 → 상세)을 owner 서비스로 실제 PostgreSQL에서 돌린다. 확장이 하는 일
 * (목록 전체 발견 → 서버가 말한 누락 상품만 상세 전송 → 종료)을 그대로 흉내 낸다.
 */
describe('Wing catalog incremental browser sync (PG integration)', () => {
  let prisma: PrismaClient;
  let owner: ChannelCatalogCollectionService;
  let channelAccountId: string;
  let workbook: ChannelCatalogImportRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const alerts = new SourceFailureAlerts(prisma as never);
    const mappingGeneration = new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter());
    const recipes = new ChannelOptionRecipeService(new ChannelOptionRecipeRepositoryAdapter(
      prisma as never,
      new ProductTransactionalReadRepositoryAdapter(),
      mappingGeneration,
    ));
    const publisher = new ChannelCatalogPublicationRepositoryAdapter(
      prisma as never,
      new AiCatalogMediaPublicationRepositoryAdapter(makeChannelListingQuery(prisma)),
      alerts,
      recipes,
      mappingGeneration,
    );
    owner = new ChannelCatalogCollectionService(
      new ChannelCatalogCollectionRepositoryAdapter(prisma as never, alerts),
      publisher,
      channelIntegrity,
    );
    workbook = new ChannelCatalogImportRepositoryAdapter(prisma as never, alerts, recipes, mappingGeneration);
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

  const scope = () => ({ organizationId: ORG, channelAccountId });

  const put = (permit: CoupangCatalogCollectionPermit, payload: PutCoupangCatalogChunkRequest['payload'], sequence: number) =>
    owner.putChunk({
      ...scope(),
      userId: USER,
      runId: permit.attemptId,
      attemptToken: permit.attemptToken,
      kind: payload.kind,
      sequence,
      request: {
        kind: payload.kind,
        sequence,
        checksum: hashCatalogChunkPayload(payload, channelIntegrity.sha256),
        itemCount: 'items' in payload ? payload.items.length : 'products' in payload ? payload.products.length : 1,
        payload,
      } as PutCoupangCatalogChunkRequest,
    });

  const finalize = async (permit: CoupangCatalogCollectionPermit): Promise<CoupangCatalogCollectionRun> => {
    const status = await owner.getStatus({ ...scope(), runId: permit.attemptId });
    expect(status).toMatchObject({ phase: 'ready_to_finalize', missing: { productIds: [] } });
    return owner.finalize({
      ...scope(),
      userId: USER,
      runId: permit.attemptId,
      attemptToken: permit.attemptToken,
      request: { snapshotHash: status.snapshotHash! },
    });
  };

  const manifestOf = (count: number) => ({
    totalItems: count,
    pageSize: 500,
    expectedPages: 1,
    firstPageFingerprint: 'c'.repeat(64),
  });

  const discover = (permit: CoupangCatalogCollectionPermit, products: readonly SyncProduct[]) =>
    put(permit, {
      version: 1,
      kind: 'discovery_page',
      page: 1,
      manifest: manifestOf(products.length),
      items: products.map((product, ordinal) => ({
        ordinal,
        externalProductId: product.id,
        registeredName: product.id,
        primaryImageUrl: null,
        saleStatus: 'ONSALE',
      })),
    }, 1);

  async function runBasics(products: readonly SyncProduct[]) {
    const permit = await owner.start({
      ...scope(),
      userId: USER,
      idempotencyKey: randomUUID(),
      request: { collectorVersion: 'wing-inventory-v1', stage: 'basics' },
    });
    await discover(permit, products);
    for (let start = 0; start < products.length; start += 20) {
      const slice = products.slice(start, start + 20);
      await put(permit, {
        version: 1,
        kind: 'listing_basics',
        startOrdinal: start,
        products: slice.map((product, index) => ({ ordinal: start + index, product: wireBasicProduct(product) })),
      }, start + 1);
    }
    await put(permit, { version: 1, kind: 'manifest_confirmation', manifest: manifestOf(products.length) }, 1);
    await finalize(permit);
    return permit;
  }

  async function startDetails(basics: CoupangCatalogCollectionPermit, listed: readonly SyncProduct[]) {
    const permit = await owner.start({
      ...scope(),
      userId: USER,
      idempotencyKey: basics.plan.detailsIdempotencyKey!,
      request: { collectorVersion: 'wing-inventory-v1', stage: 'details', expectedBasicAttemptId: basics.attemptId },
    });
    await discover(permit, listed);
    await put(permit, {
      version: 1,
      kind: 'detail_manifest_confirmation',
      manifest: manifestOf(listed.length),
      basicAttemptId: permit.plan.basicAttemptId!,
      basicManifestHash: permit.plan.basicManifestHash!,
    }, 1);
    return permit;
  }

  const sendDetail = (permit: CoupangCatalogCollectionPermit, listed: readonly SyncProduct[], id: string, notice = '장난감') => {
    const ordinal = listed.findIndex((product) => product.id === id);
    return put(permit, {
      version: 1,
      kind: 'full_details',
      startOrdinal: ordinal,
      products: [{ ordinal, product: wireDetailProduct(id, notice) }],
    }, ordinal + 1);
  };

  const detailSection = async (id: string) => {
    const row = await prisma.channelListing.findFirstOrThrow({
      where: { organizationId: ORG, channelAccountId, externalId: id },
      select: { rawJson: true },
    });
    return (row.rawJson as { detail?: unknown }).detail ?? null;
  };

  async function syncAll(products: readonly SyncProduct[]) {
    const basics = await runBasics(products);
    const details = await startDetails(basics, products);
    for (const id of details.plan.detailTargetProductIds ?? []) await sendDetail(details, products, id);
    await finalize(details);
    return { basics, details };
  }

  it('목록 단계 종료가 신규·modifiedOn 변경·상세 없는 상품만 상세 대상으로 계획하고, 그 부분집합만 보내도 상세 단계가 끝난다', async () => {
    const first: SyncProduct[] = [
      { id: 'P1', modifiedOn: '2026-09-01T00:00:00' },
      { id: 'P2', modifiedOn: '2026-09-01T00:00:00' },
      { id: 'P3', modifiedOn: '2026-09-01T00:00:00' },
    ];
    const initial = await syncAll(first);
    expect(initial.details.plan.detailTargetProductIds).toEqual(['P1', 'P2', 'P3']);
    const p2Detail = await detailSection('P2');
    expect(p2Detail).toMatchObject({ documents: [{ id: 'P2-D1' }] });

    const second: SyncProduct[] = [
      { id: 'P1', modifiedOn: '2026-09-20T00:00:00' },
      { id: 'P2', modifiedOn: '2026-09-01T00:00:00' },
      { id: 'P3', modifiedOn: '2026-09-01T00:00:00' },
      { id: 'P4', modifiedOn: '2026-09-20T00:00:00' },
    ];
    const basics = await runBasics(second);
    const details = await startDetails(basics, second);
    expect(details.plan).toMatchObject({ detailTargetProductIds: ['P1', 'P4'], absentProductIds: [] });
    const waiting = await owner.getStatus({ ...scope(), runId: details.attemptId });
    expect(waiting).toMatchObject({ phase: 'hydration', missing: { productIds: ['P1', 'P4'] } });

    await sendDetail(details, second, 'P1', '바뀐 장난감');
    await sendDetail(details, second, 'P4');
    await expect(finalize(details)).resolves.toMatchObject({ state: 'COMPLETE' });

    // 대상 밖 상품의 상세 구역은 그대로다.
    await expect(detailSection('P2')).resolves.toEqual(p2Detail);
    await expect(detailSection('P1')).resolves.toMatchObject({
      documents: [{ id: 'P1-D2', value: { 품명: '바뀐 장난감' } }],
    });
  });

  const listingState = (id: string) => prisma.channelListing.findFirstOrThrow({
    where: { organizationId: ORG, channelAccountId, externalId: id },
    select: { status: true, isActive: true, options: { select: { isActive: true } } },
  });

  const listingAndOptionStamps = async (id: string) => {
    const row = await prisma.channelListing.findFirstOrThrow({
      where: { organizationId: ORG, channelAccountId, externalId: id },
      select: { updatedAt: true, rawJson: true, options: { select: { updatedAt: true, rawJson: true, attributesJson: true } } },
    });
    return row;
  };

  it('상세 청크는 스테이징에만 쌓이고 종료 트랜잭션이 한 번에 반영하며 run.quality를 남긴다', async () => {
    const products: SyncProduct[] = [
      { id: 'P1', modifiedOn: '2026-09-01T00:00:00' },
      { id: 'P2', modifiedOn: '2026-09-01T00:00:00' },
    ];
    const basics = await runBasics(products);
    const details = await startDetails(basics, products);
    await sendDetail(details, products, 'P1');
    const staged = await sendDetail(details, products, 'P2');
    expect(staged).toMatchObject({ phase: 'ready_to_finalize', progress: { hydratedProducts: 2 } });
    // 청크를 받는 동안 리스팅은 그대로다.
    await expect(detailSection('P1')).resolves.toBeNull();
    await expect(detailSection('P2')).resolves.toBeNull();

    const completed = await finalize(details);
    expect(completed.quality).toEqual({
      detailTargets: 2,
      detailApplied: 2,
      detailUnchanged: 0,
      deletedProducts: 0,
      unconfirmedAbsentProductIds: [],
    });
    await expect(detailSection('P1')).resolves.toMatchObject({ documents: [{ id: 'P1-D1' }] });
  });

  it('종료 전에 실패하면 리스팅에 아무것도 반영되지 않고, 다음 동기화가 같은 대상을 다시 잡는다', async () => {
    const first: SyncProduct[] = [
      { id: 'P1', modifiedOn: '2026-09-01T00:00:00' },
      { id: 'P2', modifiedOn: '2026-09-01T00:00:00' },
    ];
    await syncAll(first);
    const before = await listingAndOptionStamps('P1');

    const changed: SyncProduct[] = [
      { id: 'P1', modifiedOn: '2026-09-20T00:00:00' },
      { id: 'P2', modifiedOn: '2026-09-01T00:00:00' },
    ];
    const basics = await runBasics(changed);
    const details = await startDetails(basics, changed);
    expect(details.plan.detailTargetProductIds).toEqual(['P1']);
    await sendDetail(details, changed, 'P1', '바뀐 장난감');
    await owner.fail({
      ...scope(),
      runId: details.attemptId,
      attemptToken: details.attemptToken,
      request: { code: 'PROVIDER_ERROR', message: '상세 조회 실패', phase: 'hydration' },
    });
    const after = await listingAndOptionStamps('P1');
    expect((after.rawJson as { detail: unknown }).detail).toEqual((before.rawJson as { detail: unknown }).detail);
    expect(after.options.map((option) => option.rawJson)).toEqual(
      expect.arrayContaining([expect.objectContaining({
        detail: (before.options[0]!.rawJson as { detail: unknown }).detail,
      })]),
    );

    const retry = await runBasics(changed);
    const retryDetails = await startDetails(retry, changed);
    expect(retryDetails.plan.detailTargetProductIds).toEqual(['P1']);
  });

  it('같은 상세를 다시 받으면 리스팅·옵션에 한 건도 쓰지 않는다', async () => {
    const first: SyncProduct[] = [{ id: 'P1', modifiedOn: '2026-09-01T00:00:00' }];
    await syncAll(first);
    // 가격만 바뀌어 modifiedOn이 올라갔고 상세 내용은 같다.
    const bumped: SyncProduct[] = [{ id: 'P1', modifiedOn: '2026-09-20T00:00:00' }];
    const basics = await runBasics(bumped);
    const afterBasics = await listingAndOptionStamps('P1');
    const details = await startDetails(basics, bumped);
    expect(details.plan.detailTargetProductIds).toEqual(['P1']);
    await sendDetail(details, bumped, 'P1');
    const completed = await finalize(details);

    expect(completed.quality).toMatchObject({ detailTargets: 1, detailApplied: 0, detailUnchanged: 1 });
    await expect(listingAndOptionStamps('P1')).resolves.toEqual(afterBasics);

    // 반영하지 않았어도 대상은 끝났다: 다음 동기화의 대상이 아니다.
    const next = await runBasics(bumped);
    const nextDetails = await startDetails(next, bumped);
    expect(nextDetails.plan.detailTargetProductIds).toEqual([]);
  });

  const confirmDeletion = (
    permit: CoupangCatalogCollectionPermit,
    products: Array<{ externalProductId: string; outcome: 'deleted' | 'present' | 'not_found' }>,
    sequence = 1,
  ) => put(permit, { version: 1, kind: 'deletion_confirmation', products: products.map((item) => ({ ...item, productStatus: null })) }, sequence);

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
    const basics = await runBasics(listed);
    const details = await startDetails(basics, listed);
    expect(details.plan.absentProductIds).toEqual(['P-NULL']);
    await confirmDeletion(details, [{ externalProductId: 'P-NULL', outcome: 'deleted' }]);
    const completed = await finalize(details);
    expect(completed.quality).toMatchObject({ deletedProducts: 1, unconfirmedAbsentProductIds: [] });
    await expect(listingState('P-NULL')).resolves.toEqual({ status: 'DELETED', isActive: false, options: [{ isActive: false }] });
    const next = await runBasics(listed);
    const nextDetails = await startDetails(next, listed);
    expect(nextDetails.plan.absentProductIds).toEqual([]);
  });

  it('삭제로 확인된 상품만 DELETED로 끄고, 돌아온 상품과 확인 못 한 상품은 그대로 두며 미확인을 품질 보고에 남긴다', async () => {
    const all: SyncProduct[] = ['P1', 'P2', 'P3', 'P4'].map((id) => ({ id, modifiedOn: '2026-09-01T00:00:00' }));
    await syncAll(all);
    const listed: SyncProduct[] = [{ id: 'P1', modifiedOn: '2026-09-01T00:00:00' }];
    const basics = await runBasics(listed);
    const details = await startDetails(basics, listed);
    expect(details.plan).toMatchObject({ detailTargetProductIds: [], absentProductIds: ['P2', 'P3', 'P4'] });

    await expect(confirmDeletion(details, [{ externalProductId: 'P1', outcome: 'deleted' }])).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { reason: 'CATALOG_DELETION_UNEXPECTED_PRODUCT', externalProductId: 'P1' },
    });
    await confirmDeletion(details, [
      { externalProductId: 'P2', outcome: 'deleted' },
      { externalProductId: 'P3', outcome: 'present' },
    ], 1);
    await confirmDeletion(details, [{ externalProductId: 'P4', outcome: 'not_found' }], 2);
    // 확인을 받는 동안에는 아무것도 바뀌지 않는다.
    await expect(listingState('P2')).resolves.toMatchObject({ isActive: true });

    const completed = await finalize(details);
    expect(completed.quality).toEqual({
      detailTargets: 0,
      detailApplied: 0,
      detailUnchanged: 0,
      deletedProducts: 1,
      unconfirmedAbsentProductIds: ['P4'],
    });
    await expect(listingState('P2')).resolves.toEqual({ status: 'DELETED', isActive: false, options: [{ isActive: false }] });
    await expect(listingState('P3')).resolves.toEqual({ status: 'APPROVED', isActive: true, options: [{ isActive: true }] });
    await expect(listingState('P4')).resolves.toEqual({ status: 'APPROVED', isActive: true, options: [{ isActive: true }] });

    // 삭제로 기록한 상품은 다시 확인하지 않는다.
    const next = await runBasics(listed);
    const nextDetails = await startDetails(next, listed);
    expect(nextDetails.plan.absentProductIds).toEqual(['P3', 'P4']);
  });

  it('상품 하나 상세 다시 받기는 목록 단계 없이 그 상품만 대상으로 열고 같은 종료 경로로 반영한다', async () => {
    const products: SyncProduct[] = [
      { id: 'P1', modifiedOn: '2026-09-01T00:00:00' },
      { id: 'P2', modifiedOn: '2026-09-01T00:00:00' },
    ];
    await syncAll(products);
    const p1Before = await detailSection('P1');

    await expect(owner.start({
      ...scope(),
      userId: USER,
      idempotencyKey: randomUUID(),
      request: { collectorVersion: 'wing-inventory-v1', stage: 'details', detailProductIds: ['P-UNKNOWN'] },
    })).rejects.toMatchObject({ code: 'CHANNELS_LISTING_NOT_FOUND' });

    const refetch = await owner.start({
      ...scope(),
      userId: USER,
      idempotencyKey: randomUUID(),
      request: { collectorVersion: 'wing-inventory-v1', stage: 'details', detailProductIds: ['P2'] },
    });
    expect(refetch.plan).toMatchObject({
      stage: 'details',
      detailTargetProductIds: ['P2'],
      absentProductIds: [],
      rootAttemptId: refetch.attemptId,
    });
    expect(refetch.plan.basicAttemptId).toBeUndefined();
    // 계정당 가져오기 하나: 다시 받기가 도는 동안 새 동기화는 기다린다.
    await expect(owner.start({
      ...scope(),
      userId: USER,
      idempotencyKey: randomUUID(),
      request: { collectorVersion: 'wing-inventory-v1', stage: 'basics' },
    })).rejects.toMatchObject({ response: { code: 'ATTEMPT_IN_PROGRESS', attemptId: refetch.attemptId } });

    await put(refetch, {
      version: 1,
      kind: 'full_details',
      startOrdinal: 0,
      products: [{ ordinal: 0, product: wireDetailProduct('P2', '다시 받은 장난감') }],
    }, 1);
    const completed = await finalize(refetch);
    expect(completed.quality).toMatchObject({ detailTargets: 1, detailApplied: 1, detailUnchanged: 0, deletedProducts: 0 });
    await expect(detailSection('P2')).resolves.toMatchObject({
      documents: [{ id: 'P2-D2', value: { 품명: '다시 받은 장난감' } }],
    });
    await expect(detailSection('P1')).resolves.toEqual(p1Before);
  });

  it('상세 대상 320개를 한 번의 종료 트랜잭션으로 반영한다(시간 측정)', async () => {
    const products: SyncProduct[] = Array.from({ length: 320 }, (_, index) => ({
      id: `P${String(index).padStart(4, '0')}`,
      modifiedOn: '2026-09-01T00:00:00',
    }));
    const basics = await runBasics(products);
    const details = await startDetails(basics, products);
    expect(details.plan.detailTargetProductIds).toHaveLength(320);
    for (let start = 0; start < products.length; start += 20) {
      await put(details, {
        version: 1,
        kind: 'full_details',
        startOrdinal: start,
        products: products.slice(start, start + 20).map((product, index) => ({
          ordinal: start + index,
          product: wireDetailProduct(product.id, '장난감'),
        })),
      }, start + 1);
    }
    const status = await owner.getStatus({ ...scope(), runId: details.attemptId });
    expect(status).toMatchObject({ phase: 'ready_to_finalize', missing: { productIds: [] } });
    const started = performance.now();
    const completed = await owner.finalize({
      ...scope(),
      userId: USER,
      runId: details.attemptId,
      attemptToken: details.attemptToken,
      request: { snapshotHash: status.snapshotHash! },
    });
    const elapsedMs = Math.round(performance.now() - started);
    process.stdout.write(`WING_DETAILS_FINALIZE_MEASUREMENT ${JSON.stringify({ targets: 320, elapsedMs })}\n`);
    expect(completed.quality).toMatchObject({ detailTargets: 320, detailApplied: 320, detailUnchanged: 0 });
    await expect(prisma.channelListing.count({
      where: { organizationId: ORG, channelAccountId, rawJson: { path: ['detail', 'documents', '0', 'id'], string_starts_with: 'P' } },
    })).resolves.toBe(320);
  }, 120_000);

  it('상세 → 엑셀 뒤에 같은 상세를 다시 받아도 속성 순서 때문에 바뀐 것으로 세지 않는다', async () => {
    const products: SyncProduct[] = [{ id: 'P1', modifiedOn: '2026-09-01T00:00:00' }];
    await syncAll(products);
    const claim = await workbook.claimCoupangWingImport({
      organizationId: ORG, userId: USER, channelAccountId, fileName: 'wing.xlsx', fileHash: 'e'.repeat(64), rowCount: 1,
    });
    if (claim.kind !== 'started') throw new Error('workbook import was not admitted');
    await workbook.upsertCoupangWingCatalog({
      organizationId: ORG, channelAccountId, runId: claim.runId, attemptToken: claim.attemptToken,
      rows: [excelRow('P1', { attributesJson: [{ kind: 'search', type: '가재질', value: '면' }] })],
      skippedRows: [], observedAt: '2026-09-24T09:00:00.000Z',
    });
    const bumped: SyncProduct[] = [{ id: 'P1', modifiedOn: '2026-09-20T00:00:00' }];
    const basics = await runBasics(bumped);
    const details = await startDetails(basics, bumped);
    await sendDetail(details, bumped, 'P1');
    const completed = await finalize(details);
    expect(completed.quality).toMatchObject({ detailApplied: 0, detailUnchanged: 1 });
  });

  it('목록에서 사라진 상품을 삭제 확인 대상으로 계획하고, 목록 단계 종료는 그 상품을 끄지 않는다', async () => {
    await syncAll([
      { id: 'P1', modifiedOn: '2026-09-01T00:00:00' },
      { id: 'P2', modifiedOn: '2026-09-01T00:00:00' },
    ]);
    const basics = await runBasics([{ id: 'P1', modifiedOn: '2026-09-01T00:00:00' }]);
    const details = await startDetails(basics, [{ id: 'P1', modifiedOn: '2026-09-01T00:00:00' }]);
    expect(details.plan).toMatchObject({ detailTargetProductIds: [], absentProductIds: ['P2'] });
    await expect(prisma.channelListing.findFirstOrThrow({
      where: { organizationId: ORG, channelAccountId, externalId: 'P2' },
      select: { isActive: true },
    })).resolves.toEqual({ isActive: true });
  });
});

function wireBasicProduct(product: SyncProduct) {
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
    media: [],
    raw: {},
  };
}

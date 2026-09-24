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

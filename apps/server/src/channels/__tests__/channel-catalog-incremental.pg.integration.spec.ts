import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
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

  const listingRow = (externalId = 'P1') => prisma.channelListing.findFirstOrThrow({
    where: { organizationId: ORG, channelAccountId, externalId },
    select: { id: true, rawJson: true, options: { select: { rawJson: true, attributesJson: true, barcode: true } } },
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

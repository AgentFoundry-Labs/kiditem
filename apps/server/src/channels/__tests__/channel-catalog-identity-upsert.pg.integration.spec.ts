import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import {
  upsertChannelCatalogBasics,
  upsertChannelCatalogIdentities,
  type ChannelCatalogIdentityProduct,
} from '../adapter/out/repository/channel-catalog-identity-upsert';

const REGISTERED_ON = '2026-04-01 11:32:06';

describe('channel catalog identity upsert (PG integration)', () => {
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
      data: { organizationId: TEST_ORGANIZATION_ID, channel: 'coupang', name: 'Wing' },
    })).id;
  });

  it('keeps the stored Wing registration date when the replacing listing raw JSON lacks one', async () => {
    await prisma.channelListing.createMany({
      data: [
        { externalId: 'P-KEPT', rawJson: { source: 'coupang_catalog_basics', createdOn: REGISTERED_ON } },
        { externalId: 'P-REPLACED', rawJson: { source: 'coupang_catalog_basics', createdOn: REGISTERED_ON } },
        { externalId: 'P-UNREGISTERED', rawJson: { source: 'coupang_catalog_basics' } },
      ].map((listing) => ({ organizationId: TEST_ORGANIZATION_ID, channelAccountId, ...listing })),
    });

    await prisma.$transaction((tx) => upsertChannelCatalogIdentities(tx, {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId,
      lastImportRunId: null,
      rawSource: 'coupang_rocket_po_catalog',
      unobservedOptionFields: [],
      products: [
        product('P-KEPT', { poNumber: '1001' }),
        product('P-REPLACED', { poNumber: '1002', createdOn: '2026-05-02 09:00:00' }),
        product('P-UNREGISTERED', { poNumber: '1003' }),
      ],
    }));

    await expect(prisma.channelListing.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID, channelAccountId },
      select: { externalId: true, rawJson: true },
      orderBy: { externalId: 'asc' },
    })).resolves.toEqual([
      { externalId: 'P-KEPT', rawJson: { poNumber: '1001', createdOn: REGISTERED_ON } },
      { externalId: 'P-REPLACED', rawJson: { poNumber: '1002', createdOn: '2026-05-02 09:00:00' } },
      { externalId: 'P-UNREGISTERED', rawJson: { poNumber: '1003' } },
    ]);
  });

  it('keeps an option value the publishing source did not observe and clears one it observed empty', async () => {
    const seeded = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId,
        externalId: 'P-1',
        rawJson: { source: 'coupang_catalog_basics' },
      },
      select: { id: true },
    });
    await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: seeded.id,
        externalOptionId: 'P-1-O',
        sellerSku: 'KID00000001',
        salePrice: 19_900,
        rawJson: { source: 'coupang_catalog_basics' },
      },
    });

    await prisma.$transaction((tx) => upsertChannelCatalogIdentities(tx, {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId,
      lastImportRunId: null,
      rawSource: 'coupang_wing_catalog_workbook',
      // 윙 엑셀은 판매자코드도 판매가도 싣지 않는다 — 이 원천이 읽지 않는 칸이다.
      unobservedOptionFields: ['sellerSku', 'salePrice'],
      products: [product('P-1', {})],
    }));

    await expect(prisma.channelListingOption.findFirst({
      where: { listingId: seeded.id },
      select: { sellerSku: true, salePrice: true },
    })).resolves.toEqual({ sellerSku: 'KID00000001', salePrice: 19_900 });

    await prisma.$transaction((tx) => upsertChannelCatalogIdentities(tx, {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId,
      lastImportRunId: null,
      rawSource: 'mall_admin_listings',
      // 선언하지 않은 칸의 null 은 "몰에서 비어 있는 것을 보았다"는 뜻이라 덮는다.
      unobservedOptionFields: [],
      products: [product('P-1', {})],
    }));

    await expect(prisma.channelListingOption.findFirst({
      where: { listingId: seeded.id },
      select: { sellerSku: true, salePrice: true },
    })).resolves.toEqual({ sellerSku: null, salePrice: null });
  });

  it('keeps a model number a mall list has no column for, and clears one the source read as empty', async () => {
    const seeded = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId,
        externalId: 'P-2',
        rawJson: { source: 'coupang_catalog_basics' },
      },
      select: { id: true },
    });
    await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: seeded.id,
        externalOptionId: 'P-2-O',
        modelNumber: 'MODEL-77',
        barcode: '8801234567890',
        rawJson: { source: 'coupang_catalog_basics' },
      },
    });

    // 사방넷 송신 기록에는 모델번호 칸이 없다. 바코드는 자기 상품코드에서 읽는다.
    await prisma.$transaction((tx) => upsertChannelCatalogIdentities(tx, {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId,
      lastImportRunId: null,
      rawSource: 'sabangnet_mall_listings',
      unobservedOptionFields: ['modelNumber'],
      products: [product('P-2', {})],
    }));

    await expect(prisma.channelListingOption.findFirst({
      where: { listingId: seeded.id },
      select: { modelNumber: true, barcode: true },
    })).resolves.toEqual({ modelNumber: 'MODEL-77', barcode: null });
  });

  it('records the Coupang catalog primary image as the mall-reported listing image on every import, and keeps it when an import carries none', async () => {
    const primary = (sourceUrl: string, sortOrder: number) => ({ sourceUrl, role: 'primary' as const, sortOrder, externalOptionId: null });
    const detail = { sourceUrl: 'https://img/detail.jpg', role: 'detail' as const, sortOrder: 0, externalOptionId: null };
    const importOnce = (products: ChannelCatalogIdentityProduct[]) => prisma.$transaction((tx) => upsertChannelCatalogIdentities(tx, {
      organizationId: TEST_ORGANIZATION_ID, channelAccountId, lastImportRunId: null,
      rawSource: 'coupang_catalog_browser', unobservedOptionFields: [], products,
    }));
    const basics = (products: ChannelCatalogIdentityProduct[]) => prisma.$transaction((tx) => upsertChannelCatalogBasics(tx, {
      organizationId: TEST_ORGANIZATION_ID, channelAccountId, lastImportRunId: null, rawSource: 'coupang_catalog_basics', products,
    }));
    const images = () => prisma.channelListing.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID, channelAccountId }, orderBy: { externalId: 'asc' }, select: { externalId: true, imageUrl: true },
    });

    await importOnce([
      { ...product('P-A', {}), media: [detail, primary('https://img/a-2.jpg', 2), primary('https://img/a-1.jpg', 1)] },
      product('P-B', {}),
    ]);
    expect(await images()).toEqual([{ externalId: 'P-A', imageUrl: 'https://img/a-1.jpg' }, { externalId: 'P-B', imageUrl: null }]);

    await basics([
      { ...product('P-A', {}), media: [primary('https://img/a-new.jpg', 0)] },
      { ...product('P-B', {}), media: [primary('https://img/b.jpg', 0)] },
    ]);
    expect(await images()).toEqual([{ externalId: 'P-A', imageUrl: 'https://img/a-new.jpg' }, { externalId: 'P-B', imageUrl: 'https://img/b.jpg' }]);

    await importOnce([product('P-A', {}), { ...product('P-B', {}), media: [detail] }]);
    expect(await images()).toEqual([{ externalId: 'P-A', imageUrl: 'https://img/a-new.jpg' }, { externalId: 'P-B', imageUrl: 'https://img/b.jpg' }]);
  });
});

function product(
  externalProductId: string,
  raw: Record<string, unknown>,
): ChannelCatalogIdentityProduct {
  return {
    externalProductId,
    registeredName: externalProductId,
    displayName: null,
    category: null,
    manufacturer: null,
    brand: null,
    productStatus: 'observed',
    raw,
    options: [{
      externalOptionId: `${externalProductId}-O`,
      optionName: externalProductId,
      salePrice: null,
      sellerSku: null,
      barcode: null,
      modelNumber: null,
      skuStatus: 'observed',
      attributes: {},
      raw: {},
    }],
  };
}

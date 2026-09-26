import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SABANGNET_LOGIN_LOCK_KEY,
  SABANGNET_MALL_LISTINGS_CHUNK_KIND,
  SABANGNET_MALL_LISTINGS_KIND,
  SABANGNET_MALL_LISTINGS_SCAN_CHUNK_KIND,
} from '@kiditem/shared/channels-operations';
import type {
  SabangnetMallListingRow,
  SabangnetMallListingsScan,
} from '@kiditem/shared/sabangnet-mall-listings';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID as OTHER_ORG,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../test-helpers/real-prisma';
import { makeChannelsOperations } from '../../test-helpers/channels-operations';

const KIDSNOTE = '11111111-1111-4111-8111-111111111111';
const KIDSNOTE_LATER = '11111111-1111-4111-8111-111111111112';
const ELEVENST = '22222222-2222-4222-8222-222222222222';
const COUPANG = '33333333-3333-4333-8333-333333333333';

function row(overrides: Partial<SabangnetMallListingRow> = {}): SabangnetMallListingRow {
  return {
    sendSerial: '5010000001',
    sabangnetShopId: 'shop0472',
    mallProductCode: 'KN-1',
    sabangnetProductNo: '103177',
    modelName: '10162-1',
    ownProductCode: '8806381806625',
    productName: '할로윈 아트 네일팁',
    salePrice: 1950,
    supplyStatus: '공급중',
    firstSentAt: '20260914 13:47',
    ...overrides,
  };
}

function scan(
  dateTo: string,
  rows: SabangnetMallListingRow[],
  overrides: Partial<SabangnetMallListingsScan['collection']> = {},
  skippedByShop: Record<string, number> = {},
): SabangnetMallListingsScan {
  const skipped = Object.values(skippedByShop).reduce((sum, count) => sum + count, 0);
  const total = rows.length + skipped;
  return {
    collection: {
      totalRecords: total,
      recordsRead: total,
      pagesRead: 1,
      totalPages: 1,
      truncated: false,
      skippedByShop,
      missingMallCode: 0,
      ...overrides,
    },
    proof: { dateFrom: '20000101', dateTo, pageSize: 500, validatedList: true },
  };
}

/**
 * 사방넷 송신 기록 = `channels.sabangnet_mall_listings` 실행 하나(KID-363 L1). plan은 몰 계정 행을 얼리고 잠금
 * `resource:sabangnet:login` 하나를 잡는다. 확장은 행을 `listing_rows`, 끝까지 읽은 증거를 `listing_scan`으로 보내고,
 * finish 트랜잭션만 몰 계정마다 리스팅을 쓰고 이 원천이 만든 행 중 사라진 것을 끈다.
 */
describe('Sabangnet mall listings over the operation contract (PG integration)', () => {
  let prisma: PrismaClient;
  let channels: ReturnType<typeof makeChannelsOperations>;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    channels = makeChannelsOperations(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.createMany({
      data: [
        { id: KIDSNOTE, organizationId: ORG, channel: 'kidsnote', externalAccountId: 'kidsnote', name: '키즈노트', status: 'configured', createdAt: new Date('2026-01-01T00:00:00Z') },
        { id: ELEVENST, organizationId: ORG, channel: '11st', externalAccountId: '11st', name: '11번가', status: 'paused' },
        { id: COUPANG, organizationId: ORG, channel: 'coupang', name: 'Coupang Wing', status: 'active', vendorId: 'V1' },
      ],
    });
  });

  async function begin() {
    return channels.operations.begin(ORG, { kind: SABANGNET_MALL_LISTINGS_KIND, scope: {} }, { userId: null });
  }

  async function complete(rows: SabangnetMallListingRow[], skippedByShop: Record<string, number> = {}, overrides = {}) {
    return channels.runBegun(await begin(), (plan) => [
      { chunkKind: SABANGNET_MALL_LISTINGS_CHUNK_KIND, items: rows },
      { chunkKind: SABANGNET_MALL_LISTINGS_SCAN_CHUNK_KIND, items: [scan(String(plan.dateTo), rows, overrides, skippedByShop)] },
    ]);
  }

  it('freezes the mall account rows it will write under the Sabangnet login lock, and refuses a second run', async () => {
    const begun = await begin();
    expect(begun.operation).toMatchObject({
      status: 'executing',
      lockKeys: [SABANGNET_LOGIN_LOCK_KEY],
      plan: {
        sourceType: 'sabangnet_mall_listings',
        sourceOrigin: 'https://sbadmin08.sabangnet.co.kr',
        pageSize: 500,
        dateFrom: '20000101',
        // 쿠팡 행은 받지 않고, 계정 행이 없는 몰도 계획에 없다. 상태(configured · paused)는 가리지 않는다.
        malls: [
          { mallKey: 'kidsnote', channelAccountId: KIDSNOTE, sabangnetShopIds: ['shop0472'] },
          { mallKey: '11st', channelAccountId: ELEVENST, sabangnetShopIds: ['shop0464', 'shop0003'] },
        ],
      },
    });
    await expect(begin()).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });

    const source = await channels.sabangnet.readSource(ORG);
    expect(source).toMatchObject({
      ready: true,
      latestOperation: { id: begun.operation.id, status: 'executing' },
      latestSucceeded: null,
      latestPublication: [],
    });
    expect(source.malls).toContainEqual({ mallKey: 'ssg', channelAccountId: null, sabangnetShopIds: ['shop0100'] });
  });

  it('refuses to begin when no mall has an account row', async () => {
    const other = makeChannelsOperations(prisma, { organizationId: OTHER_ORG });
    await expect(other.operations.begin(OTHER_ORG, { kind: SABANGNET_MALL_LISTINGS_KIND, scope: {} }, { userId: null }))
      .rejects.toMatchObject({ code: 'CHANNELS_ACCOUNT_NOT_FOUND' });
    expect(await prisma.operation.count()).toBe(0);
    expect((await other.sabangnet.readSource(OTHER_ORG)).ready).toBe(false);
  });

  it('publishes one listing per mall product code under the mall row, with the Sabangnet model as seller SKU', async () => {
    const operation = await complete(
      [
        row(),
        row({ sendSerial: '5010000002', sabangnetShopId: 'shop0464', mallProductCode: '8123', supplyStatus: '일시중지', firstSentAt: '20260101 09:00' }),
        // 11번가(구)에 같은 몰 상품코드로 먼저 보낸 기록 — 최근 기록이 남는다.
        row({ sendSerial: '5010000003', sabangnetShopId: 'shop0003', mallProductCode: '8123', supplyStatus: '공급중', firstSentAt: '20210306 10:00' }),
        row({ sendSerial: '5010000004', sabangnetShopId: 'shop0464', mallProductCode: '8124', ownProductCode: '8806384825817XE2001', modelName: null }),
      ],
      { shop0075: 2 },
    );
    expect(operation).toMatchObject({ status: 'succeeded', result: { rows: 4 } });
    expect(operation.result?.malls).toEqual(expect.arrayContaining([
      { mallKey: 'kidsnote', channelAccountId: KIDSNOTE, listings: 1, deactivated: 0 },
      { mallKey: '11st', channelAccountId: ELEVENST, listings: 2, deactivated: 0 },
    ]));

    const listings = await prisma.channelListing.findMany({
      where: { organizationId: ORG },
      orderBy: { externalId: 'asc' },
      select: {
        channelAccountId: true,
        externalId: true,
        status: true,
        rawJson: true,
        lastOperationId: true,
        lastImportRunId: true,
        options: { select: { externalOptionId: true, sellerSku: true, barcode: true, salePrice: true, status: true, rawJson: true, lastOperationId: true } },
      },
    });
    expect(listings.map((listing) => [listing.channelAccountId, listing.externalId, listing.status, listing.lastOperationId, listing.lastImportRunId]))
      .toEqual([
        [ELEVENST, '8123', '사방넷 일시중지', operation.id, null],
        [ELEVENST, '8124', '사방넷 공급중', operation.id, null],
        [KIDSNOTE, 'KN-1', '사방넷 공급중', operation.id, null],
      ]);
    expect(listings[2]!.options).toEqual([
      expect.objectContaining({
        externalOptionId: 'KN-1',
        sellerSku: '10162-1',
        barcode: '8806381806625',
        salePrice: 1950,
        status: '사방넷 공급중',
        lastOperationId: operation.id,
        rawJson: expect.objectContaining({ source: 'sabangnet_mall_listings', sendSerial: '5010000001' }),
      }),
    ]);
    expect(listings[2]!.rawJson).toMatchObject({ source: 'sabangnet_mall_listings' });
    // 바코드 뒤에 글자가 붙은 자체코드는 바코드로 쓰지 않는다.
    expect(listings[1]!.options[0]).toMatchObject({ sellerSku: null, barcode: null });

    const source = await channels.sabangnet.readSource(ORG);
    expect(source.latestSucceeded).toMatchObject({ id: operation.id, status: 'succeeded' });
    expect(source.latestPublication).toEqual(operation.result?.malls);
    expect(await prisma.sourceImportRun.count()).toBe(0);
    expect(await prisma.operationChunk.count()).toBe(0);
  });

  it('turns off only its own listings that left the list, and keeps other listings on the same row', async () => {
    await complete([row(), row({ sendSerial: '5010000002', mallProductCode: 'KN-2' })]);
    const foreign = await prisma.channelListing.create({
      data: { organizationId: ORG, channelAccountId: KIDSNOTE, externalId: 'KIDITEM-REGISTERED', status: 'active', rawJson: { source: 'kiditem_registration' } },
    });

    const second = await complete([row()]);
    expect(second.status).toBe('succeeded');
    const byId = new Map(
      (await prisma.channelListing.findMany({
        where: { organizationId: ORG, channelAccountId: KIDSNOTE },
        select: { externalId: true, isActive: true, lastOperationId: true, options: { select: { isActive: true, lastOperationId: true } } },
      })).map((listing) => [listing.externalId, listing]),
    );
    expect(byId.get('KN-1')).toMatchObject({ isActive: true, options: [{ isActive: true }] });
    expect(byId.get('KN-2')).toMatchObject({
      isActive: false,
      lastOperationId: second.id,
      options: [{ isActive: false, lastOperationId: second.id }],
    });
    expect(byId.get(foreign.externalId)).toMatchObject({ isActive: true });
    expect(second.result?.malls).toEqual(expect.arrayContaining([
      { mallKey: 'kidsnote', channelAccountId: KIDSNOTE, listings: 1, deactivated: 1 },
    ]));
  });

  it('refuses a list that was not read to the end or carries an unplanned shop, and publishes nothing', async () => {
    const begun = await begin();
    await expect(channels.runBegun(begun, (plan) => [
      { chunkKind: SABANGNET_MALL_LISTINGS_CHUNK_KIND, items: [row()] },
      { chunkKind: SABANGNET_MALL_LISTINGS_SCAN_CHUNK_KIND, items: [scan(String(plan.dateTo), [row()], { totalRecords: 2, recordsRead: 1 })] },
    ])).rejects.toMatchObject({ code: 'SOURCE_SNAPSHOT_INVALID', details: { reason: 'incomplete_records' } });
    expect(await prisma.channelListing.count({ where: { organizationId: ORG } })).toBe(0);
    // runner가 finish(failed)로 닫으면 잠금이 풀리고 다음 가져오기가 시작된다.
    await channels.fail(begun);
    expect(await prisma.operationLock.count()).toBe(0);

    const unplanned = row({ sabangnetShopId: 'shop0100' });
    await expect(complete([unplanned])).rejects.toMatchObject({ details: { reason: 'unplanned_shop' } });
  });

  it('refuses a list without the completeness evidence', async () => {
    const begun = await begin();
    await expect(channels.runBegun(begun, () => [
      { chunkKind: SABANGNET_MALL_LISTINGS_CHUNK_KIND, items: [row()] },
    ])).rejects.toMatchObject({ code: 'SOURCE_SNAPSHOT_INVALID' });
  });

  it('writes nothing when the operation fails', async () => {
    const begun = await begin();
    const failed = await channels.runBegun(begun, (plan) => [
      { chunkKind: SABANGNET_MALL_LISTINGS_CHUNK_KIND, items: [row()] },
      { chunkKind: SABANGNET_MALL_LISTINGS_SCAN_CHUNK_KIND, items: [scan(String(plan.dateTo), [row()])] },
    ], { outcome: 'failed' });
    expect(failed.status).toBe('failed');
    expect(await prisma.channelListing.count()).toBe(0);
    expect(await prisma.operationChunk.count()).toBe(0);
  });

  it('writes to the row the hub picks when a mall has two rows', async () => {
    await prisma.channelAccount.create({
      data: { id: KIDSNOTE_LATER, organizationId: ORG, channel: 'kidsnote', externalAccountId: 'kidsnote-2', name: '키즈노트 2', status: 'configured', createdAt: new Date('2026-06-01T00:00:00Z') },
    });
    await complete([row()]);
    await expect(prisma.channelListing.findFirstOrThrow({ where: { organizationId: ORG, externalId: 'KN-1' } }))
      .resolves.toMatchObject({ channelAccountId: KIDSNOTE });
  });

  it('refuses to publish when the mall account rows changed after the plan', async () => {
    const begun = await begin();
    await prisma.channelAccount.update({ where: { id: KIDSNOTE }, data: { isPrimary: false, createdAt: new Date('2026-09-01T00:00:00Z') } });
    await prisma.channelAccount.create({
      data: { id: KIDSNOTE_LATER, organizationId: ORG, channel: 'kidsnote', externalAccountId: 'kidsnote-2', name: '키즈노트 2', status: 'configured', isPrimary: true },
    });
    await expect(channels.runBegun(begun, (plan) => [
      { chunkKind: SABANGNET_MALL_LISTINGS_CHUNK_KIND, items: [row()] },
      { chunkKind: SABANGNET_MALL_LISTINGS_SCAN_CHUNK_KIND, items: [scan(String(plan.dateTo), [row()])] },
    ])).rejects.toMatchObject({ code: 'SOURCE_SNAPSHOT_INVALID', details: { reason: 'mall_account_changed' } });
    expect(await prisma.channelListing.count()).toBe(0);
  });
});

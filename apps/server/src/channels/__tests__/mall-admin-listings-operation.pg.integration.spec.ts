import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MALL_ADMIN_LISTINGS_CHUNK_KIND,
  MALL_ADMIN_LISTINGS_KIND,
  MALL_ADMIN_LISTINGS_SCAN_CHUNK_KIND,
} from '@kiditem/shared/channels-operations';
import type { MallAdminListingRow, MallAdminListingsScan } from '@kiditem/shared/mall-admin-listings';
import type { OperationBeginResponse } from '@kiditem/shared/operation';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID as OTHER_ORG,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../test-helpers/real-prisma';
import { makeChannelsOperations } from '../../test-helpers/channels-operations';

const KIDKIDS = '11111111-1111-4111-8111-111111111111';
const ICECREAM = '22222222-2222-4222-8222-222222222222';
const ONCH = '33333333-3333-4333-8333-333333333333';

function row(overrides: Partial<MallAdminListingRow> = {}): MallAdminListingRow {
  return {
    mallProductCode: '1098464',
    productName: '[키드아이템] 왁스팝 말랑이 1p 왁뿌',
    sellpiaName: '3000왁스팝 말랑이',
    sellerCode: null,
    salePrice: 1900,
    statusWords: ['정상'],
    registeredOn: null,
    ...overrides,
  };
}

function scan(plan: Record<string, unknown>, rows: MallAdminListingRow[], overrides: Partial<MallAdminListingsScan['collection']> = {}): MallAdminListingsScan {
  const detailed = plan.mallKey === 'icecream-mall';
  return {
    collection: {
      totalRecords: rows.length,
      recordsRead: rows.length,
      pagesRead: 1,
      totalPages: 1,
      detailsRead: detailed ? rows.filter((item) => item.sellpiaName !== null).length : 0,
      detailsMissing: detailed ? rows.filter((item) => item.sellpiaName === null).length : 0,
      ...overrides,
    },
    proof: { mallKey: plan.mallKey as 'kidkids', pageSize: plan.pageSize as number, validatedList: true },
  };
}

/**
 * 몰 관리자 목록 = `channels.mall_admin_listings` 실행 하나(KID-363 L2, 1차 몰 넷). plan은 몰 허브가 고르는 계정 행을
 * 얼리고 `account:<id>`를 잡는다. 확장은 상품 줄을 `listing_rows`, 끝까지 읽은 증거를 `listing_scan`으로 보내고, finish
 * 트랜잭션만 리스팅을 쓰고 이 원천이 만든 행 중 사라진 것을 끈다.
 */
describe('Mall admin listings over the operation contract (PG integration)', () => {
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
        { id: KIDKIDS, organizationId: ORG, channel: 'kidkids', externalAccountId: 'kidkids', name: '키드키즈', status: 'configured' },
        { id: ICECREAM, organizationId: ORG, channel: 'icecream-mall', externalAccountId: 'icecream-mall', name: '아이스크림몰', status: 'paused' },
        { id: ONCH, organizationId: ORG, channel: 'onch', externalAccountId: 'onch', name: '온채널', status: 'configured' },
      ],
    });
  });

  function begin(mallKey = 'kidkids', channelAccountId = KIDKIDS): Promise<OperationBeginResponse> {
    return channels.operations.begin(ORG, { kind: MALL_ADMIN_LISTINGS_KIND, scope: { channelAccountId, mallKey } }, { userId: null });
  }

  function finish(begun: OperationBeginResponse, rows: MallAdminListingRow[], overrides: Partial<MallAdminListingsScan['collection']> = {}) {
    return channels.runBegun(begun, (plan) => [
      { chunkKind: MALL_ADMIN_LISTINGS_CHUNK_KIND, items: rows },
      { chunkKind: MALL_ADMIN_LISTINGS_SCAN_CHUNK_KIND, items: [scan(plan, rows, overrides)] },
    ]);
  }

  it('freezes the mall account row under its account lock, runs one import per account, and keeps other malls apart', async () => {
    const begun = await begin();
    expect(begun.operation).toMatchObject({
      status: 'executing',
      lockKeys: [`account:${KIDKIDS}`],
      plan: { sourceType: 'mall_admin_listings', mallKey: 'kidkids', channelAccountId: KIDKIDS, sourceOrigin: 'https://partner.kidkids.net', pageSize: 20000 },
    });
    await expect(begin()).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    await expect(begin('icecream-mall', ICECREAM)).resolves.toMatchObject({ operation: { plan: { mallKey: 'icecream-mall', pageSize: 10000 } } });

    const source = await channels.mallAdmin.readSource({ organizationId: ORG });
    const kidkids = source.malls.find((mall) => mall.mallKey === 'kidkids');
    expect(kidkids).toMatchObject({ channelAccountId: KIDKIDS, latestAttempt: null, latestComplete: null, latestOperation: { id: begun.operation.id, status: 'executing' }, latestSucceeded: null });
  });

  it('refuses a mall that has not moved to the operation, a mall without an account row, and a stale account', async () => {
    await expect(begin('onch', ONCH)).rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'mall_admin_operation_mall_unsupported' } });
    await expect(begin('art09', KIDKIDS)).rejects.toMatchObject({ code: 'CHANNELS_ACCOUNT_NOT_FOUND' });
    await expect(begin('kidkids', ICECREAM)).rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'mall_admin_account_mismatch' } });
    const other = makeChannelsOperations(prisma, { organizationId: OTHER_ORG });
    await expect(other.operations.begin(OTHER_ORG, { kind: MALL_ADMIN_LISTINGS_KIND, scope: { channelAccountId: KIDKIDS, mallKey: 'kidkids' } }, { userId: null }))
      .rejects.toMatchObject({ code: 'CHANNELS_ACCOUNT_NOT_FOUND' });
    expect(await prisma.operation.count()).toBe(0);
  });

  it('publishes one listing per mall product code with the Sellpia name as the option name, once', async () => {
    const operation = await finish(await begin(), [
      row(),
      row({ mallProductCode: '176227', productName: '비눗방울', sellpiaName: '비눗방울', statusWords: ['일시품절'] }),
      row({ mallProductCode: '200001', productName: '보류 상품', sellpiaName: null, sellerCode: '6402-1', statusWords: ['보류'] }),
    ]);
    expect(operation).toMatchObject({
      status: 'succeeded',
      result: { rows: 3, listings: 3, deactivated: 0, missingNames: 1, codedListings: 1, statuses: { 판매중: 1, 품절: 1, 보류: 1 } },
    });
    const listings = await prisma.channelListing.findMany({
      where: { organizationId: ORG, channelAccountId: KIDKIDS },
      orderBy: { externalId: 'asc' },
      select: { externalId: true, status: true, lastOperationId: true, lastImportRunId: true, options: { select: { itemName: true, sellerSku: true, lastOperationId: true } } },
    });
    expect(listings.map((listing) => [listing.externalId, listing.status, listing.lastOperationId, listing.lastImportRunId])).toEqual([
      ['1098464', '판매중', operation.id, null],
      ['176227', '품절', operation.id, null],
      ['200001', '보류', operation.id, null],
    ]);
    expect(listings[0]!.options).toEqual([{ itemName: '3000왁스팝 말랑이', sellerSku: null, lastOperationId: operation.id }]);
    expect(listings[2]!.options[0]).toMatchObject({ sellerSku: '6402-1' });

    const kidkids = (await channels.mallAdmin.readSource({ organizationId: ORG })).malls.find((mall) => mall.mallKey === 'kidkids');
    expect(kidkids?.latestSucceeded).toMatchObject({ id: operation.id });
    expect(kidkids?.latestPublication).toEqual({ listings: 3, deactivated: 0, missingNames: 1, codedListings: 1, statuses: { 판매중: 1, 품절: 1, 보류: 1 } });
    expect(await prisma.sourceImportRun.count()).toBe(0);
    expect(await prisma.operationChunk.count()).toBe(0);
  });

  it('turns off only its own listings that left the list — not a Sabangnet or KidItem listing on the row', async () => {
    await finish(await begin(), [row(), row({ mallProductCode: '176227' })]);
    await prisma.channelListing.createMany({
      data: [
        { organizationId: ORG, channelAccountId: KIDKIDS, externalId: 'KIDITEM-REGISTERED', status: 'active', rawJson: { source: 'kiditem_registration' } },
        { organizationId: ORG, channelAccountId: KIDKIDS, externalId: 'SABANGNET-SENT', status: '사방넷 공급중', rawJson: { source: 'sabangnet_mall_listings' } },
      ],
    });
    const second = await finish(await begin(), [row()]);
    expect(second.result).toMatchObject({ listings: 1, deactivated: 1 });
    const byId = new Map((await prisma.channelListing.findMany({
      where: { organizationId: ORG, channelAccountId: KIDKIDS },
      select: { externalId: true, isActive: true, lastOperationId: true },
    })).map((listing) => [listing.externalId, listing]));
    expect(byId.get('176227')).toMatchObject({ isActive: false, lastOperationId: second.id });
    expect(byId.get('KIDITEM-REGISTERED')).toMatchObject({ isActive: true });
    expect(byId.get('SABANGNET-SENT')).toMatchObject({ isActive: true });
  });

  it('keeps a product whose detail name could not be read, and refuses a detail-naming mall when a product was never opened', async () => {
    const detailed = [
      row({ mallProductCode: '11218365', productName: '피규어 슈팅 낙하산 1p', sellpiaName: '3000피규어슈팅낙하산', statusWords: ['판매중', '전시'] }),
      row({ mallProductCode: '889504', productName: 'LCD전자메모보드', sellpiaName: null, statusWords: ['판매종료', '전시안함'] }),
    ];
    const operation = await finish(await begin('icecream-mall', ICECREAM), detailed);
    expect(operation.result).toMatchObject({ listings: 2, missingNames: 1, statuses: { 판매중: 1, 판매종료: 1 } });

    const begun = await begin('icecream-mall', ICECREAM);
    await expect(finish(begun, detailed, { detailsRead: 0, detailsMissing: 0 }))
      .rejects.toMatchObject({ code: 'SOURCE_SNAPSHOT_INVALID', details: { reason: 'detail_count_mismatch' } });
    await channels.fail(begun);
  });

  it('writes nothing for an incomplete list or a failed run, and releases the account', async () => {
    const begun = await begin();
    await expect(finish(begun, [row()], { totalRecords: 2, recordsRead: 1 }))
      .rejects.toMatchObject({ code: 'SOURCE_SNAPSHOT_INVALID', details: { reason: 'incomplete_records' } });
    expect(await prisma.channelListing.count()).toBe(0);
    await channels.fail(begun);

    const failed = await channels.runBegun(await begin(), (plan) => [
      { chunkKind: MALL_ADMIN_LISTINGS_CHUNK_KIND, items: [row()] },
      { chunkKind: MALL_ADMIN_LISTINGS_SCAN_CHUNK_KIND, items: [scan(plan, [row()])] },
    ], { outcome: 'failed' });
    expect(failed.status).toBe('failed');
    expect(await prisma.channelListing.count()).toBe(0);
    expect(await prisma.operationLock.count()).toBe(0);
  });

  it('refuses to publish when the hub picks another row for the mall after the plan', async () => {
    const begun = await begin();
    await prisma.channelAccount.create({
      data: { organizationId: ORG, channel: 'kidkids', externalAccountId: 'kidkids-2', name: '키드키즈 2', status: 'configured', isPrimary: true },
    });
    await expect(finish(begun, [row()])).rejects.toMatchObject({ code: 'SOURCE_SNAPSHOT_INVALID', details: { reason: 'mall_account_changed' } });
    expect(await prisma.channelListing.count()).toBe(0);
  });
});

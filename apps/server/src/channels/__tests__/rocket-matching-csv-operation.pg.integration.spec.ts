import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ROCKET_MATCHING_CSV_KIND } from '@kiditem/shared/channels-operations';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { makeChannelsOperations } from '../../test-helpers/channels-operations';

const ROCKET_ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';
const WING_ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

const HEADERS = '번호,쿠팡공급상태,쿠팡공급사_상품명,바코드,skuId,vendorItemId,셀피아상품,셀피아바코드,매칭방식,신뢰도,셀피아저장매칭,KidItem동기화,매칭상태,근거';

function csv(lines: string[]): Uint8Array {
  return Buffer.from([`﻿${HEADERS}`, ...lines].join('\n'));
}

const TWO_ROWS = csv([
  '1,활성,"돌고래 비눗방울총 블루,핑크",8806384883947,17616314,78399258325,6000돌고래비눗방울총,8806384885163,이름매칭,high,,,이름매칭(高),제품명 일치',
  '2,활성,공룡 물총,8806384883954,17616315,78399258326,공룡물총,8806384885170,바코드매칭,high,Y,,바코드매칭,바코드 일치',
]);

/**
 * 로켓-셀피아 매칭 CSV = `channels.rocket_matching_csv` 실행 하나(KID-363 L4). 웹 업로드를 서버가 받아 스스로
 * producer가 된다: begin(fileHash) → `csv_rows` 청크 → finish. 반영은 finish 트랜잭션 안에서만 일어나고
 * `source_import_runs`는 쓰지 않는다.
 */
describe('Rocket matching CSV over the operation contract (PG integration)', () => {
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
        { id: ROCKET_ACCOUNT_ID, organizationId: TEST_ORGANIZATION_ID, channel: 'rocket', name: 'Rocket', externalAccountId: 'rocket', status: 'active' },
        { id: WING_ACCOUNT_ID, organizationId: TEST_ORGANIZATION_ID, channel: 'coupang', name: 'Wing', externalAccountId: 'wing', status: 'active' },
      ],
    });
  });

  it('publishes each skuId as one listing with one option under the succeeded operation, without a source import run', async () => {
    const { operation } = await channels.uploadRocketCsv(ROCKET_ACCOUNT_ID, TWO_ROWS);

    const row = await prisma.operation.findUniqueOrThrow({ where: { id: operation.id } });
    expect(row.fileHash).toMatch(/^[0-9a-f]{64}$/);
    expect(operation).toMatchObject({
      kind: ROCKET_MATCHING_CSV_KIND,
      status: 'succeeded',
      result: {
        rowCount: 2,
        createdProductCount: 2,
        updatedProductCount: 0,
        createdSkuCount: 2,
        updatedSkuCount: 0,
      },
    });
    const listings = await prisma.channelListing.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID, channelAccountId: ROCKET_ACCOUNT_ID },
      include: { options: true },
      orderBy: { externalId: 'asc' },
    });
    expect(listings.map((row) => [row.externalId, row.displayName, row.lastOperationId, row.lastImportRunId])).toEqual([
      ['17616314', '돌고래 비눗방울총 블루,핑크', operation.id, null],
      ['17616315', '공룡 물총', operation.id, null],
    ]);
    expect(listings.flatMap((row) => row.options.map((option) => [option.sellerSku, option.barcode, option.lastOperationId])))
      .toEqual([
        ['17616314', '8806384883947', operation.id],
        ['17616315', '8806384883954', operation.id],
      ]);
    expect(await prisma.sourceImportRun.count()).toBe(0);
    expect(await prisma.operationChunk.count()).toBe(0);
  });

  it('refuses the same file for the same account again and writes nothing new', async () => {
    const first = await channels.uploadRocketCsv(ROCKET_ACCOUNT_ID, TWO_ROWS);
    const before = await prisma.channelListingOption.findMany({ orderBy: { id: 'asc' } });

    await expect(channels.uploadRocketCsv(ROCKET_ACCOUNT_ID, TWO_ROWS)).rejects.toMatchObject({
      code: 'DB_CONFLICT',
      details: { reason: 'file_already_applied', existing: { operationId: first.operation.id } },
    });
    expect(await prisma.channelListingOption.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
    expect(await prisma.operation.count({ where: { kind: ROCKET_MATCHING_CSV_KIND } })).toBe(1);
  });

  it('closes the operation failed and writes no listing when the rows cannot be published, then releases the account', async () => {
    // 이미 다른 부모 상품에 붙은 옵션 id(17616315)는 옮기지 않는다 → finalize가 멈추고 실행은 failed.
    const other = await prisma.channelListing.create({
      data: { organizationId: TEST_ORGANIZATION_ID, channelAccountId: ROCKET_ACCOUNT_ID, externalId: 'P-OTHER', channelName: '다른 상품' },
    });
    await prisma.channelListingOption.create({
      data: { organizationId: TEST_ORGANIZATION_ID, listingId: other.id, externalOptionId: '17616315', itemName: '다른 옵션' },
    });

    await expect(channels.uploadRocketCsv(ROCKET_ACCOUNT_ID, TWO_ROWS)).rejects.toThrow();
    const failed = await prisma.operation.findFirstOrThrow({ where: { kind: ROCKET_MATCHING_CSV_KIND } });
    expect(failed.status).toBe('failed');
    expect(await prisma.channelListing.count({ where: { channelAccountId: ROCKET_ACCOUNT_ID, externalId: '17616314' } })).toBe(0);
    expect(await prisma.operationLock.count()).toBe(0);
    expect(await prisma.operationChunk.count()).toBe(0);

    const { operation } = await channels.uploadRocketCsv(ROCKET_ACCOUNT_ID, csv([
      '1,활성,돌고래 비눗방울총,8806384883947,17616314,78399258325,,,,,,,,',
    ]));
    expect(operation.status).toBe('succeeded');
  });

  it('refuses a non-Rocket account and an empty file before any operation starts', async () => {
    await expect(channels.uploadRocketCsv(WING_ACCOUNT_ID, TWO_ROWS)).rejects.toMatchObject({
      code: 'CHANNELS_ACCOUNT_INVALID',
    });
    await expect(channels.uploadRocketCsv(ROCKET_ACCOUNT_ID, csv([]))).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(await prisma.operation.count()).toBe(0);
  });
});

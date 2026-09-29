import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import type { PrismaService } from '../../prisma/prisma.service';
import { ownerTransaction } from '../../prisma/owner-transaction';
import { ChannelListingQueryPersistenceAdapter } from '../adapter/out/persistence/channel-listing-query.persistence.adapter';

/**
 * 판매중 정본 리더(KID-333 ②, 사장님 2026-09-29 Q1). 모든 화면·ABC·매칭 카드·대시보드가 이 판정 하나를 읽는다:
 * isActive ∧ 리스팅 상태가 게시 집합 ∧ 원본(rawJson) 판매상태가 있으면 판매중. 모르는 상태는 판매중이 아니다.
 */
describe('판매중 리스팅 리더 readSellingListings (PG integration)', () => {
  let prisma: PrismaClient;
  let adapter: ChannelListingQueryPersistenceAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    adapter = new ChannelListingQueryPersistenceAdapter(prisma as unknown as PrismaService);
  });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function account(channel: string, status = 'active', organizationId = TEST_ORGANIZATION_ID) {
    return prisma.channelAccount.create({
      data: { organizationId, channel, name: `${channel}-${status}`, status, externalAccountId: randomUUID() },
      select: { id: true },
    });
  }

  async function listing(input: {
    accountId: string;
    externalId: string;
    status: string | null;
    rawJson?: Prisma.InputJsonValue;
    isActive?: boolean;
    options?: Array<{ status: string | null; isActive?: boolean; masterProductIds?: string[] }>;
    organizationId?: string;
  }) {
    const organizationId = input.organizationId ?? TEST_ORGANIZATION_ID;
    const row = await prisma.channelListing.create({
      data: {
        organizationId,
        channelAccountId: input.accountId,
        externalId: input.externalId,
        status: input.status,
        isActive: input.isActive ?? true,
        ...(input.rawJson !== undefined ? { rawJson: input.rawJson } : {}),
      },
      select: { id: true },
    });
    for (const [index, option] of (input.options ?? []).entries()) {
      const created = await prisma.channelListingOption.create({
        data: {
          organizationId,
          listingId: row.id,
          externalOptionId: `${input.externalId}-${index}`,
          status: option.status,
          isActive: option.isActive ?? true,
        },
        select: { id: true },
      });
      for (const masterProductId of option.masterProductIds ?? []) {
        await prisma.channelListingOptionInventoryComponent.create({
          data: { organizationId, channelListingOptionId: created.id, masterProductId, quantity: 1 },
        });
      }
    }
    return row.id;
  }

  function read(input: Omit<Parameters<ChannelListingQueryPersistenceAdapter['readSellingListings']>[1], 'organizationId'> = {}) {
    return prisma.$transaction((tx) => adapter.readSellingListings(ownerTransaction(tx), { organizationId: TEST_ORGANIZATION_ID, ...input }));
  }

  it('Q1 경우들: 승인완료+원본 판매중지·단종·observed·옵션 전부 중지는 판매중이 아니고, 게시 상태+원본 판매중만 판매중이다', async () => {
    const wing = await account('coupang');
    const rocket = await account('rocket');
    const selling = await listing({ accountId: wing.id, externalId: 'P-SELLING', status: '승인완료', rawJson: { saleStatus: '판매중' }, options: [{ status: null }] });
    const rawStopped = await listing({ accountId: wing.id, externalId: 'P-RAW-STOPPED', status: '승인완료', rawJson: { saleStatus: '판매중지' } });
    const discontinued = await listing({ accountId: rocket.id, externalId: 'R-DISCONTINUED', status: '단종' });
    const observed = await listing({ accountId: rocket.id, externalId: 'R-OBSERVED', status: 'observed' });
    const optionsStopped = await listing({ accountId: wing.id, externalId: 'P-OPTIONS-STOPPED', status: '승인완료', options: [{ status: '품절' }, { status: 'DENIED' }] });
    const turnedOff = await listing({ accountId: rocket.id, externalId: 'R-OFF', status: '활성', isActive: false });

    const rows = await read();
    const state = new Map(rows.map((row) => [row.listingId, row.saleState]));

    expect(state.get(selling)).toBe('on_sale');
    expect(state.get(rawStopped)).toBe('off_sale');
    expect(state.get(discontinued)).toBe('off_sale');
    expect(state.get(observed)).toBe('unknown');
    expect(state.get(optionsStopped)).toBe('off_sale');
    // 꺼 둔 리스팅은 판매중 후보가 아니라 읽지 않는다.
    expect(state.has(turnedOff)).toBe(false);
    expect(rows.find((row) => row.listingId === selling)).toMatchObject({ channel: 'coupang', channelAccountId: wing.id });
  });

  it('판정은 켜진 옵션의 상태만 본다 — 지운 옵션의 판매중 글자는 품절 옵션을 가리지 않는다', async () => {
    const wing = await account('coupang');
    const id = await listing({
      accountId: wing.id, externalId: 'P-DELETED-OPTION', status: '승인완료',
      options: [{ status: '품절' }, { status: 'on_sale', isActive: false }],
    });

    const [row] = await read();

    expect(row).toMatchObject({ listingId: id, saleState: 'off_sale' });
    expect(row!.options.map((option) => option.isActive).sort()).toEqual([false, true]);
  });

  it('옵션 레시피 구성품을 싣고, 채널·계정·쓸 수 있는 계정 상태·조직으로 거른다', async () => {
    const wing = await account('coupang');
    const paused = await account('coupang', 'paused');
    const mall = await account('kidkids', 'configured');
    const theirs = await account('coupang', 'active', OTHER_ORGANIZATION_ID);
    const masterProductId = randomUUID();
    const wingListing = await listing({ accountId: wing.id, externalId: 'P-1', status: 'on_sale', options: [{ status: 'on_sale', masterProductIds: [masterProductId] }] });
    const pausedListing = await listing({ accountId: paused.id, externalId: 'P-2', status: 'on_sale' });
    const mallListing = await listing({ accountId: mall.id, externalId: 'M-1', status: '판매중' });
    await listing({ accountId: theirs.id, externalId: 'P-THEIRS', status: 'on_sale', organizationId: OTHER_ORGANIZATION_ID });

    expect((await read()).map((row) => row.listingId).sort()).toEqual([wingListing, pausedListing, mallListing].sort());
    expect((await read({ usableAccountsOnly: true })).map((row) => row.listingId).sort()).toEqual([wingListing, mallListing].sort());
    expect((await read({ channels: ['kidkids'] })).map((row) => row.listingId)).toEqual([mallListing]);
    expect((await read({ channelAccountIds: [paused.id] })).map((row) => row.listingId)).toEqual([pausedListing]);
    expect(await read({ channels: [] })).toEqual([]);
    const wingRow = (await read({ channelAccountIds: [wing.id] }))[0]!;
    expect(wingRow.options[0]!.components).toEqual([{ masterProductId, quantity: 1 }]);
  });
});

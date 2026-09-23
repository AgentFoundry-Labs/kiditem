import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import type { PrismaService } from '../../prisma/prisma.service';
import { ChannelListingQueryPersistenceAdapter } from '../adapter/out/persistence/channel-listing-query.persistence.adapter';

/**
 * 등록 상품 목록은 실제 몰 상품(`ChannelListing`)을 읽는다. 작업공간이나 공통 판매상품이
 * 있어야 보이는 것이 아니다 — 몰에서 수집한 상품은 KidItem 안에 준비 기록이 없어도 등록된
 * 상품이다.
 */
describe('channel listing list (PG integration)', () => {
  let prisma: PrismaClient;
  let adapter: ChannelListingQueryPersistenceAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    adapter = new ChannelListingQueryPersistenceAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('lists a collected listing that has no content workspace and no selling product', async () => {
    const account = await prisma.channelAccount.create({
      data: { organizationId: TEST_ORGANIZATION_ID, channel: 'coupang', name: 'Wing' },
      select: { id: true },
    });
    const bare = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: 'P-COLLECTED-ONLY',
        displayName: '수집으로만 생긴 상품',
        rawJson: { source: 'coupang_catalog_basics' },
      },
      select: { id: true, salesProductId: true },
    });
    const prepared = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: 'P-WITH-WORKSPACE',
        displayName: '작업공간이 있는 상품',
      },
      select: { id: true },
    });
    await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'channel_listing',
        channelListingId: prepared.id,
        displayName: '작업공간이 있는 상품',
        normalizedTitle: 'prepared',
        createdByUserId: TEST_USER_ID,
      },
    });

    const listed = await adapter.list(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 20,
      includeDeleted: false,
    });

    expect(listed.total).toBe(2);
    expect(listed.items.map((item) => item.externalId).sort())
      .toEqual(['P-COLLECTED-ONLY', 'P-WITH-WORKSPACE']);
    // 판매상품을 지어내지 않는다 — 후보는 그 판매상품을 거쳐야만 닿는다(KID-310).
    expect(bare.salesProductId).toBeNull();
    expect(listed.items.find((item) => item.externalId === 'P-COLLECTED-ONLY'))
      .toMatchObject({ sourceRecordId: null, contentWorkspaceId: null });
  });

  it('hides another organizations listing on the same channel', async () => {
    const [mine, theirs] = await Promise.all([
      prisma.channelAccount.create({
        data: { organizationId: TEST_ORGANIZATION_ID, channel: 'coupang', name: 'Wing' },
        select: { id: true },
      }),
      prisma.channelAccount.create({
        data: { organizationId: OTHER_ORGANIZATION_ID, channel: 'coupang', name: 'Wing' },
        select: { id: true },
      }),
    ]);
    await prisma.channelListing.createMany({
      data: [
        { organizationId: TEST_ORGANIZATION_ID, channelAccountId: mine.id, externalId: 'P-MINE' },
        { organizationId: OTHER_ORGANIZATION_ID, channelAccountId: theirs.id, externalId: 'P-THEIRS' },
      ],
    });

    const listed = await adapter.list(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 20,
      includeDeleted: false,
      channel: 'coupang',
    });

    expect(listed.items.map((item) => item.externalId)).toEqual(['P-MINE']);
    expect(listed.marketCounts.map((count) => count.count)).toEqual([1]);
  });
});

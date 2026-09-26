import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import { advertisingKeywordOperationsApp } from '../../test-helpers/advertising-operations';
import { AdvertisingKeywordRankReadAdapter } from '../../advertising/adapter/out/repository/keyword-rank-read.adapter';
import { ReadinessController } from '../readiness.controller';
import { ReadinessService } from '../readiness.service';
import { ChannelAccountService } from '../../channels/application/service/account/channel-account.service';
import { ChannelAccountPersistenceAdapter } from '../../channels/adapter/out/persistence/channel-account.persistence.adapter';
import { ChannelCredentialsAdapter } from '../../channels/adapter/out/credentials/channel-credentials.adapter';
import type { ReadinessResponse } from '@kiditem/shared/readiness';
import { WING_RANK_CHUNK_KIND, WING_RANK_KIND } from '@kiditem/shared/advertising-operations';
import { ChannelsProductMappingGenerationAdapter } from "../../channels/adapter/out/products/product-mapping-generation.adapter";
import { ProductMappingGenerationRepositoryAdapter } from "../../products/adapter/out/persistence/product-mapping-generation.repository.adapter";

describe('Wing rank readiness over advertising.wing_rank operations through public Readiness HTTP + PostgreSQL', () => {
  let prisma: PrismaClient;
  let harness: Awaited<ReturnType<typeof advertisingKeywordOperationsApp>>;
  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    harness = await advertisingKeywordOperationsApp(prisma, {
      controllers: [ReadinessController],
      providers: [{
        provide: ReadinessService,
        useValue: new ReadinessService(
          prisma as never,
          new ChannelAccountService(
            new ChannelAccountPersistenceAdapter(prisma as never, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter())),
            new ChannelCredentialsAdapter(),
          ),
          { catalogFreshness: async () => ({ syncedAt: null }) },
          new AdvertisingKeywordRankReadAdapter(prisma as never),
        ),
      }],
    });
  });
  afterAll(async () => {
    vi.useRealTimers();
    await harness?.app.close();
    await prisma?.$disconnect();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  beforeEach(async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-06T03:00:00Z'));
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: ORG,
        channel: 'coupang',
        name: 'Primary',
        isPrimary: true,
      },
    });
    for (const vendorItemId of ['OWN', 'MISS']) {
      const listing = await prisma.channelListing.create({
        data: {
          organizationId: ORG,
          channelAccountId: account.id,
          externalId: vendorItemId,
          channelName: `${vendorItemId} 슬라임`,
        },
      });
      await prisma.channelListingOption.create({
        data: {
          organizationId: ORG,
          listingId: listing.id,
          externalOptionId: vendorItemId,
        },
      });
      await prisma.coupangRepresentativeKeywordOverride.create({
        data: { organizationId: ORG, vendorItemId, keyword: '슬라임' },
      });
    }
  });
  const status = async (): Promise<ReadinessResponse> =>
    (await request(harness.httpUrl).get('/api/readiness').expect(200)).body;
  const wing = (response: ReadinessResponse) =>
    response.checks.find((check) => check.key === 'wing_rank')!;
  const primaryAccount = async () =>
    (await prisma.channelAccount.findFirstOrThrow({ where: { organizationId: ORG, isPrimary: true } })).id;
  const begin = async (keyword = '슬라임', channelAccountId?: string) =>
    harness.beginRun(WING_RANK_KIND, { channelAccountId: channelAccountId ?? await primaryAccount(), keywords: [keyword] });
  /** 확장 수집기처럼: 키워드 한 장(결과 없음 = 모두 순위권 밖)을 올리고 finish. */
  const complete = async (
    capturedAt = '2026-09-05T03:00:00.000Z',
    keyword = '슬라임',
    channelAccountId?: string,
  ) => {
    const run = await begin(keyword, channelAccountId);
    await harness.put(run, [{ chunkKind: WING_RANK_CHUNK_KIND, payload: [{ keyword, capturedAt, pagesScanned: 1, items: [] }] }]);
    const done = await harness.finish(run).expect(200);
    expect(done.body.operation.status).toBe('succeeded');
    return run;
  };

  it('ignores legacy rows without an operation, then recognizes an operation-published observed-empty null miss through yesterday coverage', async () => {
    await prisma.coupangWingSalesRankDailySnapshot.createMany({
      data: ['OWN', 'MISS'].map((vendorItemId) => ({
        organizationId: ORG,
        keyword: 'legacy',
        vendorItemId,
        businessDate: new Date('2026-09-06'),
        capturedAt: new Date(),
        salesRank: 1,
      })),
    });
    const before = await status();
    expect(wing(before)).toMatchObject({
      basis: {
        kind: 'snapshot',
        measured: false,
        asOf: null,
        requiredAsOf: '2026-09-05',
        sources: ['coupang_wing_rank'],
        withheldCount: 2,
      },
      count: 0,
      lastSyncedAt: null,
    });
    await complete();
    const after = await status();
    expect(wing(after)).toMatchObject({
      basis: {
        kind: 'snapshot',
        measured: true,
        asOf: '2026-09-05',
        requiredAsOf: '2026-09-05',
        observedAt: '2026-09-05T03:00:00.000Z',
        sources: ['coupang_wing_rank'],
        withheldCount: 0,
      },
      count: 2,
      lastSyncedAt: '2026-09-05T03:00:00.000Z',
      referenceDate: '2026-09-05',
      detail: expect.stringContaining('2/2상품'),
    });
    expect(after.checks.filter((check) => check.key !== 'wing_rank')).toEqual(
      before.checks.filter((check) => check.key !== 'wing_rank'),
    );
  });

  it('excludes legacy, failed-operation and other-organization rows from latest date, coverage and count', async () => {
    const foreign = await prisma.organization.create({
      data: { name: 'Other organization', slug: randomUUID() },
    });
    // 옛 attempt 행(operationId 없음)과 다른 조직의 실행 행은 세지 않는다.
    await prisma.coupangWingSalesRankDailySnapshot.createMany({
      data: ['OWN', 'MISS'].flatMap((vendorItemId) => [
        { organizationId: ORG, keyword: 'legacy', vendorItemId, businessDate: new Date('2026-09-06'), capturedAt: new Date(), salesRank: 1 },
        { organizationId: foreign.id, operationId: randomUUID(), keyword: 'foreign', vendorItemId, businessDate: new Date('2026-09-06'), capturedAt: new Date(), salesRank: 1 },
      ]),
    });
    // 실패로 끝난 실행은 원장에 아무것도 쓰지 않는다.
    const failed = await begin();
    await harness.put(failed, [{ chunkKind: WING_RANK_CHUNK_KIND, payload: [{ keyword: '슬라임', capturedAt: '2026-09-06T01:00:00.000Z', pagesScanned: 1, items: [] }] }]);
    await harness.finish(failed, { outcome: 'failed', errorCode: 'SITE_REQUEST_FAILED' }).expect(200);
    expect(wing(await status())).toMatchObject({
      basis: {
        measured: false,
        asOf: null,
        requiredAsOf: '2026-09-05',
        withheldCount: 2,
      },
      count: 0,
      lastSyncedAt: null,
    });
    await complete('2026-09-04T03:00:00.000Z');
    expect(wing(await status())).toMatchObject({
      basis: {
        measured: true,
        asOf: '2026-09-04',
        requiredAsOf: '2026-09-05',
        withheldCount: 0,
      },
      count: 2,
      lastSyncedAt: '2026-09-04T03:00:00.000Z',
    });
    await complete();
    expect(wing(await status())).toMatchObject({
      basis: { measured: true, asOf: '2026-09-05', withheldCount: 0 },
      count: 2,
      lastSyncedAt: '2026-09-05T03:00:00.000Z',
    });
    await prisma.coupangRepresentativeKeywordOverride.updateMany({
      where: { organizationId: ORG, vendorItemId: 'MISS' },
      data: { keyword: '문구' },
    });
    await complete('2026-09-06T02:00:00.000Z');
    expect(wing(await status())).toMatchObject({
      basis: { measured: true, asOf: '2026-09-06', withheldCount: 1 },
      count: 1,
      detail: expect.stringContaining('1/2상품'),
    });
    await complete('2026-09-06T02:01:00.000Z', '문구');
    expect(wing(await status())).toMatchObject({
      basis: { measured: true, asOf: '2026-09-06', withheldCount: 0 },
      count: 2,
      detail: expect.stringContaining('2/2상품'),
    });
    await prisma.coupangRepresentativeKeywordOverride.updateMany({
      where: { organizationId: ORG, vendorItemId: 'OWN' },
      data: { keyword: '다른 후보' },
    });
    await complete('2026-09-06T02:02:00.000Z', '다른 후보');
    expect(wing(await status())).toMatchObject({
      basis: { measured: true, asOf: '2026-09-06', withheldCount: 0 },
      count: 3,
      detail: expect.stringContaining('2/2상품'),
    });
  });

  it('retains the prior succeeded readiness while a newer operation runs and after it fails', async () => {
    await complete();
    const baseline = await status();
    const run = await begin();
    expect(await status()).toEqual(baseline);
    const failed = await harness.finish(run, { outcome: 'failed', errorCode: 'SITE_REQUEST_FAILED' }).expect(200);
    expect(failed.body.operation.status).toBe('failed');
    expect(await status()).toEqual(baseline);
  });

  it('retains selected active-account isolation and active listing/option coverage despite newer COMPLETE rows elsewhere', async () => {
    await complete();
    const primary = await prisma.channelAccount.findFirstOrThrow({
      where: { organizationId: ORG, isPrimary: true },
    });
    const other = await prisma.channelAccount.create({
      data: { organizationId: ORG, channel: 'coupang', name: 'Other active' },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: ORG,
        channelAccountId: other.id,
        externalId: 'OTHER',
        channelName: '다른 계정 상품',
      },
    });
    await prisma.channelListingOption.create({
      data: {
        organizationId: ORG,
        listingId: listing.id,
        externalOptionId: 'OTHER',
      },
    });
    await prisma.coupangRepresentativeKeywordOverride.create({
      data: {
        organizationId: ORG,
        vendorItemId: 'OTHER',
        keyword: '다른 계정',
      },
    });
    await complete('2026-09-06T02:00:00.000Z', '다른 계정');
    expect(wing(await status())).toMatchObject({
      basis: { measured: true, asOf: '2026-09-05', withheldCount: 0 },
      count: 2,
      lastSyncedAt: '2026-09-05T03:00:00.000Z',
    });
    await prisma.channelListingOption.updateMany({
      where: { organizationId: ORG, externalOptionId: 'MISS' },
      data: { isActive: false },
    });
    expect(wing(await status())).toMatchObject({
      basis: { measured: true, asOf: '2026-09-05', withheldCount: 0 },
      count: 1,
      detail: expect.stringContaining('1/1상품'),
    });
    await prisma.channelListing.updateMany({
      where: { organizationId: ORG, externalId: 'OWN' },
      data: { isActive: false },
    });
    expect(wing(await status())).toMatchObject({
      basis: { measured: false, asOf: null, withheldCount: 0 },
      count: 0,
    });
    await prisma.channelAccount.update({
      where: { id: primary.id, organizationId: ORG },
      data: { status: 'inactive' },
    });
    expect(wing(await status())).toMatchObject({
      basis: { measured: true, asOf: '2026-09-06', withheldCount: 0 },
      count: 1,
      lastSyncedAt: '2026-09-06T02:00:00.000Z',
    });
    await prisma.channelAccount.update({
      where: { id: other.id, organizationId: ORG },
      data: { status: 'inactive' },
    });
    expect(wing(await status())).toMatchObject({
      basis: { measured: false, asOf: null, withheldCount: 0 },
      count: 0,
      lastSyncedAt: null,
    });
  });
});

import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { WingRankSourceController } from '../../advertising/adapter/in/http/wing-rank-source.controller';
import { WingRankSourceRepository } from '../../advertising/adapter/out/repository/wing-rank-source.repository';
import { KeywordRankRepositoryAdapter } from '../../advertising/adapter/out/repository/keyword-rank.repository.adapter';
import { KeywordRankService } from '../../advertising/application/service/keyword-rank.service';
import { WingSalesRankIngestHandler } from '../../advertising/application/service/wing-sales-rank-ingest.handler';
import { ReadinessController } from '../readiness.controller';
import { ReadinessService } from '../readiness.service';
import type { ReadinessResponse } from '@kiditem/shared/readiness';

const base = '/api/ads/keyword-rank/wing';
describe('Wing COMPLETE provenance through public Readiness HTTP + PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const rank = new KeywordRankRepositoryAdapter(prisma as never);
    const owner = new WingRankSourceRepository(
      prisma as never,
      new SourceFailureAlerts(prisma as never),
      rank,
      new WingSalesRankIngestHandler(rank),
      new KeywordRankService(rank),
    );
    const module = await Test.createTestingModule({
      controllers: [ReadinessController, WingRankSourceController],
      providers: [
        {
          provide: ReadinessService,
          useValue: new ReadinessService(prisma as never, {
            readPublished: async () => ({ channelAccountId: '', rows: [] }),
          }),
        },
        { provide: WingRankSourceRepository, useValue: owner },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use((req: { authUser?: unknown }, _res: unknown, next: () => void) => {
      req.authUser = { id: USER, organizationId: ORG };
      next();
    });
    await app.init();
  });
  afterAll(async () => {
    vi.useRealTimers();
    await app?.close();
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
    (await request(app.getHttpServer()).get('/api/readiness').expect(200)).body;
  const wing = (response: ReadinessResponse) =>
    response.checks.find((check) => check.key === 'wing_kpi')!;
  const begin = async (keyword = '슬라임') =>
    (
      await request(app.getHttpServer())
        .post(`${base}/attempts`)
        .set('Idempotency-Key', randomUUID())
        .send({ keyword })
        .expect(201)
    ).body;
  const complete = async (
    capturedAt = '2026-09-05T03:00:00.000Z',
    keyword = '슬라임',
  ) => {
    const attempt = await begin(keyword);
    const result = await request(app.getHttpServer())
      .put(`${base}/attempts/${attempt.attemptId}`)
      .set('x-source-attempt-token', attempt.attemptToken)
      .send({
        keyword,
        capturedAt,
        pagesScanned: 1,
        collectedCount: 0,
        totalResults: null,
        items: [],
        proof: {
          maxPages: 5,
          stopReason: 'empty_page',
          pages: [
            {
              searchPage: 0,
              itemCount: 0,
              nextSearchPage: null,
              resultArrayObserved: true,
            },
          ],
        },
      })
      .expect(200);
    expect(result.body.state).toBe('COMPLETE');
    return attempt;
  };

  it('ignores unlinked legacy rows, then recognizes owner COMPLETE observed-empty null misses through yesterday coverage', async () => {
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
    expect(after.checks.filter((check) => check.key !== 'wing_kpi')).toEqual(
      before.checks.filter((check) => check.key !== 'wing_kpi'),
    );
  });

  it('excludes nonterminal, failed, wrong-source/parser/org rows from latest date, coverage and count', async () => {
    const foreign = await prisma.organization.create({
      data: { name: 'Other organization', slug: randomUUID() },
    });
    for (const [
      kind,
      statusValue,
      sourceType,
      parserVersion,
      organizationId,
    ] of [
      ['running', 'running', 'coupang_wing_rank', 'wing-rank-v1', ORG],
      ['failed', 'failed', 'coupang_wing_rank', 'wing-rank-v1', ORG],
      [
        'wrong-source',
        'completed',
        'coupang_keyword_serp',
        'wing-rank-v1',
        ORG,
      ],
      ['wrong-parser', 'completed', 'coupang_wing_rank', 'other-parser', ORG],
      [
        'wrong-org',
        'completed',
        'coupang_wing_rank',
        'wing-rank-v1',
        foreign.id,
      ],
    ]) {
      const run = await prisma.sourceImportRun.create({
        data: {
          organizationId,
          rankKeyword: kind,
          sourceType,
          parserVersion,
          status: statusValue,
        },
      });
      await prisma.coupangWingSalesRankDailySnapshot.createMany({
        data: ['OWN', 'MISS'].map((vendorItemId) => ({
          organizationId,
          sourceImportRunId: run.id,
          keyword: kind,
          vendorItemId,
          businessDate: new Date('2026-09-06'),
          capturedAt: new Date(),
          salesRank: 1,
        })),
      });
    }
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

  it('retains the prior COMPLETE readiness after a newer owner attempt fails', async () => {
    await complete();
    const baseline = await status();
    const attempt = await begin();
    expect(await status()).toEqual(baseline);
    const failed = await request(app.getHttpServer())
      .post(`${base}/attempts/${attempt.attemptId}/fail`)
      .set('x-source-attempt-token', attempt.attemptToken)
      .send({ code: 'PROVIDER_FAILED', message: 'Wing provider failed.' })
      .expect(201);
    expect(failed.body.state).toBe('FAILED');
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

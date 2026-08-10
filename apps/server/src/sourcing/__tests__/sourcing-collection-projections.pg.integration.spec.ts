import { createHash, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { SourcingCollectionRepositoryAdapter } from '../adapter/out/repository/sourcing-collection.repository.adapter';
import {
  mapTrendTypedRecordsToAuthorizedOutput,
} from '../application/service/sourcing-collection-mappers';
import type {
  SourcingCollectionPermit,
  SourcingTypedCollectionRecord,
} from '../application/port/out/repository/sourcing-collection.repository.port';

const BUSINESS_DATE = new Date('2026-08-10T00:00:00.000Z');
const NEWER_CAPTURED_AT = new Date('2026-08-10T10:00:00.000Z');
const OLDER_CAPTURED_AT = new Date('2026-08-10T09:00:00.000Z');

describe('SourcingCollectionRepositoryAdapter typed daily projection ordering (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: SourcingCollectionRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new SourcingCollectionRepositoryAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it.each(projectionCases)('never lets an older $name observation replace a newer projection', async (case_) => {
    const newer = await commitTypedRecord(case_, NEWER_CAPTURED_AT, 'newer');
    const stale = await commitTypedRecord(case_, OLDER_CAPTURED_AT, 'older');

    expect(newer).toMatchObject({ kind: 'committed', staleDiscardedCount: 0 });
    expect(stale).toMatchObject({ kind: 'committed', staleDiscardedCount: 1 });
    await expect(case_.readMarker(prisma)).resolves.toBe(case_.newerMarker);
  });

  async function commitTypedRecord(
    case_: ProjectionCase,
    capturedAt: Date,
    marker: 'newer' | 'older',
  ) {
    const permit = await claimPermit(case_);
    return repository.commit({
      permit,
      output: mapTrendTypedRecordsToAuthorizedOutput({
        permit,
        typedRecords: [case_.record(capturedAt, marker)],
        qualityReport: { fixture: case_.name, marker },
      }),
    });
  }

  async function claimPermit(case_: ProjectionCase): Promise<SourcingCollectionPermit> {
    const idempotencyKey = `${case_.name}:${randomUUID()}`;
    const claim = await repository.claimAuthorizedRun({
      organizationId: TEST_ORGANIZATION_ID,
      sourceKey: case_.sourceKey,
      scopeKey: 'projection-ordering',
      targetKey: case_.name,
      idempotencyKey,
      requestHash: sha256(idempotencyKey),
      collectorKey: 'projection-ordering-test',
      collectorVersion: 'v1',
      triggerKind: 'manual',
      triggeredByUserId: TEST_USER_ID,
      leaseDurationMs: 60_000,
    });
    if (claim.kind !== 'claimed') {
      throw new Error(`Expected a claimed ${case_.name} run, received ${claim.kind}`);
    }
    return claim.permit;
  }
});

interface ProjectionCase {
  name: string;
  sourceKey: string;
  newerMarker: string;
  record(capturedAt: Date, marker: 'newer' | 'older'): SourcingTypedCollectionRecord;
  readMarker(prisma: PrismaClient): Promise<string | null>;
}

const projectionCases: ProjectionCase[] = [
  {
    name: 'naver_keyword',
    sourceKey: 'naver.searchad_keyword',
    newerMarker: '91',
    record: (capturedAt, marker) => ({
      kind: 'naver_keyword',
      row: {
        organizationId: TEST_ORGANIZATION_ID,
        keyword: '유아 우산',
        businessDate: BUSINESS_DATE,
        monthlyTotalSearchCount: marker === 'newer' ? 900 : 100,
        monthlyPcSearchCount: 100,
        monthlyMobileSearchCount: 800,
        competitionIndex: '중간',
        averageAdRank: 3,
        trendRatio: marker === 'newer' ? 91 : 11,
        trendDelta: 1,
        capturedAt,
      },
    }),
    readMarker: async (prisma) => (await prisma.naverKeywordDailySnapshot.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, keyword: '유아 우산', businessDate: BUSINESS_DATE },
      select: { trendRatio: true },
    })).trendRatio?.toString() ?? null,
  },
  {
    name: 'naver_popular_keyword',
    sourceKey: 'naver.datalab_popular',
    newerMarker: 'newer',
    record: (capturedAt, marker) => ({
      kind: 'naver_popular_keyword',
      row: {
        organizationId: TEST_ORGANIZATION_ID,
        boardKey: 'kids',
        boardLabel: marker,
        cid: '50000001',
        businessDate: BUSINESS_DATE,
        rank: marker === 'newer' ? 1 : 8,
        keyword: '유아 우산',
        linkId: 'keyword-1',
        capturedAt,
      },
    }),
    readMarker: async (prisma) => (await prisma.naverPopularKeywordDailySnapshot.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        boardKey: 'kids',
        businessDate: BUSINESS_DATE,
        keyword: '유아 우산',
      },
      select: { boardLabel: true },
    })).boardLabel,
  },
  {
    name: 'shorts',
    sourceKey: 'shortstrend.trend',
    newerMarker: 'newer',
    record: (capturedAt, marker) => ({
      kind: 'shorts',
      row: {
        organizationId: TEST_ORGANIZATION_ID,
        businessDate: BUSINESS_DATE,
        videoKey: 'video-1',
        rank: 1,
        title: marker,
        channelName: 'Kids channel',
        viewCount: 100,
        likeCount: 10,
        commentCount: 1,
        keyword: '유아 우산',
        publishedAt: null,
        thumbnailUrl: null,
        videoUrl: 'https://youtube.example/video-1',
        capturedAt,
      },
    }),
    readMarker: async (prisma) => (await prisma.shortsTrendDailySnapshot.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, businessDate: BUSINESS_DATE, videoKey: 'video-1' },
      select: { title: true },
    })).title,
  },
  {
    name: 'tiktok_creative',
    sourceKey: 'tiktok.creative',
    newerMarker: 'newer',
    record: (capturedAt, marker) => ({
      kind: 'tiktok_creative',
      row: {
        organizationId: TEST_ORGANIZATION_ID,
        businessDate: BUSINESS_DATE,
        region: 'KR',
        trendType: 'keyword',
        entityKey: 'kids-umbrella',
        rank: 1,
        label: marker,
        industry: 'kids',
        sourceKeyword: '유아 우산',
        postCount: 10,
        viewCount: 100,
        growthPct: 10,
        thumbnailUrl: null,
        sourceUrl: 'https://tiktok.example/kids-umbrella',
        capturedAt,
      },
    }),
    readMarker: async (prisma) => (await prisma.tiktokCreativeTrendDailySnapshot.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        businessDate: BUSINESS_DATE,
        region: 'KR',
        trendType: 'keyword',
        entityKey: 'kids-umbrella',
      },
      select: { label: true },
    })).label,
  },
  {
    name: 'live_commerce_broadcast',
    sourceKey: 'taobao.live_commerce',
    newerMarker: 'newer',
    record: (capturedAt, marker) => ({
      kind: 'live_commerce_broadcast',
      row: {
        organizationId: TEST_ORGANIZATION_ID,
        businessDate: BUSINESS_DATE,
        source: 'taobao',
        broadcastId: 'broadcast-1',
        title: marker,
        broadcasterId: 'seller-1',
        broadcasterName: 'Kids seller',
        status: 'live',
        viewerCount: 100,
        likeCount: 10,
        startedAt: null,
        endedAt: null,
        coverImageUrl: null,
        sourceUrl: 'https://taobao.example/broadcast-1',
        capturedAt,
      },
    }),
    readMarker: async (prisma) => (await prisma.liveCommerceBroadcastDailySnapshot.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        businessDate: BUSINESS_DATE,
        source: 'taobao',
        broadcastId: 'broadcast-1',
      },
      select: { title: true },
    })).title,
  },
  {
    name: 'live_commerce_product',
    sourceKey: 'taobao.live_commerce',
    newerMarker: 'newer',
    record: (capturedAt, marker) => ({
      kind: 'live_commerce_product',
      row: {
        organizationId: TEST_ORGANIZATION_ID,
        businessDate: BUSINESS_DATE,
        source: 'taobao',
        broadcastId: 'broadcast-1',
        productId: 'product-1',
        rank: 1,
        title: marker,
        priceCny: 12.5,
        salesCount: 10,
        imageUrl: null,
        sourceUrl: 'https://taobao.example/product-1',
        capturedAt,
      },
    }),
    readMarker: async (prisma) => (await prisma.liveCommerceProductDailySnapshot.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        businessDate: BUSINESS_DATE,
        source: 'taobao',
        broadcastId: 'broadcast-1',
        productId: 'product-1',
      },
      select: { title: true },
    })).title,
  },
];

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { kstInclusiveDaysStart } from '../../../../common/kst';
import type { Prisma } from '@prisma/client';
import type {
  NaverKeywordSnapshotRow,
  NaverKeywordSnapshotUpsert,
  NaverPopularKeywordSnapshotRow,
  NaverPopularKeywordSnapshotUpsert,
  Sourcing1688HotProductSnapshotRow,
  Sourcing1688HotProductSnapshotUpsert,
  ShortsSnapshotRow,
  ShortsSnapshotUpsert,
  TrendCollectionRepositoryPort,
  TrendHistoryQuery,
  TrendSeedRow,
  UpdateTrendSeedInput,
  UpsertTrendSeedInput,
} from '../../../application/port/out/repository/trend-collection.repository.port';

const DEFAULT_TREND_SEED_SOURCES = ['naver', 'shorts', '1688'];

// PostgreSQL int4 상한. 유튜브 조회수는 21억을 넘을 수 있어 clamp 하지 않으면
// 배치 $transaction 전체가 'value out of range for type integer' 로 롤백된다.
const INT4_MAX = 2_147_483_647;
function clampInt4(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(Math.trunc(value), INT4_MAX);
}

@Injectable()
export class TrendCollectionRepositoryAdapter implements TrendCollectionRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listSeeds(organizationId: string): Promise<TrendSeedRow[]> {
    const rows = await this.prisma.trendSeedKeyword.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toSeedRow);
  }

  async upsertSeedByKeyword(input: UpsertTrendSeedInput): Promise<TrendSeedRow> {
    const update: Prisma.TrendSeedKeywordUpdateInput = {};
    if (input.keywordCn !== undefined) update.keywordCn = input.keywordCn;
    if (input.sources !== undefined) update.sources = input.sources;

    const row = await this.prisma.trendSeedKeyword.upsert({
      where: {
        organizationId_keyword: {
          organizationId: input.organizationId,
          keyword: input.keyword,
        },
      },
      create: {
        organizationId: input.organizationId,
        keyword: input.keyword,
        keywordCn: input.keywordCn ?? null,
        sources: input.sources ?? DEFAULT_TREND_SEED_SOURCES,
      },
      update,
    });
    return toSeedRow(row);
  }

  async updateSeed(input: UpdateTrendSeedInput): Promise<TrendSeedRow> {
    const data: Prisma.TrendSeedKeywordUpdateManyMutationInput = {};
    if (input.keyword !== undefined) data.keyword = input.keyword;
    if (input.keywordCn !== undefined) data.keywordCn = input.keywordCn;
    if (input.sources !== undefined) data.sources = input.sources;
    if (input.enabled !== undefined) data.enabled = input.enabled;

    const updated = await this.prisma.trendSeedKeyword.updateMany({
      where: { id: input.id, organizationId: input.organizationId },
      data,
    });
    if (updated.count === 0) {
      throw new NotFoundException('트렌드 시드 키워드를 찾을 수 없습니다.');
    }

    const row = await this.prisma.trendSeedKeyword.findFirst({
      where: { id: input.id, organizationId: input.organizationId },
    });
    if (!row) {
      throw new NotFoundException('트렌드 시드 키워드를 찾을 수 없습니다.');
    }
    return toSeedRow(row);
  }

  async deleteSeed(input: { id: string; organizationId: string }): Promise<void> {
    const deleted = await this.prisma.trendSeedKeyword.deleteMany({
      where: { id: input.id, organizationId: input.organizationId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException('트렌드 시드 키워드를 찾을 수 없습니다.');
    }
  }

  async upsertNaverKeywordSnapshots(rows: NaverKeywordSnapshotUpsert[]): Promise<number> {
    if (rows.length === 0) return 0;
    await this.prisma.$transaction(
      rows.map((row) =>
        this.prisma.naverKeywordDailySnapshot.upsert({
          where: {
            organizationId_keyword_businessDate: {
              organizationId: row.organizationId,
              keyword: row.keyword,
              businessDate: row.businessDate,
            },
          },
          create: {
            organizationId: row.organizationId,
            keyword: row.keyword,
            businessDate: row.businessDate,
            monthlyTotalSearchCount: row.monthlyTotalSearchCount,
            monthlyPcSearchCount: row.monthlyPcSearchCount,
            monthlyMobileSearchCount: row.monthlyMobileSearchCount,
            competitionIndex: row.competitionIndex,
            averageAdRank: row.averageAdRank,
            trendRatio: row.trendRatio,
            trendDelta: row.trendDelta,
            capturedAt: row.capturedAt,
          },
          update: {
            monthlyTotalSearchCount: row.monthlyTotalSearchCount,
            monthlyPcSearchCount: row.monthlyPcSearchCount,
            monthlyMobileSearchCount: row.monthlyMobileSearchCount,
            competitionIndex: row.competitionIndex,
            averageAdRank: row.averageAdRank,
            trendRatio: row.trendRatio,
            trendDelta: row.trendDelta,
            capturedAt: row.capturedAt,
          },
        }),
      ),
    );
    return rows.length;
  }

  async replaceNaverPopularKeywordSnapshots(rows: NaverPopularKeywordSnapshotUpsert[]): Promise<number> {
    if (rows.length === 0) return 0;
    const grouped = new Map<string, NaverPopularKeywordSnapshotUpsert[]>();
    for (const row of rows) {
      const key = [
        row.organizationId,
        row.boardKey,
        row.businessDate.toISOString().slice(0, 10),
      ].join(':');
      const scopeRows = grouped.get(key) ?? [];
      scopeRows.push(row);
      grouped.set(key, scopeRows);
    }

    return this.prisma.$transaction(async (tx) => {
      let count = 0;
      for (const [scopeKey, scopeRows] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const { organizationId, boardKey, businessDate } = scopeRows[0];
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${`naver-popular:${scopeKey}`}, 0))::text AS "lock"
          FROM (SELECT ${organizationId}::uuid AS organization_id) AS tenant
          WHERE organization_id = ${organizationId}::uuid
        `;
        const latest = await tx.naverPopularKeywordDailySnapshot.findFirst({
          where: { organizationId, boardKey, businessDate },
          orderBy: { capturedAt: 'desc' },
          select: { capturedAt: true },
        });
        const incomingCapturedAt = scopeRows.reduce(
          (value, row) => (row.capturedAt > value ? row.capturedAt : value),
          scopeRows[0].capturedAt,
        );
        if (latest && latest.capturedAt > incomingCapturedAt) continue;

        await tx.naverPopularKeywordDailySnapshot.deleteMany({
          where: { organizationId, boardKey, businessDate },
        });
        const created = await tx.naverPopularKeywordDailySnapshot.createMany({
          data: scopeRows.map((row) => ({
            organizationId: row.organizationId,
            boardKey: row.boardKey,
            boardLabel: row.boardLabel,
            cid: row.cid,
            businessDate: row.businessDate,
            rank: row.rank,
            keyword: row.keyword,
            linkId: row.linkId,
            capturedAt: row.capturedAt,
          })),
        });
        count += created.count;
      }
      return count;
    });
  }

  async upsert1688HotProductSnapshots(rows: Sourcing1688HotProductSnapshotUpsert[]): Promise<number> {
    if (rows.length === 0) return 0;
    await this.prisma.$transaction(
      rows.map((row) =>
        this.prisma.sourcing1688HotProductDailySnapshot.upsert({
          where: {
            organizationId_businessDate_offerId: {
              organizationId: row.organizationId,
              businessDate: row.businessDate,
              offerId: row.offerId,
            },
          },
          create: {
            organizationId: row.organizationId,
            businessDate: row.businessDate,
            offerId: row.offerId,
            sourceKeyword: row.sourceKeyword,
            rank: row.rank,
            title: row.title,
            priceCny: row.priceCny,
            monthlySales: row.monthlySales,
            repurchaseRate: row.repurchaseRate,
            tradeScore: row.tradeScore,
            supplierName: row.supplierName,
            imageUrl: row.imageUrl,
            sourceUrl: row.sourceUrl,
            capturedAt: row.capturedAt,
          },
          update: {
            sourceKeyword: row.sourceKeyword,
            rank: row.rank,
            title: row.title,
            priceCny: row.priceCny,
            monthlySales: row.monthlySales,
            repurchaseRate: row.repurchaseRate,
            tradeScore: row.tradeScore,
            supplierName: row.supplierName,
            imageUrl: row.imageUrl,
            sourceUrl: row.sourceUrl,
            capturedAt: row.capturedAt,
          },
        }),
      ),
    );
    return rows.length;
  }

  async upsertShortsSnapshots(rows: ShortsSnapshotUpsert[]): Promise<number> {
    if (rows.length === 0) return 0;
    await this.prisma.$transaction(
      rows.map((row) => {
        const viewCount = clampInt4(row.viewCount);
        const likeCount = clampInt4(row.likeCount);
        const commentCount = clampInt4(row.commentCount);
        return this.prisma.shortsTrendDailySnapshot.upsert({
          where: {
            organizationId_businessDate_videoKey: {
              organizationId: row.organizationId,
              businessDate: row.businessDate,
              videoKey: row.videoKey,
            },
          },
          create: {
            organizationId: row.organizationId,
            businessDate: row.businessDate,
            videoKey: row.videoKey,
            rank: row.rank,
            title: row.title,
            channelName: row.channelName,
            viewCount,
            likeCount,
            commentCount,
            keyword: row.keyword,
            publishedAt: row.publishedAt,
            thumbnailUrl: row.thumbnailUrl,
            videoUrl: row.videoUrl,
            capturedAt: row.capturedAt,
          },
          update: {
            rank: row.rank,
            title: row.title,
            channelName: row.channelName,
            viewCount,
            likeCount,
            commentCount,
            keyword: row.keyword,
            publishedAt: row.publishedAt,
            thumbnailUrl: row.thumbnailUrl,
            videoUrl: row.videoUrl,
            capturedAt: row.capturedAt,
          },
        });
      }),
    );
    return rows.length;
  }

  async findNaverKeywordHistory(query: TrendHistoryQuery): Promise<NaverKeywordSnapshotRow[]> {
    const rows = await this.prisma.naverKeywordDailySnapshot.findMany({
      where: {
        organizationId: query.organizationId,
        businessDate: { gte: kstInclusiveDaysStart(query.days) },
      },
      orderBy: [{ keyword: 'asc' }, { businessDate: 'asc' }],
    });
    return rows.map((row) => ({
      keyword: row.keyword,
      businessDate: row.businessDate,
      monthlyTotalSearchCount: row.monthlyTotalSearchCount,
      monthlyPcSearchCount: row.monthlyPcSearchCount,
      monthlyMobileSearchCount: row.monthlyMobileSearchCount,
      competitionIndex: row.competitionIndex,
      averageAdRank: row.averageAdRank,
      trendRatio: row.trendRatio,
      trendDelta: row.trendDelta,
      capturedAt: row.capturedAt,
    }));
  }

  async findPopularKeywordHistory(query: TrendHistoryQuery): Promise<NaverPopularKeywordSnapshotRow[]> {
    const rows = await this.prisma.naverPopularKeywordDailySnapshot.findMany({
      where: {
        organizationId: query.organizationId,
        businessDate: { gte: kstInclusiveDaysStart(query.days) },
      },
      orderBy: [{ boardKey: 'asc' }, { businessDate: 'asc' }, { rank: 'asc' }],
    });
    return rows.map((row) => ({
      boardKey: row.boardKey,
      boardLabel: row.boardLabel,
      cid: row.cid,
      businessDate: row.businessDate,
      rank: row.rank,
      keyword: row.keyword,
      linkId: row.linkId,
    }));
  }

  async find1688HotHistory(query: TrendHistoryQuery): Promise<Sourcing1688HotProductSnapshotRow[]> {
    const rows = await this.prisma.sourcing1688HotProductDailySnapshot.findMany({
      where: {
        organizationId: query.organizationId,
        businessDate: { gte: kstInclusiveDaysStart(query.days) },
      },
      orderBy: [{ businessDate: 'asc' }, { rank: 'asc' }],
    });
    return rows.map((row) => ({
      businessDate: row.businessDate,
      capturedAt: row.capturedAt,
      offerId: row.offerId,
      sourceKeyword: row.sourceKeyword,
      rank: row.rank,
      title: row.title,
      priceCny: row.priceCny == null ? null : Number(row.priceCny),
      monthlySales: row.monthlySales,
      repurchaseRate: row.repurchaseRate,
      tradeScore: row.tradeScore,
      supplierName: row.supplierName,
      imageUrl: row.imageUrl,
      sourceUrl: row.sourceUrl,
    }));
  }

  async findShortsHistory(query: TrendHistoryQuery): Promise<ShortsSnapshotRow[]> {
    const rows = await this.prisma.shortsTrendDailySnapshot.findMany({
      where: {
        organizationId: query.organizationId,
        businessDate: { gte: kstInclusiveDaysStart(query.days) },
      },
      orderBy: [{ businessDate: 'asc' }, { rank: 'asc' }],
    });
    return rows.map((row) => ({
      businessDate: row.businessDate,
      capturedAt: row.capturedAt,
      videoKey: row.videoKey,
      rank: row.rank,
      title: row.title,
      channelName: row.channelName,
      viewCount: row.viewCount,
      likeCount: row.likeCount,
      commentCount: row.commentCount,
      keyword: row.keyword,
      publishedAt: row.publishedAt,
      thumbnailUrl: row.thumbnailUrl,
      videoUrl: row.videoUrl,
    }));
  }
}

function toSeedRow(row: {
  id: string;
  organizationId: string;
  keyword: string;
  keywordCn: string | null;
  sources: string[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}): TrendSeedRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    keyword: row.keyword,
    keywordCn: row.keywordCn,
    sources: row.sources,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

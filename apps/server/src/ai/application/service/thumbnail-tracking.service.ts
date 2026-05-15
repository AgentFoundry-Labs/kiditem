import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { THUMBNAIL_TRACKING_STATUSES, type ThumbnailTrackingListResponse, type ThumbnailTrackingRecord, type ThumbnailTrackingStatus, type UpdateThumbnailTrackingMetrics } from '@kiditem/shared/ai';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  COUPANG_PRODUCT_SALES_SCRAPE_PORT,
  type CoupangProductSalesScrapePort,
} from '../port/out/coupang-product-sales-scrape.port';

type TrackingRow = {
  id: string;
  organizationId: string;
  listingId: string;
  generationId: string;
  originalGrade: string;
  originalScore: number;
  appliedAt: Date;
  status: string;
  ctrBefore: number | null;
  ctrAfter: number | null;
  reviewsBefore: number | null;
  reviewsAfter: number | null;
  salesBefore: number | null;
  salesAfter: number | null;
  listing: { id: string; master: { id: string; name: string } | null } | null;
};

const LISTING_INCLUDE = {
  listing: {
    select: {
      id: true,
      master: { select: { id: true, name: true } },
    },
  },
} as const;

function toRecord(row: TrackingRow, nowMs: number = Date.now()): ThumbnailTrackingRecord {
  const status = (THUMBNAIL_TRACKING_STATUSES as readonly string[]).includes(row.status)
    ? (row.status as ThumbnailTrackingStatus)
    : 'tracking';
  const ctrChange =
    row.ctrBefore != null && row.ctrAfter != null
      ? Math.round((row.ctrAfter - row.ctrBefore) * 10) / 10
      : null;
  return {
    id: row.id,
    productId: row.listing?.master?.id ?? '',
    productName: row.listing?.master?.name ?? '',
    generationId: row.generationId,
    originalGrade: row.originalGrade,
    originalScore: row.originalScore,
    appliedAt: row.appliedAt.toISOString(),
    daysElapsed: Math.floor((nowMs - row.appliedAt.getTime()) / (1000 * 60 * 60 * 24)),
    status,
    ctrBefore: row.ctrBefore,
    ctrAfter: row.ctrAfter,
    ctrChange,
    reviewsBefore: row.reviewsBefore,
    reviewsAfter: row.reviewsAfter,
    salesBefore: row.salesBefore,
    salesAfter: row.salesAfter,
  } satisfies ThumbnailTrackingRecord;
}

export interface DailySnapshotRecord {
  id: string;
  trackingId: string;
  capturedAt: string;
  capturedDate: string;
  unitsSold30d: number | null;
  unitsSold7d: number | null;
  revenueKrw: number | null;
  reviewCount: number | null;
  ratingAvg: number | null;
  scrapeStatus: string;
  errorMessage: string | null;
}

@Injectable()
export class ThumbnailTrackingService {
  private readonly logger = new Logger(ThumbnailTrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(COUPANG_PRODUCT_SALES_SCRAPE_PORT)
    private readonly salesScraper: CoupangProductSalesScrapePort,
  ) {}

  async findAll(
    query: { page?: number; limit?: number; status?: ThumbnailTrackingStatus },
    organizationId: string,
  ): Promise<ThumbnailTrackingListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { organizationId };
    if (query.status) where.status = query.status;

    const [rows, total] = await Promise.all([
      this.prisma.thumbnailTracking.findMany({
        where,
        include: LISTING_INCLUDE,
        orderBy: { appliedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.thumbnailTracking.count({ where }),
    ]);

    const now = Date.now();
    const items = (rows as unknown as TrackingRow[]).map((r) => toRecord(r, now));
    return { items, total, page, limit } satisfies ThumbnailTrackingListResponse;
  }

  async create(input: {
    organizationId: string;
    masterId: string;
    generationId: string;
    originalGrade: string;
    originalScore: number;
  }): Promise<ThumbnailTrackingRecord | null> {
    const listing = await this.prisma.channelListing.findFirst({
      where: { masterId: input.masterId, organizationId: input.organizationId, isDeleted: false },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!listing) {
      this.logger.debug(
        `ThumbnailTracking skip — master ${input.masterId} 에 연결된 ChannelListing 없음`,
      );
      return null;
    }

    const existing = await this.prisma.thumbnailTracking.findFirst({
      where: {
        organizationId: input.organizationId,
        listingId: listing.id,
        generationId: input.generationId,
      },
      include: LISTING_INCLUDE,
    });
    if (existing) return toRecord(existing as unknown as TrackingRow);

    try {
      const row = await this.prisma.thumbnailTracking.create({
        data: {
          organizationId: input.organizationId,
          listingId: listing.id,
          generationId: input.generationId,
          originalGrade: input.originalGrade,
          originalScore: input.originalScore,
        },
        include: LISTING_INCLUDE,
      });
      return toRecord(row as unknown as TrackingRow);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const row = await this.prisma.thumbnailTracking.findFirst({
          where: {
            organizationId: input.organizationId,
            listingId: listing.id,
            generationId: input.generationId,
          },
          include: LISTING_INCLUDE,
        });
        if (row) return toRecord(row as unknown as TrackingRow);
      }
      throw err;
    }
  }

  async updateMetrics(
    id: string,
    input: UpdateThumbnailTrackingMetrics,
    organizationId: string,
  ): Promise<ThumbnailTrackingRecord> {
    const existing = await this.prisma.thumbnailTracking.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException(`ThumbnailTracking ${id} not found`);

    const updateData: Record<string, unknown> = {};
    if (input.ctrBefore !== undefined) updateData.ctrBefore = input.ctrBefore;
    if (input.ctrAfter !== undefined) updateData.ctrAfter = input.ctrAfter;
    if (input.reviewsBefore !== undefined) updateData.reviewsBefore = input.reviewsBefore;
    if (input.reviewsAfter !== undefined) updateData.reviewsAfter = input.reviewsAfter;
    if (input.salesBefore !== undefined) updateData.salesBefore = input.salesBefore;
    if (input.salesAfter !== undefined) updateData.salesAfter = input.salesAfter;
    if (input.status !== undefined) updateData.status = input.status;

    if (
      (input.ctrBefore !== undefined || existing.ctrBefore != null) &&
      (input.ctrAfter !== undefined || existing.ctrAfter != null)
    ) {
      updateData.status = 'measured';
    }

    const result = await this.prisma.thumbnailTracking.updateMany({
      where: { id, organizationId },
      data: updateData,
    });
    if (result.count === 0) throw new NotFoundException(`ThumbnailTracking ${id} not found`);

    const row = await this.prisma.thumbnailTracking.findFirst({
      where: { id, organizationId },
      include: LISTING_INCLUDE,
    });
    if (!row) throw new NotFoundException(`ThumbnailTracking ${id} not found`);
    return toRecord(row as unknown as TrackingRow);
  }

  /**
   * 시계열 매출 snapshot 1일치 수집.
   *
   * 동작:
   *  1. tracking row 에서 productName 결정 (master.name 또는 listing.channelName 우선).
   *  2. playwriter adapter 가 Wing vendor-inventory 검색 → 일치 row 의 셀 추출.
   *  3. `(trackingId, capturedDate)` 가 이미 있으면 upsert (업데이트 후 최신값 반영).
   *  4. 첫 snapshot 이고 `salesBefore` null 이면 그 값으로 채워 baseline 설정.
   *
   * 호출 주체:
   *  - HTTP 트리거 (`POST /api/thumbnail-tracking/:id/collect`) — 수동 실행 / 디버깅
   *  - 추후 cron — 매일 한 번 active tracking 들 순회
   */
  async collectDailySnapshot(
    trackingId: string,
    organizationId: string,
  ): Promise<DailySnapshotRecord> {
    const tracking = await this.prisma.thumbnailTracking.findFirst({
      where: { id: trackingId, organizationId },
      include: {
        listing: {
          select: {
            channelName: true,
            master: { select: { name: true } },
          },
        },
      },
    });
    if (!tracking) {
      throw new NotFoundException(`ThumbnailTracking ${trackingId} not found`);
    }

    const productName =
      tracking.listing?.channelName?.trim() ||
      tracking.listing?.master?.name?.trim() ||
      '';
    if (!productName) {
      throw new NotFoundException(
        `ThumbnailTracking ${trackingId} 에 productName 을 결정할 수 없습니다 (master/listing 둘 다 비어있음).`,
      );
    }

    const today = startOfTodayUtc();

    let scrapeStatus: 'ok' | 'not_found' | 'error' = 'ok';
    let errorMessage: string | null = null;
    let unitsSold30d: number | null = null;
    let unitsSold7d: number | null = null;
    let revenueKrw: number | null = null;
    let reviewCount: number | null = null;
    let ratingAvg: number | null = null;
    let rawCellTexts: string[] = [];

    try {
      const result = await this.salesScraper.scrapeByProductName(productName);
      if (result.error) {
        scrapeStatus = 'error';
        errorMessage = result.error;
      } else if (!result.found || !result.row) {
        scrapeStatus = 'not_found';
        errorMessage = `상품을 Wing 에서 찾지 못함: "${productName}"`;
      } else {
        unitsSold30d = result.row.unitsSold30d;
        unitsSold7d = result.row.unitsSold7d;
        revenueKrw = result.row.revenueKrw;
        reviewCount = result.row.reviewCount;
        ratingAvg = result.row.ratingAvg;
        rawCellTexts = result.row.rawCellTexts;
      }
    } catch (err) {
      scrapeStatus = 'error';
      errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.warn(`sales scrape error tracking=${trackingId}: ${errorMessage}`);
    }

    const upserted = await this.prisma.thumbnailTrackingDailySnapshot.upsert({
      where: {
        trackingId_capturedDate: { trackingId, capturedDate: today },
      },
      create: {
        organizationId,
        trackingId,
        capturedDate: today,
        unitsSold30d,
        unitsSold7d,
        revenueKrw,
        reviewCount,
        ratingAvg,
        rawCellTexts: rawCellTexts as unknown as Prisma.InputJsonValue,
        scrapeStatus,
        errorMessage,
      },
      update: {
        unitsSold30d,
        unitsSold7d,
        revenueKrw,
        reviewCount,
        ratingAvg,
        rawCellTexts: rawCellTexts as unknown as Prisma.InputJsonValue,
        scrapeStatus,
        errorMessage,
        capturedAt: new Date(),
      },
    });

    // baseline (`salesBefore`) — 첫 성공 snapshot 의 30일 판매량을 사용
    if (
      scrapeStatus === 'ok' &&
      unitsSold30d !== null &&
      tracking.salesBefore == null
    ) {
      await this.prisma.thumbnailTracking.updateMany({
        where: { id: trackingId, organizationId },
        data: { salesBefore: unitsSold30d },
      });
    }

    return {
      id: upserted.id,
      trackingId: upserted.trackingId,
      capturedAt: upserted.capturedAt.toISOString(),
      capturedDate: upserted.capturedDate.toISOString().slice(0, 10),
      unitsSold30d: upserted.unitsSold30d,
      unitsSold7d: upserted.unitsSold7d,
      revenueKrw: upserted.revenueKrw,
      reviewCount: upserted.reviewCount,
      ratingAvg: upserted.ratingAvg,
      scrapeStatus: upserted.scrapeStatus,
      errorMessage: upserted.errorMessage,
    };
  }

  /** 한 tracking 의 모든 daily snapshot — 차트용 시계열 데이터. */
  async listSnapshots(
    trackingId: string,
    organizationId: string,
  ): Promise<DailySnapshotRecord[]> {
    const exists = await this.prisma.thumbnailTracking.findFirst({
      where: { id: trackingId, organizationId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`ThumbnailTracking ${trackingId} not found`);

    const rows = await this.prisma.thumbnailTrackingDailySnapshot.findMany({
      where: { trackingId, organizationId },
      orderBy: { capturedDate: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      trackingId: row.trackingId,
      capturedAt: row.capturedAt.toISOString(),
      capturedDate: row.capturedDate.toISOString().slice(0, 10),
      unitsSold30d: row.unitsSold30d,
      unitsSold7d: row.unitsSold7d,
      revenueKrw: row.revenueKrw,
      reviewCount: row.reviewCount,
      ratingAvg: row.ratingAvg,
      scrapeStatus: row.scrapeStatus,
      errorMessage: row.errorMessage,
    }));
  }

  /**
   * 현재 active tracking 들 (appliedAt 으로부터 30일 미경과) 모두 순회하며
   * snapshot 수집. cron / 수동 일일 trigger 에서 호출.
   */
  async collectAllActiveSnapshots(
    organizationId: string,
  ): Promise<{ collected: number; failed: number }> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const trackings = await this.prisma.thumbnailTracking.findMany({
      where: { organizationId, appliedAt: { gte: cutoff } },
      select: { id: true },
    });

    let collected = 0;
    let failed = 0;
    for (const t of trackings) {
      try {
        const snap = await this.collectDailySnapshot(t.id, organizationId);
        if (snap.scrapeStatus === 'ok') collected += 1;
        else failed += 1;
      } catch (err) {
        failed += 1;
        this.logger.warn(
          `daily snapshot failed tracking=${t.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return { collected, failed };
  }
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

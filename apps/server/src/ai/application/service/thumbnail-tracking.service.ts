import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  THUMBNAIL_TRACKING_STATUSES,
  type ThumbnailTrackingListResponse,
  type ThumbnailTrackingRecord,
  type ThumbnailTrackingStatus,
  type UpdateThumbnailTrackingMetrics,
} from '@kiditem/shared/ai';
import {
  COUPANG_PRODUCT_SALES_SCRAPE_PORT,
  type CoupangProductSalesScrapePort,
} from '../port/out/provider/coupang-product-sales-scrape.port';
import {
  THUMBNAIL_TRACKING_REPOSITORY_PORT,
  type ThumbnailTrackingRepositoryPort,
  type ThumbnailTrackingRow,
  type ThumbnailTrackingSnapshotRow,
} from '../port/out/repository/thumbnail-tracking.repository.port';

function toRecord(row: ThumbnailTrackingRow, nowMs: number = Date.now()): ThumbnailTrackingRecord {
  const status = (THUMBNAIL_TRACKING_STATUSES as readonly string[]).includes(row.status)
    ? (row.status as ThumbnailTrackingStatus)
    : 'tracking';
  const ctrChange =
    row.ctrBefore != null && row.ctrAfter != null ? Math.round((row.ctrAfter - row.ctrBefore) * 10) / 10 : null;
  return {
    id: row.id,
    channelListingId: row.listing.id,
    productName: row.listing.displayName ?? row.listing.channelName ?? row.listing.externalId,
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

function toSnapshotRecord(row: ThumbnailTrackingSnapshotRow): DailySnapshotRecord {
  return {
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
  };
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
    @Inject(THUMBNAIL_TRACKING_REPOSITORY_PORT)
    private readonly repository: ThumbnailTrackingRepositoryPort,
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

    const [rows, total] = await Promise.all([
      this.repository.findTrackings({ status: query.status, skip, take: limit }, organizationId),
      this.repository.countTrackings({ status: query.status }, organizationId),
    ]);

    const now = Date.now();
    const items = rows.map((r) => toRecord(r, now));
    return {
      items,
      total,
      page,
      limit,
    } satisfies ThumbnailTrackingListResponse;
  }

  async create(input: {
    organizationId: string;
    contentWorkspaceId: string;
    generationId: string;
    originalGrade: string;
    originalScore: number;
  }): Promise<ThumbnailTrackingRecord | null> {
    const listing = await this.repository.findChannelListingForWorkspace(
      input.contentWorkspaceId,
      input.organizationId,
    );
    if (!listing) {
      this.logger.debug(`ThumbnailTracking skip — workspace ${input.contentWorkspaceId} 에 연결된 ChannelListing 없음`);
      return null;
    }

    const result = await this.repository.createTracking({
      organizationId: input.organizationId,
      listingId: listing.id,
      generationId: input.generationId,
      originalGrade: input.originalGrade,
      originalScore: input.originalScore,
    });
    return result.row ? toRecord(result.row) : null;
  }

  async updateMetrics(
    id: string,
    input: UpdateThumbnailTrackingMetrics,
    organizationId: string,
  ): Promise<ThumbnailTrackingRecord> {
    const row = await this.repository.updateMetrics({
      id,
      organizationId,
      metrics: input,
    });
    if (!row) throw new NotFoundException(`ThumbnailTracking ${id} not found`);
    return toRecord(row);
  }

  /**
   * 시계열 매출 snapshot 1일치 수집.
   *
   * 동작:
   *  1. tracking row 에서 productName 결정 (listing.channelName/displayName 우선).
   *  2. playwriter adapter 가 Wing vendor-inventory 검색 → 일치 row 의 셀 추출.
   *  3. `(trackingId, capturedDate)` 가 이미 있으면 upsert (업데이트 후 최신값 반영).
   *  4. 첫 snapshot 이고 `salesBefore` null 이면 그 값으로 채워 baseline 설정.
   *
   * 호출 주체:
   *  - HTTP 트리거 (`POST /api/thumbnail-tracking/:id/collect`) — 수동 실행 / 디버깅
   *  - 추후 cron — 매일 한 번 active tracking 들 순회
   */
  async collectDailySnapshot(trackingId: string, organizationId: string): Promise<DailySnapshotRecord> {
    const tracking = await this.repository.findTrackingForSnapshot(trackingId, organizationId);
    if (!tracking) {
      throw new NotFoundException(`ThumbnailTracking ${trackingId} not found`);
    }

    const productName =
      tracking.listing?.channelName?.trim() ||
      tracking.listing?.displayName?.trim() ||
      tracking.listing?.externalId?.trim() ||
      '';
    if (!productName) {
      throw new NotFoundException(`ThumbnailTracking ${trackingId} 에 productName 을 결정할 수 없습니다.`);
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

    const upserted = await this.repository.upsertDailySnapshot({
      organizationId,
      trackingId,
      capturedDate: today,
      unitsSold30d,
      unitsSold7d,
      revenueKrw,
      reviewCount,
      ratingAvg,
      rawCellTexts,
      scrapeStatus,
      errorMessage,
      setSalesBefore: scrapeStatus === 'ok' && unitsSold30d !== null && tracking.salesBefore == null,
    });

    return toSnapshotRecord(upserted);
  }

  /** 한 tracking 의 모든 daily snapshot — 차트용 시계열 데이터. */
  async listSnapshots(trackingId: string, organizationId: string): Promise<DailySnapshotRecord[]> {
    const exists = await this.repository.findTrackingForSnapshot(trackingId, organizationId);
    if (!exists) throw new NotFoundException(`ThumbnailTracking ${trackingId} not found`);

    const rows = await this.repository.listSnapshots(trackingId, organizationId);
    return rows.map(toSnapshotRecord);
  }

  /**
   * 현재 active tracking 들 (appliedAt 으로부터 30일 미경과) 모두 순회하며
   * snapshot 수집. cron / 수동 일일 trigger 에서 호출.
   */
  async collectAllActiveSnapshots(organizationId: string): Promise<{ collected: number; failed: number }> {
    const trackings = await this.repository.findActiveTrackings(organizationId);

    let collected = 0;
    let failed = 0;
    for (const t of trackings) {
      try {
        const snap = await this.collectDailySnapshot(t.id, organizationId);
        if (snap.scrapeStatus === 'ok') collected += 1;
        else failed += 1;
      } catch (err) {
        failed += 1;
        this.logger.warn(`daily snapshot failed tracking=${t.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return { collected, failed };
  }
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

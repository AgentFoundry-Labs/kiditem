// apps/server/src/orders/services/review-ingest.service.ts
import { Injectable, Logger } from '@nestjs/common';
import type {
  ReviewIngestItem,
  ReviewIngestRequest,
  ReviewIngestResponse,
} from '@kiditem/shared/reviews';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 확장이 크롤링해 보낸 채널 상품평 원본을 `reviews` 에 적재한다.
 *
 * - 쿠팡은 Open API 로 판매자 상품평을 주지 않는다. 확장이 Wing 상품평 화면
 *   (`POST /tenants/cs/product/review/search`, 세션 쿠키)을 크롤링해 넘긴다.
 * - `(organizationId, platform, externalReviewId)` upsert 라 재수집/기간 중복
 *   조회는 멱등하다. 별점·본문 수정분은 그대로 덮어쓴다.
 * - `externalOptionId`(쿠팡 vendorItemId = 옵션ID) → `ChannelListingOption` 으로
 *   listing 을 연결한다. 카탈로그에 없는 옵션이면 `listingId` 는 null 로 남기고
 *   `unlinked` 로 보고한다. 리뷰 자체는 버리지 않는다.
 */
@Injectable()
export class ReviewIngestService {
  private readonly logger = new Logger(ReviewIngestService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ingest(
    organizationId: string,
    request: ReviewIngestRequest,
  ): Promise<ReviewIngestResponse> {
    const platform = request.platform;
    const items = dedupeByExternalReviewId(request.items);

    const listingByOptionId = await this.resolveListingIds(
      organizationId,
      items,
    );
    const existingIds = await this.existingExternalReviewIds(
      organizationId,
      platform,
      items,
    );

    let linked = 0;
    const operations = items.map((item) => {
      const listingId = item.externalOptionId
        ? (listingByOptionId.get(item.externalOptionId) ?? null)
        : null;
      if (listingId) linked += 1;

      const writable = {
        listingId,
        rating: item.rating,
        title: item.title,
        content: item.content,
        reviewerName: item.reviewerName,
        externalOptionId: item.externalOptionId,
        externalProductId: item.externalProductId,
        itemName: item.itemName,
        imageCount: item.imageCount,
        videoCount: item.videoCount,
        isDeleted: item.isDeleted,
        isBlinded: item.isBlinded,
        reviewedAt: new Date(item.reviewedAt),
      };

      return this.prisma.review.upsert({
        where: {
          organizationId_platform_externalReviewId: {
            organizationId,
            platform,
            externalReviewId: item.externalReviewId,
          },
        },
        create: {
          organizationId,
          platform,
          externalReviewId: item.externalReviewId,
          ...writable,
        },
        update: writable,
      });
    });

    await this.prisma.$transaction(operations);

    const updated = items.filter((item) =>
      existingIds.has(item.externalReviewId),
    ).length;
    const response = {
      received: items.length,
      created: items.length - updated,
      updated,
      linked,
      unlinked: items.length - linked,
    } satisfies ReviewIngestResponse;

    this.logger.log(
      `[${platform}] review ingest org=${organizationId} received=${response.received} created=${response.created} updated=${response.updated} unlinked=${response.unlinked}`,
    );
    return response;
  }

  /** vendorItemId → listingId. 같은 옵션이 여러 listing 에 걸리면 가장 먼저 만든 쪽을 쓴다. */
  private async resolveListingIds(
    organizationId: string,
    items: ReadonlyArray<ReviewIngestItem>,
  ): Promise<Map<string, string>> {
    const optionIds = [
      ...new Set(
        items
          .map((item) => item.externalOptionId)
          .filter((value): value is string => !!value),
      ),
    ];
    if (optionIds.length === 0) return new Map();

    const rows = await this.prisma.channelListingOption.findMany({
      where: { organizationId, externalOptionId: { in: optionIds } },
      select: { externalOptionId: true, listingId: true },
      orderBy: { createdAt: 'asc' },
    });
    const map = new Map<string, string>();
    for (const row of rows) {
      if (map.has(row.externalOptionId)) continue;
      map.set(row.externalOptionId, row.listingId);
    }
    return map;
  }

  private async existingExternalReviewIds(
    organizationId: string,
    platform: string,
    items: ReadonlyArray<ReviewIngestItem>,
  ): Promise<Set<string>> {
    const rows = await this.prisma.review.findMany({
      where: {
        organizationId,
        platform,
        externalReviewId: { in: items.map((item) => item.externalReviewId) },
      },
      select: { externalReviewId: true },
    });
    return new Set(
      rows
        .map((row) => row.externalReviewId)
        .filter((value): value is string => !!value),
    );
  }
}

/**
 * 같은 배치에 동일 리뷰가 두 번 오면 `$transaction` 안의 upsert 가 서로 충돌한다
 * (같은 트랜잭션에서 방금 만든 행을 다시 create 하려다 unique 위반). 마지막 값을 남긴다.
 */
function dedupeByExternalReviewId(
  items: ReadonlyArray<ReviewIngestItem>,
): ReviewIngestItem[] {
  const byId = new Map<string, ReviewIngestItem>();
  for (const item of items) byId.set(item.externalReviewId, item);
  return [...byId.values()];
}

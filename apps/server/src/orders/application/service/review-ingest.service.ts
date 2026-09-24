// apps/server/src/orders/application/service/review-ingest.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ReviewIngestItem,
  ReviewIngestRequest,
  ReviewIngestResponse,
} from '@kiditem/shared/reviews';
import { PrismaService } from '../../../prisma/prisma.service';
import { ownerTransaction } from '../../../prisma/owner-transaction';
import {
  CHANNEL_LISTING_QUERY_PORT,
  type ChannelListingQueryPort,
} from '../../../channels/application/port/in/listing/channel-listing-query.port';

/**
 * 확장이 정규화한 채널 상품평을 Review facts에 적재한다.
 *
 * - 쿠팡은 Open API 로 판매자 상품평을 주지 않는다. 확장이 Wing 상품평 화면
 *   (`POST /tenants/cs/product/review/search`, 세션 쿠키)을 크롤링해 넘긴다.
 * - Owner attempts pass a SourceImportRun id, so facts are generation-tagged and
 *   re-collection within one attempt remains idempotent. The owner terminal
 *   transaction only advances SourceImportRun metadata; it never rewrites a
 *   prior complete generation.
 * - `externalOptionId`(쿠팡 vendorItemId = 옵션ID) → Channels 공개 조회로
 *   listing 을 연결한다. 일치 후보가 없거나 여러 listing/account 에 있으면
 *   `listingId` 는 null 로 남긴다. 리뷰 자체는 버리지 않는다.
 */
@Injectable()
export class ReviewIngestService {
  private readonly logger = new Logger(ReviewIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNEL_LISTING_QUERY_PORT)
    private readonly channelListings: ChannelListingQueryPort,
  ) {}

  async ingest(
    organizationId: string,
    request: ReviewIngestRequest,
  ): Promise<ReviewIngestResponse> {
    return this.prisma.$transaction((tx) =>
      this.ingestInTransaction(tx, organizationId, request),
    );
  }

  /**
   * Stage a normalized generation-tagged fact through a caller-owned
   * transaction. This is deliberately separate from terminal publication:
   * the source owner later finalizes only its SourceImportRun metadata.
   */
  async stageInTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string,
    sourceImportRunId: string,
    request: ReviewIngestRequest,
  ): Promise<ReviewIngestResponse> {
    return this.ingestInTransaction(tx, organizationId, request, sourceImportRunId);
  }

  /**
   * Write through a caller-owned transaction. Calls without a source run are
   * retained for the focused legacy service characterization tests; the HTTP
   * owner path always uses stageInTransaction with a fence.
   */
  async ingestInTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string,
    request: ReviewIngestRequest,
    sourceImportRunId?: string,
  ): Promise<ReviewIngestResponse> {
    const platform = request.platform;
    const items = dedupeByExternalReviewId(request.items);

    const listingByOptionId = await this.resolveListingIds(
      tx,
      organizationId,
      platform,
      items,
    );
    const existingIds = await this.existingExternalReviewIds(
      tx,
      organizationId,
      platform,
      items,
      sourceImportRunId,
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

      const existingId = existingIds.get(item.externalReviewId);
      if (sourceImportRunId) {
        if (existingId) {
          return tx.review.update({ where: { id: existingId }, data: writable });
        }
        return tx.review.create({
          data: {
            organizationId,
            sourceImportRunId,
            platform,
            externalReviewId: item.externalReviewId,
            ...writable,
          },
        });
      }
      return tx.review.upsert({
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

    await Promise.all(operations);

    const updated = items.filter((item) => existingIds.has(item.externalReviewId)).length;
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

  /** vendorItemId → listingId, only when exactly one scoped catalog candidate exists. */
  private async resolveListingIds(
    client: Prisma.TransactionClient,
    organizationId: string,
    platform: string,
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

    const candidates = await this.channelListings.readOptionCandidates(
      ownerTransaction(client),
      { organizationId, channel: platform, externalOptionIds: optionIds },
    );
    const candidatesByExternalId = new Map<string, typeof candidates>();
    for (const candidate of candidates) {
      const matches = candidatesByExternalId.get(candidate.externalOptionId) ?? [];
      matches.push(candidate);
      candidatesByExternalId.set(candidate.externalOptionId, matches);
    }
    const map = new Map<string, string>();
    for (const [externalOptionId, matches] of candidatesByExternalId) {
      if (matches.length === 1) map.set(externalOptionId, matches[0]!.listingId);
    }
    return map;
  }

  private async existingExternalReviewIds(
    client: Prisma.TransactionClient,
    organizationId: string,
    platform: string,
    items: ReadonlyArray<ReviewIngestItem>,
    sourceImportRunId?: string,
  ): Promise<Map<string, string>> {
    const rows = await client.review.findMany({
      where: {
        organizationId,
        ...(sourceImportRunId ? { sourceImportRunId } : { sourceImportRunId: null }),
        platform,
        externalReviewId: { in: items.map((item) => item.externalReviewId) },
      },
      select: { id: true, externalReviewId: true },
    });
    return new Map(
      rows
        .filter((row): row is { id: string; externalReviewId: string } => !!row.externalReviewId)
        .map((row) => [row.externalReviewId, row.id]),
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

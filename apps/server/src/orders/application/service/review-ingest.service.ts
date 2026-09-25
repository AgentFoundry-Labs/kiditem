// apps/server/src/orders/application/service/review-ingest.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import type { ReviewIngestItem } from '@kiditem/shared/reviews';
import { PrismaService } from '../../../prisma/prisma.service';
import { ownerTransaction, ownerTransactionClient } from '../../../prisma/owner-transaction';
import type { OwnerTransaction } from '../../../common/owner-transaction';
import {
  CHANNEL_ACCOUNT_PORT,
  type ChannelAccountPort,
} from '../../../channels/application/port/in/account/channel-account.port';
import {
  CHANNEL_LISTING_QUERY_PORT,
  type ChannelListingQueryPort,
} from '../../../channels/application/port/in/listing/channel-listing-query.port';

/** 한 문장으로 쓰는 리뷰 수. 72k건(36개월 × 40쪽 × 50건)이면 73문장. */
const PUBLISH_BATCH = 1_000;
const REVIEW_PLATFORM = 'coupang';

export interface ReviewPublication {
  inserted: number;
  updated: number;
  linked: number;
  unlinked: number;
}

/**
 * 확장이 정규화한 쿠팡 상품평을 Review 원장에 쓴다(실행 kind `orders.coupang_reviews`의 finalize).
 *
 * - 쿠팡은 Open API로 판매자 상품평을 주지 않는다. 확장이 Wing 상품평 화면
 *   (`POST /tenants/cs/product/review/search`, 세션 쿠키)을 읽어 실행 청크로 넘긴다.
 * - 리뷰당 operation 행은 하나다(`reviews_org_platform_external_operation_key`). 새 리뷰는 넣고, 있던 리뷰는
 *   내용과 `operationId`·`publishedAt`을 이번 실행으로 갱신한다. 옛 SourceImportRun 행은 건드리지 않는다.
 * - `externalOptionId`(쿠팡 vendorItemId = 옵션ID) → Channels 공개 조회로 listing을 연결한다. 후보가 없거나
 *   여러 listing/account에 있으면 `listingId`는 null로 남긴다. 리뷰 자체는 버리지 않는다.
 */
@Injectable()
export class ReviewIngestService {
  private readonly logger = new Logger(ReviewIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNEL_LISTING_QUERY_PORT)
    private readonly channelListings: ChannelListingQueryPort,
    @Inject(CHANNEL_ACCOUNT_PORT)
    private readonly channelAccounts: ChannelAccountPort,
  ) {}

  /** 상품평은 조직의 활성 쿠팡(Wing) 계정으로만 모은다. 아니면 VALIDATION_FAILED. */
  async assertCoupangAccount(organizationId: string, channelAccountId: string): Promise<void> {
    const [account] = await this.channelAccounts.findByIds(ownerTransaction(this.prisma), {
      organizationId,
      accountIds: [channelAccountId],
    });
    if (!account || account.channel !== REVIEW_PLATFORM || account.status !== 'active') {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'coupang_account_required' } });
    }
  }

  /**
   * 호출자(실행 finish) 트랜잭션 안에서 리뷰를 1,000건씩 한 문장으로 upsert한다.
   * `items`는 externalReviewId가 겹치지 않아야 한다(한 문장 안의 ON CONFLICT는 같은 키를 두 번 못 고친다).
   */
  async publishOperation(
    transaction: OwnerTransaction,
    input: { organizationId: string; operationId: string; publishedAt: Date; items: readonly ReviewIngestItem[] },
  ): Promise<ReviewPublication> {
    const tx = ownerTransactionClient(transaction);
    const listingByOptionId = await this.resolveListingIds(transaction, input.organizationId, input.items);
    const publication: ReviewPublication = { inserted: 0, updated: 0, linked: 0, unlinked: 0 };
    for (let offset = 0; offset < input.items.length; offset += PUBLISH_BATCH) {
      const rows = input.items.slice(offset, offset + PUBLISH_BATCH).map((item) => {
        const listingId = item.externalOptionId ? (listingByOptionId.get(item.externalOptionId) ?? null) : null;
        if (listingId) publication.linked += 1;
        else publication.unlinked += 1;
        return {
          external_review_id: item.externalReviewId,
          listing_id: listingId,
          rating: item.rating,
          title: item.title,
          content: item.content,
          reviewer_name: item.reviewerName,
          external_option_id: item.externalOptionId,
          external_product_id: item.externalProductId,
          item_name: item.itemName,
          image_count: item.imageCount,
          video_count: item.videoCount,
          is_deleted: item.isDeleted,
          is_blinded: item.isBlinded,
          reviewed_at: new Date(item.reviewedAt).toISOString(),
        };
      });
      const written = await tx.$queryRaw<Array<{ inserted: boolean }>>(Prisma.sql`
        INSERT INTO reviews (
          id, organization_id, operation_id, published_at, source_import_run_id, platform,
          external_review_id, listing_id, rating, title, content, reviewer_name,
          external_option_id, external_product_id, item_name, image_count, video_count,
          is_deleted, is_blinded, reviewed_at, created_at, updated_at
        )
        SELECT gen_random_uuid(), ${input.organizationId}::uuid, ${input.operationId}::uuid, ${input.publishedAt}, NULL,
               ${REVIEW_PLATFORM}, v.external_review_id, v.listing_id, v.rating, v.title, v.content, v.reviewer_name,
               v.external_option_id, v.external_product_id, v.item_name, v.image_count, v.video_count,
               v.is_deleted, v.is_blinded, v.reviewed_at, ${input.publishedAt}, ${input.publishedAt}
        FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS v(
          external_review_id text, listing_id uuid, rating int, title text, content text, reviewer_name text,
          external_option_id text, external_product_id text, item_name text, image_count int, video_count int,
          is_deleted boolean, is_blinded boolean, reviewed_at timestamptz
        )
        ON CONFLICT (organization_id, platform, external_review_id) WHERE operation_id IS NOT NULL
        DO UPDATE SET
          operation_id = EXCLUDED.operation_id,
          published_at = EXCLUDED.published_at,
          listing_id = EXCLUDED.listing_id,
          rating = EXCLUDED.rating,
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          reviewer_name = EXCLUDED.reviewer_name,
          external_option_id = EXCLUDED.external_option_id,
          external_product_id = EXCLUDED.external_product_id,
          item_name = EXCLUDED.item_name,
          image_count = EXCLUDED.image_count,
          video_count = EXCLUDED.video_count,
          is_deleted = EXCLUDED.is_deleted,
          is_blinded = EXCLUDED.is_blinded,
          reviewed_at = EXCLUDED.reviewed_at,
          updated_at = EXCLUDED.updated_at
        RETURNING (xmax = 0) AS inserted
      `);
      for (const row of written) {
        if (row.inserted) publication.inserted += 1;
        else publication.updated += 1;
      }
    }
    this.logger.log(
      `[coupang] review publication org=${input.organizationId} operation=${input.operationId} inserted=${publication.inserted} updated=${publication.updated} unlinked=${publication.unlinked}`,
    );
    return publication;
  }

  /** vendorItemId → listingId, only when exactly one scoped catalog candidate exists. */
  private async resolveListingIds(
    transaction: OwnerTransaction,
    organizationId: string,
    items: ReadonlyArray<ReviewIngestItem>,
  ): Promise<Map<string, string>> {
    const optionIds = [...new Set(items.map((item) => item.externalOptionId).filter((value): value is string => !!value))];
    const candidatesByExternalId = new Map<string, number>();
    const listingByExternalId = new Map<string, string>();
    for (let offset = 0; offset < optionIds.length; offset += PUBLISH_BATCH) {
      const candidates = await this.channelListings.readOptionCandidates(transaction, {
        organizationId,
        channel: REVIEW_PLATFORM,
        externalOptionIds: optionIds.slice(offset, offset + PUBLISH_BATCH),
      });
      for (const candidate of candidates) {
        candidatesByExternalId.set(candidate.externalOptionId, (candidatesByExternalId.get(candidate.externalOptionId) ?? 0) + 1);
        listingByExternalId.set(candidate.externalOptionId, candidate.listingId);
      }
    }
    const map = new Map<string, string>();
    for (const [externalOptionId, count] of candidatesByExternalId) {
      if (count === 1) map.set(externalOptionId, listingByExternalId.get(externalOptionId)!);
    }
    return map;
  }
}

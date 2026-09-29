import type { OwnerTransaction } from '../../../../../common/owner-transaction';

/**
 * Orders가 다른 owner(analytics 대시보드)에 내주는 리뷰 사실 incoming port(ADR-0021, KID-392).
 * 리뷰 원장 리더는 Orders `adapter/out/persistence/` 안에 있고, 소비자는 이 포트만 주입한다.
 */
export const REVIEW_FACTS_PORT = Symbol('REVIEW_FACTS_PORT');

export type CurrentReviewListingStats = Readonly<{ listingId: string; totalReviews: number; avgRating: number }>;

export interface ReviewFactsPort {
  /** 리스팅별 현재 리뷰 수·평균 평점. 요청한 리스팅에 리뷰가 없으면 목록에 없다(0이 아니라 없음). */
  readCurrentReviewListingStats(
    transaction: OwnerTransaction,
    input: Readonly<{ organizationId: string; listingIds: readonly string[] }>,
  ): Promise<CurrentReviewListingStats[]>;
}

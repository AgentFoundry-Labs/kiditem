import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { ReviewFactsPort } from '../../in/facts/review-facts.port';

/**
 * Orders' own review reads (KID-392): the listing stats other owners get
 * through `REVIEW_FACTS_PORT`, plus the aggregates, counts and review items
 * the Reviews screen reads. Implemented by the persistence adapter behind
 * `REVIEW_FACTS_PORT`, in the caller's transaction.
 */
export const REVIEW_READ_REPOSITORY_PORT = Symbol('REVIEW_READ_REPOSITORY_PORT');

export interface CurrentReviewItemFact {
  id: string;
  platform: string;
  listingId: string | null;
  itemName: string | null;
  externalOptionId: string | null;
  externalProductId: string | null;
  rating: number;
  title: string | null;
  content: string | null;
  reviewerName: string | null;
  reviewedAt: Date;
  imageCount: number;
  videoCount: number;
}

export interface CurrentReviewListingAggregate {
  listingId: string;
  totalReviews: number;
  avgRating: number;
  lastReviewAt: Date | null;
}

export interface CurrentReviewItemFilter {
  listingId?: string;
  rating?: number;
  hasContent?: boolean;
  search?: string;
}

type OrganizationScope = Readonly<{ organizationId: string }>;
type FilteredReviews = Readonly<{ organizationId: string; filter: CurrentReviewItemFilter }>;

export interface ReviewReadRepositoryPort extends ReviewFactsPort {
  readCurrentReviewListingAggregates(transaction: OwnerTransaction, input: OrganizationScope): Promise<CurrentReviewListingAggregate[]>;
  readCurrentReviewRecentCounts(
    transaction: OwnerTransaction,
    input: Readonly<{ organizationId: string; listingIds: readonly string[]; since: Date }>,
  ): Promise<Array<{ listingId: string; count: number }>>;
  readCurrentReviewItemCount(transaction: OwnerTransaction, input: FilteredReviews): Promise<number>;
  readCurrentReviewContentCount(transaction: OwnerTransaction, input: FilteredReviews): Promise<number>;
  readCurrentReviewRatingCounts(transaction: OwnerTransaction, input: FilteredReviews): Promise<Array<{ rating: number; count: number }>>;
  readCurrentReviewItems(
    transaction: OwnerTransaction,
    input: Readonly<{ organizationId: string; filter: CurrentReviewItemFilter; page: number; limit: number }>,
  ): Promise<CurrentReviewItemFact[]>;
}

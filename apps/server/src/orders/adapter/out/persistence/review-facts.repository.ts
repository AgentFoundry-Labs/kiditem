import { Injectable } from '@nestjs/common';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import type { CurrentReviewListingStats, ReviewFactsPort } from '../../../application/port/in/facts/review-facts.port';
import { readCurrentReviewListingStats } from './read/review-facts.reader';

/** `REVIEW_FACTS_PORT` 구현(KID-392). 호출자의 `OwnerTransaction`을 풀어 리뷰 원장 리더를 돌린다. */
@Injectable()
export class ReviewFactsRepository implements ReviewFactsPort {
  readCurrentReviewListingStats(
    transaction: OwnerTransaction,
    input: Readonly<{ organizationId: string; listingIds: readonly string[] }>,
  ): Promise<CurrentReviewListingStats[]> {
    return readCurrentReviewListingStats(ownerTransactionClient(transaction), input.organizationId, input.listingIds);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import {
  ORDERS_REVIEW_LISTING_STATS_READ_PORT,
  type OrdersReviewListingStatsReadPort,
} from '../../../../orders/application/port/in/review-listing-stats-read.port';
import type {
  AdvertisingReviewListingStatsPort,
  AdvertisingReviewListingStatsRequest,
  AdvertisingReviewListingStatsResult,
} from '../../../application/port/out/cross-domain/review-listing-stats.port';

/**
 * Consumer-side bridge to the Orders-owned review read capability.
 *
 * Keeping this adapter at the Advertising boundary prevents the strategy
 * repository from importing an Orders service or knowing its implementation.
 */
@Injectable()
export class OrdersReviewListingStatsAdapter
  implements AdvertisingReviewListingStatsPort
{
  constructor(
    @Inject(ORDERS_REVIEW_LISTING_STATS_READ_PORT)
    private readonly ordersReviews: OrdersReviewListingStatsReadPort,
  ) {}

  loadListingReviewStats(
    request: AdvertisingReviewListingStatsRequest,
  ): Promise<AdvertisingReviewListingStatsResult> {
    return this.ordersReviews.loadListingReviewStats(request);
  }
}

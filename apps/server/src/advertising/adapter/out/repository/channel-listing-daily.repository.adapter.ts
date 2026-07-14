// `ChannelListingDailySnapshot` upsert adapter.
//
// Idempotent on `(organizationId, listingId, businessDate)`. Overwrite-on-
// replay metric semantics; namespaced metaJson merge inside a single
// $transaction. See `daily-fact-helpers.ts` for the shared helpers.

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ChannelListingDailyRepositoryPort,
  ListingDailyAdMetrics,
  ListingDailyState,
  ListingDailyTrafficMetrics,
  ListingDailyUpsertInput,
} from '../../../application/port/out/repository/channel-listing-daily.repository.port';
import {
  buildNamespacedMetaForCreate,
  mergeNamespacedMetaJson,
  pickObservedFields,
  spreadMetricsForCreate,
  spreadMetricsForUpdate,
} from './daily-fact-helpers';
import { withAdIngestRepositoryTransaction } from './ad-ingest-transaction-context';

const LISTING_STATE_KEYS: ReadonlyArray<keyof ListingDailyState> = [
  'productName',
  'status',
  'exposureStatus',
  'saleStatus',
  'channelPrice',
  'reviewCount',
  'avgRating',
  'isOfferWinner',
  'myPrice',
  'winnerPrice',
  'winnerGapPrice',
  'productRank',
  'categoryRank',
];

const LISTING_AD_METRIC_KEYS: ReadonlyArray<keyof ListingDailyAdMetrics> = [
  'adSpend',
  'adRevenue',
  'adImpressions',
  'adClicks',
  'adConversions',
  'adOrders',
  'adDirectOrders1d',
  'adIndirectOrders1d',
  'adDirectQty1d',
  'adIndirectQty1d',
  'adDirectRevenue1d',
  'adIndirectRevenue1d',
  'adTotalOrders14d',
  'adDirectOrders14d',
  'adIndirectOrders14d',
  'adTotalQty14d',
  'adDirectQty14d',
  'adIndirectQty14d',
  'adTotalRevenue14d',
  'adDirectRevenue14d',
  'adIndirectRevenue14d',
];

const LISTING_TRAFFIC_METRIC_KEYS: ReadonlyArray<
  keyof ListingDailyTrafficMetrics
> = [
  'trafficVisitors',
  'trafficViews',
  'trafficCartAdds',
  'trafficOrders',
  'trafficSalesQty',
  'trafficRevenue',
];

@Injectable()
export class ChannelListingDailyRepositoryAdapter
  implements ChannelListingDailyRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async upsert(input: ListingDailyUpsertInput): Promise<{ id: string }> {
    const observedAt = input.observedAt ?? new Date();
    const observedState = pickObservedFields(input, LISTING_STATE_KEYS);
    const metaJsonForCreate = buildNamespacedMetaForCreate(input.metaJson);
    const adMetricsCreate = spreadMetricsForCreate(
      input.metrics?.ad,
      LISTING_AD_METRIC_KEYS,
    );
    const trafficMetricsCreate = spreadMetricsForCreate(
      input.metrics?.traffic,
      LISTING_TRAFFIC_METRIC_KEYS,
    );
    const adMetricsUpdate = spreadMetricsForUpdate(
      input.metrics?.ad,
      LISTING_AD_METRIC_KEYS,
    );
    const trafficMetricsUpdate = spreadMetricsForUpdate(
      input.metrics?.traffic,
      LISTING_TRAFFIC_METRIC_KEYS,
    );

    return withAdIngestRepositoryTransaction(this.prisma, async (tx) => {
      const row = await tx.channelListingDailySnapshot.upsert({
        where: {
          organizationId_listingId_businessDate: {
            organizationId: input.organizationId,
            listingId: input.listingId,
            businessDate: input.businessDate,
          },
        },
        create: {
          organizationId: input.organizationId,
          listingId: input.listingId,
          channel: input.channel,
          externalId: input.externalId,
          businessDate: input.businessDate,
          sampleCount: 1,
          firstObservedAt: observedAt,
          lastObservedAt: observedAt,
          rawSnapshotId: input.rawSnapshotId ?? null,
          metaJson: metaJsonForCreate,
          productName: input.productName ?? null,
          status: input.status ?? null,
          exposureStatus: input.exposureStatus ?? null,
          saleStatus: input.saleStatus ?? null,
          channelPrice: input.channelPrice ?? null,
          reviewCount: input.reviewCount ?? null,
          avgRating: input.avgRating ?? null,
          isOfferWinner: input.isOfferWinner ?? null,
          myPrice: input.myPrice ?? null,
          winnerPrice: input.winnerPrice ?? null,
          winnerGapPrice: input.winnerGapPrice ?? null,
          productRank: input.productRank ?? null,
          categoryRank: input.categoryRank ?? null,
          ...adMetricsCreate,
          ...trafficMetricsCreate,
        },
        update: {
          sampleCount: { increment: 1 },
          lastObservedAt: observedAt,
          ...(input.rawSnapshotId !== undefined
            ? { rawSnapshotId: input.rawSnapshotId }
            : {}),
          ...(input.metaJson === null ? { metaJson: Prisma.DbNull } : {}),
          ...observedState,
          ...adMetricsUpdate,
          ...trafficMetricsUpdate,
        },
        select: { id: true },
      });
      await mergeNamespacedMetaJson(
        tx,
        'channel_listing_daily_snapshots',
        row.id,
        input.organizationId,
        input.metaJson,
      );
      return row;
    });
  }
}

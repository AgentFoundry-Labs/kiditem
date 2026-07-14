// `ChannelListingOptionDailySnapshot` upsert adapter.
//
// Idempotent on `(organizationId, listingOptionId, businessDate)`. Same
// metric / metaJson semantics as `ChannelListingDailyRepositoryAdapter`.

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ChannelOptionDailyRepositoryPort,
  ListingOptionDailyState,
  ListingOptionDailyUpsertInput,
} from '../../../application/port/out/repository/channel-option-daily.repository.port';
import {
  buildNamespacedMetaForCreate,
  mergeNamespacedMetaJson,
  pickObservedFields,
} from './daily-fact-helpers';
import { withAdIngestRepositoryTransaction } from './ad-ingest-transaction-context';

const OPTION_STATE_KEYS: ReadonlyArray<keyof ListingOptionDailyState> = [
  'optionName',
  'salePrice',
  'stockQty',
  'saleStatus',
  'isActive',
  'isOfferWinner',
  'myPrice',
  'winnerPrice',
  'winnerGapPrice',
];

@Injectable()
export class ChannelOptionDailyRepositoryAdapter
  implements ChannelOptionDailyRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    input: ListingOptionDailyUpsertInput,
  ): Promise<{ id: string }> {
    const observedAt = input.observedAt ?? new Date();
    const observedState = pickObservedFields(input, OPTION_STATE_KEYS);
    const metaJsonForCreate = buildNamespacedMetaForCreate(input.metaJson);

    return withAdIngestRepositoryTransaction(this.prisma, async (tx) => {
      const row = await tx.channelListingOptionDailySnapshot.upsert({
        where: {
          organizationId_listingOptionId_businessDate: {
            organizationId: input.organizationId,
            listingOptionId: input.listingOptionId,
            businessDate: input.businessDate,
          },
        },
        create: {
          organizationId: input.organizationId,
          listingId: input.listingId,
          listingOptionId: input.listingOptionId,
          channel: input.channel,
          externalId: input.externalId,
          externalOptionId: input.externalOptionId,
          businessDate: input.businessDate,
          sampleCount: 1,
          firstObservedAt: observedAt,
          lastObservedAt: observedAt,
          rawSnapshotId: input.rawSnapshotId ?? null,
          metaJson: metaJsonForCreate,
          optionName: input.optionName ?? null,
          salePrice: input.salePrice ?? null,
          stockQty: input.stockQty ?? null,
          saleStatus: input.saleStatus ?? null,
          isActive: input.isActive ?? null,
          isOfferWinner: input.isOfferWinner ?? null,
          myPrice: input.myPrice ?? null,
          winnerPrice: input.winnerPrice ?? null,
          winnerGapPrice: input.winnerGapPrice ?? null,
        },
        update: {
          sampleCount: { increment: 1 },
          lastObservedAt: observedAt,
          ...(input.rawSnapshotId !== undefined
            ? { rawSnapshotId: input.rawSnapshotId }
            : {}),
          ...(input.metaJson === null ? { metaJson: Prisma.DbNull } : {}),
          ...observedState,
        },
        select: { id: true },
      });
      await mergeNamespacedMetaJson(
        tx,
        'channel_listing_option_daily_snapshots',
        row.id,
        input.organizationId,
        input.metaJson,
      );
      return row;
    });
  }
}

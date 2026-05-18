import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ReconciliationItem } from '@kiditem/shared/channel-reconciliation';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  type ChannelReconciliationQueryRepositoryPort,
  type ChannelReconciliationResolutionRepositoryPort,
  CHANNEL_RECONCILIATION_QUERY_REPOSITORY_PORT,
  RECONCILIATION_CHANNEL,
} from '../../../application/port/out/channel-reconciliation.repository.port';
import { Inject } from '@nestjs/common';

@Injectable()
export class ChannelReconciliationResolutionRepositoryAdapter
  implements ChannelReconciliationResolutionRepositoryPort
{
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNEL_RECONCILIATION_QUERY_REPOSITORY_PORT)
    private readonly query: ChannelReconciliationQueryRepositoryPort,
  ) {}

  /**
   * Manual link: user picked a ProductOption in the matching UI.
   * Auto-creates ChannelListing and option rows if they are not present.
   */
  async linkItem(
    itemId: string,
    organizationId: string,
    body: { productOptionId: string },
  ): Promise<ReconciliationItem> {
    const updated = await this.prisma.$transaction(
      async (tx) => {
        const item = await tx.channelReconciliationItem.findFirst({
          where: { id: itemId, organizationId, channel: RECONCILIATION_CHANNEL },
        });
        if (!item) throw new NotFoundException('reconciliation item not found');
        if (!item.externalId) {
          throw new BadRequestException('item has no externalId - cannot link');
        }

        const option = await tx.productOption.findFirst({
          where: {
            id: body.productOptionId,
            organizationId,
            isActive: true,
            isDeleted: false,
            master: { isDeleted: false },
          },
          select: { id: true, masterId: true },
        });
        if (!option) {
          throw new BadRequestException(
            'productOptionId is not active in this organization',
          );
        }

        let listingId = item.linkedListingId;
        let listingOptionId = item.linkedListingOptionId;

        const existingListing = await tx.channelListing.findFirst({
          where: {
            organizationId,
            channel: RECONCILIATION_CHANNEL,
            externalId: item.externalId,
            isDeleted: false,
          },
          select: { id: true, masterId: true },
        });

        if (existingListing) {
          listingId = existingListing.id;
          if (existingListing.masterId !== option.masterId) {
            const retargeted = await tx.channelListing.updateMany({
              where: {
                id: existingListing.id,
                organizationId,
                channel: RECONCILIATION_CHANNEL,
                externalId: item.externalId,
                isDeleted: false,
              },
              data: { masterId: option.masterId },
            });
            if (retargeted.count !== 1) {
              throw new BadRequestException('existing ChannelListing disappeared during relink');
            }
          }
        } else {
          const created = await tx.channelListing.create({
            data: {
              organizationId,
              masterId: option.masterId,
              channel: RECONCILIATION_CHANNEL,
              externalId: item.externalId,
              status: 'draft',
            },
            select: { id: true },
          });
          listingId = created.id;
        }

        if (item.externalOptionId) {
          const existingOpt = await tx.channelListingOption.findFirst({
            where: {
              organizationId,
              listingId,
              externalOptionId: item.externalOptionId,
            },
            select: { id: true },
          });
          if (existingOpt) {
            const updatedOpt = await tx.channelListingOption.updateMany({
              where: {
                id: existingOpt.id,
                organizationId,
                listingId,
                externalOptionId: item.externalOptionId,
              },
              data: { optionId: option.id, isActive: true },
            });
            if (updatedOpt.count !== 1) {
              throw new BadRequestException('existing ChannelListingOption disappeared during relink');
            }
            listingOptionId = existingOpt.id;
          } else {
            const createdOpt = await tx.channelListingOption.create({
              data: {
                organizationId,
                listingId,
                externalOptionId: item.externalOptionId,
                optionId: option.id,
                isActive: true,
              },
              select: { id: true },
            });
            listingOptionId = createdOpt.id;
          }
        }

        return tx.channelReconciliationItem.update({
          where: {
            organizationId_channel_source_itemKey: {
              organizationId,
              channel: RECONCILIATION_CHANNEL,
              source: item.source,
              itemKey: item.itemKey,
            },
          },
          data: {
            status: 'linked',
            matchReason: 'manual',
            resolutionSource: 'manual',
            linkedListingId: listingId,
            linkedListingOptionId: listingOptionId,
            linkedMasterProductId: option.masterId,
            linkedProductOptionId: option.id,
            confidence: 100,
            resolvedAt: new Date(),
            ignoredReason: null,
            conflictJson: Prisma.JsonNull,
          },
        });
      },
      { timeout: 15_000 },
    );

    const [hydrated] = await this.query.hydrateItems(organizationId, [updated]);
    return hydrated;
  }

  async ignoreItem(
    itemId: string,
    organizationId: string,
    body: { reason?: string | null },
  ): Promise<ReconciliationItem> {
    const item = await this.prisma.channelReconciliationItem.findFirst({
      where: { id: itemId, organizationId, channel: RECONCILIATION_CHANNEL },
      select: { id: true, source: true, itemKey: true },
    });
    if (!item) throw new NotFoundException('reconciliation item not found');

    const updated = await this.prisma.channelReconciliationItem.update({
      where: {
        organizationId_channel_source_itemKey: {
          organizationId,
          channel: RECONCILIATION_CHANNEL,
          source: item.source,
          itemKey: item.itemKey,
        },
      },
      data: {
        status: 'ignored',
        resolutionSource: 'ignored',
        ignoredReason: body.reason ?? null,
        resolvedAt: new Date(),
      },
    });

    const [hydrated] = await this.query.hydrateItems(organizationId, [updated]);
    return hydrated;
  }
}

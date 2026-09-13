import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ThumbnailTrackingStatus } from '@kiditem/shared/ai';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CreateThumbnailTrackingInput,
  ThumbnailTrackingRepositoryPort,
  UpsertThumbnailTrackingDailySnapshotInput,
  UpdateThumbnailTrackingInput,
} from '../../../application/port/out/repository/thumbnail-tracking.repository.port';

const TRACKING_LISTING_INCLUDE = {
  listing: {
    select: {
      id: true,
      displayName: true,
      channelName: true,
      externalId: true,
    },
  },
} as const;

/**
 * SQL for one status. Each predicate selects exactly the rows
 * deriveThumbnailTrackingStatus derives, and a PostgreSQL spec pins the two
 * together.
 */
function thumbnailTrackingStatusWhere(status: ThumbnailTrackingStatus): Prisma.ThumbnailTrackingWhereInput {
  switch (status) {
    case 'inconclusive':
      return { markedInconclusiveAt: { not: null } };
    case 'measured':
      return { markedInconclusiveAt: null, ctrBefore: { not: null }, ctrAfter: { not: null } };
    case 'tracking':
      return { markedInconclusiveAt: null, OR: [{ ctrBefore: null }, { ctrAfter: null }] };
  }
}

function trackingWhere(
  query: { status?: ThumbnailTrackingStatus },
  organizationId: string,
): Prisma.ThumbnailTrackingWhereInput {
  return query.status
    ? { AND: [{ organizationId }, thumbnailTrackingStatusWhere(query.status)] }
    : { organizationId };
}

function isDuplicateError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class ThumbnailTrackingRepositoryAdapter implements ThumbnailTrackingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findTrackings(query: Parameters<ThumbnailTrackingRepositoryPort['findTrackings']>[0], organizationId: string) {
    return this.prisma.thumbnailTracking.findMany({
      where: trackingWhere(query, organizationId),
      include: TRACKING_LISTING_INCLUDE,
      orderBy: { appliedAt: 'desc' },
      skip: query.skip,
      take: query.take,
    });
  }

  countTrackings(query: Parameters<ThumbnailTrackingRepositoryPort['countTrackings']>[0], organizationId: string) {
    return this.prisma.thumbnailTracking.count({
      where: trackingWhere(query, organizationId),
    });
  }

  findChannelListingForWorkspace(contentWorkspaceId: string, organizationId: string) {
    return this.prisma.contentWorkspace
      .findFirst({
        where: {
          id: contentWorkspaceId,
          organizationId,
          status: 'active',
          isDeleted: false,
          channelListingId: { not: null },
        },
        select: { channelListing: { select: { id: true } } },
      })
      .then((workspace) => workspace?.channelListing ?? null);
  }

  async createTracking(input: CreateThumbnailTrackingInput) {
    const where = {
      organizationId: input.organizationId,
      listingId: input.listingId,
      generationId: input.generationId,
    };
    const existing = await this.prisma.thumbnailTracking.findFirst({
      where,
      include: TRACKING_LISTING_INCLUDE,
    });
    if (existing) return { created: false as const, row: existing };

    try {
      const row = await this.prisma.thumbnailTracking.create({
        data: {
          organizationId: input.organizationId,
          listingId: input.listingId,
          generationId: input.generationId,
          originalGrade: input.originalGrade,
          originalScore: input.originalScore,
        },
        include: TRACKING_LISTING_INCLUDE,
      });
      return { created: true as const, row };
    } catch (error) {
      if (!isDuplicateError(error)) throw error;

      const row = await this.prisma.thumbnailTracking.findFirst({
        where,
        include: TRACKING_LISTING_INCLUDE,
      });
      return { created: false as const, row };
    }
  }

  async updateMetrics(input: UpdateThumbnailTrackingInput) {
    const where = { id: input.id, organizationId: input.organizationId };
    const { inconclusive, ...metrics } = input.metrics;
    const data: Prisma.ThumbnailTrackingUpdateManyMutationInput = {};
    if (metrics.ctrBefore !== undefined) data.ctrBefore = metrics.ctrBefore;
    if (metrics.ctrAfter !== undefined) data.ctrAfter = metrics.ctrAfter;
    if (metrics.reviewsBefore !== undefined) data.reviewsBefore = metrics.reviewsBefore;
    if (metrics.reviewsAfter !== undefined) data.reviewsAfter = metrics.reviewsAfter;
    if (metrics.salesBefore !== undefined) data.salesBefore = metrics.salesBefore;
    if (metrics.salesAfter !== undefined) data.salesAfter = metrics.salesAfter;
    if (inconclusive === false) data.markedInconclusiveAt = null;

    const found = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.thumbnailTracking.updateMany({ where, data });
      if (updated.count === 0) return false;
      if (inconclusive === true) {
        // A repeated mark keeps the time the operator first judged the tracking inconclusive.
        await tx.thumbnailTracking.updateMany({
          where: { ...where, markedInconclusiveAt: null },
          data: { markedInconclusiveAt: new Date() },
        });
      }
      return true;
    });
    if (!found) return null;

    return this.prisma.thumbnailTracking.findFirst({
      where,
      include: TRACKING_LISTING_INCLUDE,
    });
  }

  findTrackingForSnapshot(trackingId: string, organizationId: string) {
    return this.prisma.thumbnailTracking.findFirst({
      where: { id: trackingId, organizationId },
      select: {
        id: true,
        salesBefore: true,
        listing: {
          select: {
            channelName: true,
            displayName: true,
            externalId: true,
          },
        },
      },
    });
  }

  async upsertDailySnapshot(input: UpsertThumbnailTrackingDailySnapshotInput) {
    const upserted = await this.prisma.thumbnailTrackingDailySnapshot.upsert({
      where: {
        trackingId_capturedDate: {
          trackingId: input.trackingId,
          capturedDate: input.capturedDate,
        },
      },
      create: {
        organizationId: input.organizationId,
        trackingId: input.trackingId,
        capturedDate: input.capturedDate,
        unitsSold30d: input.unitsSold30d,
        unitsSold7d: input.unitsSold7d,
        revenueKrw: input.revenueKrw,
        reviewCount: input.reviewCount,
        ratingAvg: input.ratingAvg,
        rawCellTexts: input.rawCellTexts as Prisma.InputJsonValue,
        scrapeStatus: input.scrapeStatus,
        errorMessage: input.errorMessage,
      },
      update: {
        unitsSold30d: input.unitsSold30d,
        unitsSold7d: input.unitsSold7d,
        revenueKrw: input.revenueKrw,
        reviewCount: input.reviewCount,
        ratingAvg: input.ratingAvg,
        rawCellTexts: input.rawCellTexts as Prisma.InputJsonValue,
        scrapeStatus: input.scrapeStatus,
        errorMessage: input.errorMessage,
        capturedAt: new Date(),
      },
    });

    if (input.setSalesBefore && input.unitsSold30d !== null) {
      await this.prisma.thumbnailTracking.updateMany({
        where: { id: input.trackingId, organizationId: input.organizationId },
        data: { salesBefore: input.unitsSold30d },
      });
    }

    return upserted;
  }

  listSnapshots(trackingId: string, organizationId: string) {
    return this.prisma.thumbnailTrackingDailySnapshot.findMany({
      where: { trackingId, organizationId },
      orderBy: { capturedDate: 'asc' },
    });
  }

  findActiveTrackings(organizationId: string) {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return this.prisma.thumbnailTracking.findMany({
      where: { organizationId, appliedAt: { gte: cutoff } },
      select: { id: true },
    });
  }
}

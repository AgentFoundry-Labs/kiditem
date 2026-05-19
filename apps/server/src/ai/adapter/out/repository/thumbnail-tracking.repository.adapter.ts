import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CreateThumbnailTrackingInput,
  ThumbnailTrackingRepositoryPort,
  UpsertThumbnailTrackingDailySnapshotInput,
  UpdateThumbnailTrackingInput,
} from '../../../application/port/out/thumbnail-tracking.repository.port';

const TRACKING_LISTING_INCLUDE = {
  listing: {
    select: {
      id: true,
      master: { select: { id: true, name: true } },
    },
  },
} as const;

function trackingWhere(
  query: { status?: string },
  organizationId: string,
): { organizationId: string; status?: string } {
  const where: { organizationId: string; status?: string } = { organizationId };
  if (query.status) where.status = query.status;
  return where;
}

function isDuplicateError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class ThumbnailTrackingRepositoryAdapter implements ThumbnailTrackingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findTrackings(
    query: Parameters<ThumbnailTrackingRepositoryPort['findTrackings']>[0],
    organizationId: string,
  ) {
    return this.prisma.thumbnailTracking.findMany({
      where: trackingWhere(query, organizationId),
      include: TRACKING_LISTING_INCLUDE,
      orderBy: { appliedAt: 'desc' },
      skip: query.skip,
      take: query.take,
    });
  }

  countTrackings(
    query: Parameters<ThumbnailTrackingRepositoryPort['countTrackings']>[0],
    organizationId: string,
  ) {
    return this.prisma.thumbnailTracking.count({
      where: trackingWhere(query, organizationId),
    });
  }

  findFirstListingForMaster(masterId: string, organizationId: string) {
    return this.prisma.channelListing.findFirst({
      where: { masterId, organizationId, isDeleted: false },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
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
    const existing = await this.prisma.thumbnailTracking.findFirst({
      where: { id: input.id, organizationId: input.organizationId },
      select: { ctrBefore: true, ctrAfter: true },
    });
    if (!existing) return null;

    const updateData: Record<string, unknown> = {};
    if (input.metrics.ctrBefore !== undefined) updateData.ctrBefore = input.metrics.ctrBefore;
    if (input.metrics.ctrAfter !== undefined) updateData.ctrAfter = input.metrics.ctrAfter;
    if (input.metrics.reviewsBefore !== undefined) {
      updateData.reviewsBefore = input.metrics.reviewsBefore;
    }
    if (input.metrics.reviewsAfter !== undefined) {
      updateData.reviewsAfter = input.metrics.reviewsAfter;
    }
    if (input.metrics.salesBefore !== undefined) updateData.salesBefore = input.metrics.salesBefore;
    if (input.metrics.salesAfter !== undefined) updateData.salesAfter = input.metrics.salesAfter;
    if (input.metrics.status !== undefined) updateData.status = input.metrics.status;

    if (
      (input.metrics.ctrBefore !== undefined || existing.ctrBefore != null) &&
      (input.metrics.ctrAfter !== undefined || existing.ctrAfter != null)
    ) {
      updateData.status = 'measured';
    }

    const result = await this.prisma.thumbnailTracking.updateMany({
      where: { id: input.id, organizationId: input.organizationId },
      data: updateData,
    });
    if (result.count === 0) return null;

    return this.prisma.thumbnailTracking.findFirst({
      where: { id: input.id, organizationId: input.organizationId },
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
            master: { select: { name: true } },
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

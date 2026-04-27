import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  THUMBNAIL_TRACKING_STATUSES,
  type ThumbnailTrackingListResponse,
  type ThumbnailTrackingRecord,
  type ThumbnailTrackingStatus,
  type UpdateThumbnailTrackingMetricsInput,
} from '@kiditem/shared';
import { PrismaService } from '../../prisma/prisma.service';

type TrackingRow = {
  id: string;
  companyId: string;
  listingId: string;
  generationId: string;
  originalGrade: string;
  originalScore: number;
  appliedAt: Date;
  status: string;
  ctrBefore: number | null;
  ctrAfter: number | null;
  reviewsBefore: number | null;
  reviewsAfter: number | null;
  salesBefore: number | null;
  salesAfter: number | null;
  listing: { id: string; master: { id: string; name: string } | null } | null;
};

const LISTING_INCLUDE = {
  listing: {
    select: {
      id: true,
      master: { select: { id: true, name: true } },
    },
  },
} as const;

function toRecord(row: TrackingRow, nowMs: number = Date.now()): ThumbnailTrackingRecord {
  const status = (THUMBNAIL_TRACKING_STATUSES as readonly string[]).includes(row.status)
    ? (row.status as ThumbnailTrackingStatus)
    : 'tracking';
  const ctrChange =
    row.ctrBefore != null && row.ctrAfter != null
      ? Math.round((row.ctrAfter - row.ctrBefore) * 10) / 10
      : null;
  return {
    id: row.id,
    productId: row.listing?.master?.id ?? '',
    productName: row.listing?.master?.name ?? '',
    generationId: row.generationId,
    originalGrade: row.originalGrade,
    originalScore: row.originalScore,
    appliedAt: row.appliedAt.toISOString(),
    daysElapsed: Math.floor((nowMs - row.appliedAt.getTime()) / (1000 * 60 * 60 * 24)),
    status,
    ctrBefore: row.ctrBefore,
    ctrAfter: row.ctrAfter,
    ctrChange,
    reviewsBefore: row.reviewsBefore,
    reviewsAfter: row.reviewsAfter,
    salesBefore: row.salesBefore,
    salesAfter: row.salesAfter,
  } satisfies ThumbnailTrackingRecord;
}

@Injectable()
export class ThumbnailTrackingService {
  private readonly logger = new Logger(ThumbnailTrackingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: { page?: number; limit?: number; status?: ThumbnailTrackingStatus },
    companyId: string,
  ): Promise<ThumbnailTrackingListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { companyId };
    if (query.status) where.status = query.status;

    const [rows, total] = await Promise.all([
      this.prisma.thumbnailTracking.findMany({
        where,
        include: LISTING_INCLUDE,
        orderBy: { appliedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.thumbnailTracking.count({ where }),
    ]);

    const now = Date.now();
    const items = (rows as unknown as TrackingRow[]).map((r) => toRecord(r, now));
    return { items, total, page, limit } satisfies ThumbnailTrackingListResponse;
  }

  async create(input: {
    companyId: string;
    masterId: string;
    generationId: string;
    originalGrade: string;
    originalScore: number;
  }): Promise<ThumbnailTrackingRecord | null> {
    const listing = await this.prisma.channelListing.findFirst({
      where: { masterId: input.masterId, companyId: input.companyId, isDeleted: false },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!listing) {
      this.logger.debug(
        `ThumbnailTracking skip — master ${input.masterId} 에 연결된 ChannelListing 없음`,
      );
      return null;
    }

    const existing = await this.prisma.thumbnailTracking.findFirst({
      where: {
        companyId: input.companyId,
        listingId: listing.id,
        generationId: input.generationId,
      },
      include: LISTING_INCLUDE,
    });
    if (existing) return toRecord(existing as unknown as TrackingRow);

    try {
      const row = await this.prisma.thumbnailTracking.create({
        data: {
          companyId: input.companyId,
          listingId: listing.id,
          generationId: input.generationId,
          originalGrade: input.originalGrade,
          originalScore: input.originalScore,
        },
        include: LISTING_INCLUDE,
      });
      return toRecord(row as unknown as TrackingRow);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const row = await this.prisma.thumbnailTracking.findFirst({
          where: {
            companyId: input.companyId,
            listingId: listing.id,
            generationId: input.generationId,
          },
          include: LISTING_INCLUDE,
        });
        if (row) return toRecord(row as unknown as TrackingRow);
      }
      throw err;
    }
  }

  async updateMetrics(
    id: string,
    input: UpdateThumbnailTrackingMetricsInput,
    companyId: string,
  ): Promise<ThumbnailTrackingRecord> {
    const existing = await this.prisma.thumbnailTracking.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new NotFoundException(`ThumbnailTracking ${id} not found`);

    const updateData: Record<string, unknown> = {};
    if (input.ctrBefore !== undefined) updateData.ctrBefore = input.ctrBefore;
    if (input.ctrAfter !== undefined) updateData.ctrAfter = input.ctrAfter;
    if (input.reviewsBefore !== undefined) updateData.reviewsBefore = input.reviewsBefore;
    if (input.reviewsAfter !== undefined) updateData.reviewsAfter = input.reviewsAfter;
    if (input.salesBefore !== undefined) updateData.salesBefore = input.salesBefore;
    if (input.salesAfter !== undefined) updateData.salesAfter = input.salesAfter;
    if (input.status !== undefined) updateData.status = input.status;

    if (
      (input.ctrBefore !== undefined || existing.ctrBefore != null) &&
      (input.ctrAfter !== undefined || existing.ctrAfter != null)
    ) {
      updateData.status = 'measured';
    }

    const result = await this.prisma.thumbnailTracking.updateMany({
      where: { id, companyId },
      data: updateData,
    });
    if (result.count === 0) throw new NotFoundException(`ThumbnailTracking ${id} not found`);

    const row = await this.prisma.thumbnailTracking.findFirst({
      where: { id, companyId },
      include: LISTING_INCLUDE,
    });
    if (!row) throw new NotFoundException(`ThumbnailTracking ${id} not found`);
    return toRecord(row as unknown as TrackingRow);
  }
}

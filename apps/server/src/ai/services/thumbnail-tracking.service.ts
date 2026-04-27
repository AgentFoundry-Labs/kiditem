import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  ThumbnailTrackingListResponse,
  ThumbnailTrackingRecord,
  UpdateThumbnailTrackingMetricsInput,
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
    status: row.status,
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
    query: { page?: number; limit?: number; status?: string },
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

    const existing = await this.prisma.thumbnailTracking.findUnique({
      where: {
        listingId_generationId: { listingId: listing.id, generationId: input.generationId },
      },
      include: LISTING_INCLUDE,
    });
    if (existing) return toRecord(existing as unknown as TrackingRow);

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

    const row = await this.prisma.thumbnailTracking.update({
      where: { id },
      data: updateData,
      include: LISTING_INCLUDE,
    });
    return toRecord(row as unknown as TrackingRow);
  }
}

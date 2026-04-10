import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  ThumbnailTrackingRecord,
  ThumbnailTrackingListResponse,
  UpdateMetricsInput,
} from './types';

type TrackingRow = {
  id: string;
  productId: string;
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
  product: { id: string; name: string };
};

function toRecord(row: TrackingRow, nowMs: number = Date.now()): ThumbnailTrackingRecord {
  const ctrChange =
    row.ctrBefore != null && row.ctrAfter != null
      ? Math.round((row.ctrAfter - row.ctrBefore) * 10) / 10
      : null;
  return {
    id: row.id,
    productId: row.productId,
    productName: row.product.name,
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
  };
}

@Injectable()
export class ThumbnailTrackingService {
  private readonly logger = new Logger(ThumbnailTrackingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: {
    page?: number;
    limit?: number;
    status?: string;
  } = {}): Promise<ThumbnailTrackingListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;

    const [rows, total] = await Promise.all([
      this.prisma.thumbnailTracking.findMany({
        where,
        include: { product: { select: { id: true, name: true } } },
        orderBy: { appliedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.thumbnailTracking.count({ where }),
    ]);

    const now = Date.now();
    return {
      items: rows.map((r) => toRecord(r as TrackingRow, now)),
      total,
      page,
      limit,
    };
  }

  async create(data: {
    companyId: string;
    productId: string;
    generationId: string;
    originalGrade: string;
    originalScore: number;
  }): Promise<ThumbnailTrackingRecord> {
    const existing = await this.prisma.thumbnailTracking.findUnique({
      where: { productId_generationId: { productId: data.productId, generationId: data.generationId } },
      include: { product: { select: { id: true, name: true } } },
    });

    if (existing) return toRecord(existing as TrackingRow);

    const row = await this.prisma.thumbnailTracking.create({
      data: {
        companyId: data.companyId,
        productId: data.productId,
        generationId: data.generationId,
        originalGrade: data.originalGrade,
        originalScore: data.originalScore,
      },
      include: { product: { select: { id: true, name: true } } },
    });

    return toRecord(row as TrackingRow);
  }

  async updateMetrics(id: string, input: UpdateMetricsInput): Promise<ThumbnailTrackingRecord> {
    const existing = await this.prisma.thumbnailTracking.findUnique({ where: { id } });
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
      include: { product: { select: { id: true, name: true } } },
    });

    return toRecord(row as TrackingRow);
  }
}

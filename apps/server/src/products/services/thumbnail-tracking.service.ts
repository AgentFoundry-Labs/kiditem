import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ThumbnailTrackingRecord {
  id: string;
  productId: string;
  productName: string;
  generationId: string;
  originalGrade: string;
  originalScore: number;
  appliedAt: string;
  daysElapsed: number;
  status: string;
  ctrBefore: number | null;
  ctrAfter: number | null;
  ctrChange: number | null;
  reviewsBefore: number | null;
  reviewsAfter: number | null;
  salesBefore: number | null;
  salesAfter: number | null;
}

export interface UpdateMetricsInput {
  ctrBefore?: number;
  ctrAfter?: number;
  reviewsBefore?: number;
  reviewsAfter?: number;
  salesBefore?: number;
  salesAfter?: number;
  status?: string;
}

@Injectable()
export class ThumbnailTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<ThumbnailTrackingRecord[]> {
    const rows = await this.prisma.thumbnailTracking.findMany({
      include: {
        product: { select: { id: true, name: true } },
      },
      orderBy: { appliedAt: 'desc' },
    });

    const now = Date.now();
    return rows.map((r) => {
      const ctrChange =
        r.ctrBefore != null && r.ctrAfter != null
          ? Math.round((r.ctrAfter - r.ctrBefore) * 10) / 10
          : null;
      return {
        id: r.id,
        productId: r.productId,
        productName: r.product.name,
        generationId: r.generationId,
        originalGrade: r.originalGrade,
        originalScore: r.originalScore,
        appliedAt: r.appliedAt.toISOString(),
        daysElapsed: Math.floor((now - r.appliedAt.getTime()) / (1000 * 60 * 60 * 24)),
        status: r.status,
        ctrBefore: r.ctrBefore,
        ctrAfter: r.ctrAfter,
        ctrChange,
        reviewsBefore: r.reviewsBefore,
        reviewsAfter: r.reviewsAfter,
        salesBefore: r.salesBefore,
        salesAfter: r.salesAfter,
      };
    });
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

    if (existing) {
      const now = Date.now();
      return {
        id: existing.id,
        productId: existing.productId,
        productName: existing.product.name,
        generationId: existing.generationId,
        originalGrade: existing.originalGrade,
        originalScore: existing.originalScore,
        appliedAt: existing.appliedAt.toISOString(),
        daysElapsed: Math.floor((now - existing.appliedAt.getTime()) / (1000 * 60 * 60 * 24)),
        status: existing.status,
        ctrBefore: existing.ctrBefore,
        ctrAfter: existing.ctrAfter,
        ctrChange: null,
        reviewsBefore: existing.reviewsBefore,
        reviewsAfter: existing.reviewsAfter,
        salesBefore: existing.salesBefore,
        salesAfter: existing.salesAfter,
      };
    }

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

    return {
      id: row.id,
      productId: row.productId,
      productName: row.product.name,
      generationId: row.generationId,
      originalGrade: row.originalGrade,
      originalScore: row.originalScore,
      appliedAt: row.appliedAt.toISOString(),
      daysElapsed: 0,
      status: row.status,
      ctrBefore: null,
      ctrAfter: null,
      ctrChange: null,
      reviewsBefore: null,
      reviewsAfter: null,
      salesBefore: null,
      salesAfter: null,
    };
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

    const now = Date.now();
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
      daysElapsed: Math.floor((now - row.appliedAt.getTime()) / (1000 * 60 * 60 * 24)),
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
}

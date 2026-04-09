import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ThumbnailAiService } from './thumbnail-ai.service';
import type { GenerationWithProduct } from './types';

export type { GenerationWithProduct } from './types';

@Injectable()
export class ThumbnailGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly thumbnailAiService: ThumbnailAiService,
  ) {}

  async createJobs(productIds: string[]): Promise<GenerationWithProduct[]> {
    const results: GenerationWithProduct[] = [];

    for (const productId of productIds) {
      try {
        const existing = await this.prisma.thumbnailGeneration.findFirst({
          where: {
            productId,
            status: { in: ['pending', 'generating', 'ready'] },
          },
        });

        if (existing) continue;

        const product = await this.prisma.product.findUnique({
          where: { id: productId },
        });

        if (!product) continue;

        const generation = await this.prisma.thumbnailGeneration.create({
          data: {
            productId,
            companyId: product.companyId,
            originalUrl: product.imageUrl ?? product.thumbnailUrl ?? null,
            status: 'generating',
          },
          include: { product: { select: { id: true, name: true, imageUrl: true, coupangProductId: true, category: true } } },
        });

        let candidates: Array<{ url: string; filename: string }>;
        let status: string;
        try {
          candidates = await this.thumbnailAiService.generateImages(
            product.name,
            product.category ?? '일반',
            productId,
          );
          status = 'ready';
        } catch {
          candidates = [];
          status = 'failed';
        }

        const updated = await this.prisma.thumbnailGeneration.update({
          where: { id: generation.id },
          data: {
            candidates,
            status,
          },
          include: { product: { select: { id: true, name: true, imageUrl: true, coupangProductId: true, category: true } } },
        });

        results.push({
          ...updated,
          candidates: updated.candidates as Array<{ url: string; filename: string }>,
          product: updated.product,
        });
      } catch {
        // continue with remaining
      }
    }

    return results;
  }

  async findAll(query: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: GenerationWithProduct[]; total: number; page: number; limit: number }> {
    try {
      const page = query.page ?? 1;
      const limit = query.limit ?? 50;
      const skip = (page - 1) * limit;

      const where = query.status ? { status: query.status } : {};

      const [items, total] = await Promise.all([
        this.prisma.thumbnailGeneration.findMany({
          where,
          include: { product: { select: { id: true, name: true, imageUrl: true, coupangProductId: true, category: true } } },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.thumbnailGeneration.count({ where }),
      ]);

      return {
        items: items.map((item) => ({
          ...item,
          candidates: item.candidates as Array<{ url: string; filename: string }>,
          product: item.product,
        })),
        total,
        page,
        limit,
      };
    } catch {
      throw new InternalServerErrorException('썸네일 생성 목록 조회 실패');
    }
  }

  async selectCandidate(id: string, selectedUrl: string): Promise<GenerationWithProduct> {
    const existing = await this.prisma.thumbnailGeneration.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Generation ${id} not found`);

    const updated = await this.prisma.thumbnailGeneration.update({
      where: { id },
      data: { selectedUrl, status: 'ready' },
      include: { product: { select: { id: true, name: true, imageUrl: true, coupangProductId: true, category: true } } },
    });

    return {
      ...updated,
      candidates: updated.candidates as Array<{ url: string; filename: string }>,
      product: updated.product,
    };
  }

  async applyGeneration(id: string): Promise<GenerationWithProduct> {
    const existing = await this.prisma.thumbnailGeneration.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Generation ${id} not found`);

    const updated = await this.prisma.thumbnailGeneration.update({
      where: { id },
      data: { status: 'applied' },
      include: { product: { select: { id: true, name: true, imageUrl: true, coupangProductId: true, category: true } } },
    });

    return {
      ...updated,
      candidates: updated.candidates as Array<{ url: string; filename: string }>,
      product: updated.product,
    };
  }

  async skipGeneration(id: string): Promise<GenerationWithProduct> {
    const existing = await this.prisma.thumbnailGeneration.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Generation ${id} not found`);

    const updated = await this.prisma.thumbnailGeneration.update({
      where: { id },
      data: { status: 'skipped' },
      include: { product: { select: { id: true, name: true, imageUrl: true, coupangProductId: true, category: true } } },
    });

    return {
      ...updated,
      candidates: updated.candidates as Array<{ url: string; filename: string }>,
      product: updated.product,
    };
  }
}

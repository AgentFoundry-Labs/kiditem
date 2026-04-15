import { Injectable, Logger, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ThumbnailAiService } from './thumbnail-ai.service';
import { ThumbnailTrackingService } from './thumbnail-tracking.service';
import type { GenerationWithProduct, EditAnalysisResult } from './types';

export type { GenerationWithProduct } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toGeneration(row: any): GenerationWithProduct {
  return {
    ...row,
    candidates: row.candidates as Array<{ url: string; filename: string }>,
    editAnalysis: (row.editAnalysis ?? null) as EditAnalysisResult | null,
  };
}

@Injectable()
export class ThumbnailGenerationService {
  private readonly logger = new Logger(ThumbnailGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly thumbnailAiService: ThumbnailAiService,
    private readonly trackingService: ThumbnailTrackingService,
  ) {}

  async findAll(query: {
    status?: string;
    method?: string;
    productId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: GenerationWithProduct[]; total: number; page: number; limit: number }> {
    try {
      // after 이미지가 없거나 로컬 경로(서빙 불가)인 ready/applied edit 잡 → pending으로 리셋
      // candidates가 비어있거나, 첫 번째 URL이 상대경로(로컬 파일, HTTP 서빙 안 됨)인 경우
      await this.prisma.$executeRaw`
        UPDATE thumbnail_generations
        SET status = 'pending', selected_url = NULL
        WHERE method = 'edit'
          AND status IN ('ready', 'applied')
          AND (
            candidates = '[]'::jsonb
            OR (
              jsonb_array_length(candidates) > 0
              AND candidates->0->>'url' LIKE '/%'
            )
          )
      `.catch((err: unknown) => {
        this.logger.warn(`after 이미지 없는 잡 리셋 실패: ${err instanceof Error ? err.message : err}`);
      });

      const page = query.page ?? 1;
      const limit = query.limit ?? 50;
      const skip = (page - 1) * limit;

      const where: Record<string, unknown> = {};
      if (query.status) where.status = query.status;
      if (query.method) where.method = query.method;
      if (query.productId) where.productId = query.productId;

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
        items: items.map(toGeneration),
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
      data: { selectedUrl: selectedUrl || null, status: 'ready' },
      include: { product: { select: { id: true, name: true, imageUrl: true, coupangProductId: true, category: true } } },
    });

    return toGeneration(updated);
  }

  async applyGeneration(id: string): Promise<GenerationWithProduct> {
    const existing = await this.prisma.thumbnailGeneration.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Generation ${id} not found`);

    // selectedUrl → Product.imageUrl 갱신 (AI 편집 결과를 대표 이미지로 반영)
    if (existing.selectedUrl) {
      await this.prisma.product.update({
        where: { id: existing.productId },
        data: { imageUrl: existing.selectedUrl },
      });
    }

    const updated = await this.prisma.thumbnailGeneration.update({
      where: { id },
      data: { status: 'applied' },
      include: { product: { select: { id: true, name: true, imageUrl: true, coupangProductId: true, category: true } } },
    });

    // 추적 레코드 생성 (이미 있으면 upsert 처리됨)
    const analysis = await this.prisma.thumbnailAnalysis.findUnique({ where: { productId: existing.productId } });
    this.trackingService.create({
      companyId: existing.companyId,
      productId: existing.productId,
      generationId: existing.id,
      originalGrade: analysis?.grade ?? existing.grade,
      originalScore: analysis?.overallScore ?? existing.score,
    }).catch((err) => {
      this.logger.warn(
        `ThumbnailTracking 자동 생성 실패 (generationId=${existing.id}): ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return toGeneration(updated);
  }

  async skipGeneration(id: string): Promise<GenerationWithProduct> {
    const existing = await this.prisma.thumbnailGeneration.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Generation ${id} not found`);

    const updated = await this.prisma.thumbnailGeneration.update({
      where: { id },
      data: { status: 'skipped' },
      include: { product: { select: { id: true, name: true, imageUrl: true, coupangProductId: true, category: true } } },
    });

    return toGeneration(updated);
  }

  async deleteGeneration(id: string): Promise<{ ok: true }> {
    const existing = await this.prisma.thumbnailGeneration.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Generation ${id} not found`);

    await this.prisma.thumbnailGeneration.delete({ where: { id } });
    return { ok: true };
  }

  async findProductForEditor(productId: string): Promise<{ id: string; imageUrl: string | null; companyId: string } | null> {
    return this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, imageUrl: true, companyId: true },
    });
  }

  async saveEditorResult(params: {
    productId: string;
    companyId: string;
    originalUrl: string | null;
    candidates: Array<{ url: string; filename: string }>;
  }): Promise<string | null> {
    try {
      const gen = await this.prisma.thumbnailGeneration.create({
        data: {
          productId: params.productId,
          companyId: params.companyId,
          originalUrl: params.originalUrl,
          candidates: params.candidates,
          status: 'ready',
          method: 'generate',
          grade: '-',
          score: 0,
        },
      });
      return gen.id;
    } catch (err) {
      this.logger.warn(`ThumbnailGeneration DB 저장 실패 (productId=${params.productId}): ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}

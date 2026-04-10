import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ThumbnailAiService } from './thumbnail-ai.service';
import type { GenerationWithProduct, EditAnalysisResult } from './types';

const PRODUCT_SELECT = { id: true, name: true, imageUrl: true, coupangProductId: true, category: true } as const;

@Injectable()
export class ThumbnailEditService {
  private readonly logger = new Logger(ThumbnailEditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly thumbnailAiService: ThumbnailAiService,
  ) {}

  async createEditJobs(productIds: string[], purpose: 'compliance' | 'quality' = 'compliance'): Promise<GenerationWithProduct[]> {
    const results: GenerationWithProduct[] = [];

    for (const productId of productIds) {
      try {
        // 이미 진행 중인 job이 있으면 skip
        const activeJob = await this.prisma.thumbnailGeneration.findFirst({
          where: {
            productId,
            method: 'edit',
            status: { in: ['pending', 'generating'] },
          },
        });
        if (activeJob) continue;

        const product = await this.prisma.product.findUnique({
          where: { id: productId },
        });
        if (!product) continue;

        const imageUrl = product.imageUrl ?? product.thumbnailUrl ?? null;
        if (!imageUrl) continue;

        const generation = await this.prisma.thumbnailGeneration.create({
          data: {
            productId,
            companyId: product.companyId,
            originalUrl: imageUrl,
            method: 'edit',
            status: 'pending',
          },
          include: { product: { select: PRODUCT_SELECT } },
        });

        const result: GenerationWithProduct = {
          ...generation,
          candidates: generation.candidates as Array<{ url: string; filename: string }>,
          editAnalysis: null,
        };
        results.push(result);

        // 백그라운드 처리 시작
        setImmediate(() => {
          this.processEditJob(generation.id, imageUrl, product.name, product.category, purpose).catch((err) => {
            this.logger.error(`편집 job 백그라운드 처리 실패 (${generation.id}): ${err instanceof Error ? err.message : err}`);
          });
        });
      } catch (error) {
        this.logger.error(`편집 job 생성 실패 (product: ${productId}): ${error instanceof Error ? error.message : error}`);
      }
    }

    return results;
  }

  private static readonly EDIT_TIMEOUT_MS = 5 * 60 * 1000; // 5분

  private async processEditJob(
    generationId: string,
    imageUrl: string,
    productName: string,
    category: string | null,
    purpose: 'compliance' | 'quality' = 'compliance',
  ): Promise<void> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('편집 타임아웃 (5분 초과)')), ThumbnailEditService.EDIT_TIMEOUT_MS),
    );

    try {
      await this.prisma.thumbnailGeneration.update({
        where: { id: generationId },
        data: { status: 'generating' },
      });

      // 1. 이미지 편집 (타임아웃 적용)
      const candidates = await Promise.race([
        this.thumbnailAiService.editImage(imageUrl, generationId, purpose),
        timeout,
      ]);

      if (candidates.length === 0) {
        await this.prisma.thumbnailGeneration.update({
          where: { id: generationId },
          data: { status: 'failed' },
        });
        return;
      }

      // 2. 편집된 이미지 가이드라인 재체크 (품질 평가 불필요)
      let editAnalysis: EditAnalysisResult | null = null;
      const firstCandidate = candidates[0];
      if (firstCandidate) {
        const complianceMap = await this.thumbnailAiService.checkCompliance([{
          imageUrl: firstCandidate.url,
          productName,
          productId: generationId,
          category: category ?? undefined,
        }]);
        const compliance = complianceMap.get(generationId) ?? null;
        if (compliance) {
          editAnalysis = {
            complianceGrade: compliance.complianceGrade,
            complianceScores: compliance.complianceScores as unknown as Record<string, unknown> | null,
            overallScore: 0,
            grade: '',
          };
        }
      }

      // 3. 결과 저장
      await this.prisma.thumbnailGeneration.update({
        where: { id: generationId },
        data: {
          candidates: candidates as unknown as Prisma.InputJsonValue,
          status: 'ready',
          editAnalysis: editAnalysis as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.logger.error(`편집 처리 실패 (${generationId}): ${error instanceof Error ? error.message : error}`);
      await this.prisma.thumbnailGeneration.update({
        where: { id: generationId },
        data: { status: 'failed' },
      }).catch(() => {});
    }
  }
}

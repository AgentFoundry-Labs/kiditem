import { Injectable, Logger, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ThumbnailAiService } from './thumbnail-ai.service';
import type { ThumbnailAnalysisItem, ThumbnailAnalysisSummaryInternal, ThumbnailAnalysisListResponse, AiAnalysisResult, ImageSpec } from './types';
import type { ThumbnailAnalysisSummary as SharedThumbnailAnalysisSummary } from '@kiditem/shared';

export type { ThumbnailAnalysisItem, ThumbnailAnalysisListResponse } from './types';
export type ThumbnailAnalysisSummary = ThumbnailAnalysisSummaryInternal;

type AnalysisScope = 'all' | 'quality' | 'compliance';

@Injectable()
export class ThumbnailAnalysisService {
  private readonly logger = new Logger(ThumbnailAnalysisService.name);
  private batchAbort: AbortController | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly thumbnailAiService: ThumbnailAiService,
  ) {}

  isBatchRunning(): boolean {
    return this.batchAbort !== null;
  }

  cancelBatch(): { ok: true } {
    if (!this.batchAbort) throw new NotFoundException('실행 중인 배치 분석이 없습니다');
    this.batchAbort.abort();
    this.batchAbort = null;
    return { ok: true };
  }

  async checkImageSpec(imageUrl: string) {
    return this.thumbnailAiService.checkImageSpec(imageUrl);
  }

  async preInspect(productIds?: string[]): Promise<{ processed: number; failed: number }> {
    const where: Record<string, unknown> = { isDeleted: false, status: 'active' };
    if (productIds?.length) where.id = { in: productIds };

    const products = await this.prisma.product.findMany({
      where,
      select: { id: true, companyId: true, name: true, imageUrl: true, thumbnailUrl: true, thumbnails: { orderBy: { createdAt: 'desc' as const }, take: 1 } },
    });

    let processed = 0;
    let failed = 0;

    for (const product of products) {
      const rawImageUrl = product.imageUrl ?? product.thumbnails[0]?.imageUrl ?? null;
      if (!rawImageUrl) continue;

      const imageUrl = this.thumbnailAiService.toCoupangOriginal(rawImageUrl);
      try {
        const spec = await this.thumbnailAiService.checkImageSpec(imageUrl);
        const specHasFail = spec.issues.some((i) => i.severity === 'fail');

        await this.prisma.thumbnailAnalysis.upsert({
          where: { productId: product.id },
          create: {
            productId: product.id,
            companyId: product.companyId,
            imageUrl,
            imageSpec: spec as unknown as Prisma.InputJsonValue,
            ...(specHasFail ? { complianceGrade: 'FAIL', complianceAnalyzedAt: new Date() } : {}),
          },
          update: {
            imageSpec: spec as unknown as Prisma.InputJsonValue,
            ...(specHasFail ? { complianceGrade: 'FAIL', complianceAnalyzedAt: new Date() } : {}),
          },
        });
        processed++;
      } catch (err) {
        this.logger.warn(`사전 검수 실패 (${product.id}): ${err instanceof Error ? err.message : err}`);
        failed++;
      }
    }

    return { processed, failed };
  }

  async findAllWithAnalysis(query: {
    page?: number;
    limit?: number;
    grade?: string;
    analyzed?: string;
  }): Promise<ThumbnailAnalysisListResponse> {
    try {
      const products = await this.prisma.product.findMany({
        where: { isDeleted: false, status: 'active' },
        include: {
          thumbnailAnalysis: true,
          thumbnails: true,
        },
        orderBy: { updatedAt: 'desc' },
      });

      const analyzedItems: ThumbnailAnalysisItem[] = [];
      const unclassifiedItems: ThumbnailAnalysisItem[] = [];

      const gradeDistribution = { S: 0, A: 0, B: 0, C: 0, F: 0 };
      const complianceDistribution = { PASS: 0, WARN: 0, FAIL: 0 };

      for (const product of products) {
        const analysis = product.thumbnailAnalysis;
        const imageUrl = product.imageUrl ?? product.thumbnailUrl ?? null;

        if (analysis) {
          const qualityAnalyzed = !!(analysis as { qualityAnalyzedAt?: Date | null }).qualityAnalyzedAt;
          const complianceAnalyzed = !!(analysis as { complianceAnalyzedAt?: Date | null }).complianceAnalyzedAt;
          const fullyAnalyzed = qualityAnalyzed && complianceAnalyzed;

          const grade = analysis.grade as keyof typeof gradeDistribution;
          if (qualityAnalyzed && grade in gradeDistribution) {
            gradeDistribution[grade]++;
          }

          const complianceGrade = (analysis as { complianceGrade?: string | null }).complianceGrade;
          if (complianceAnalyzed && complianceGrade && complianceGrade in complianceDistribution) {
            complianceDistribution[complianceGrade as keyof typeof complianceDistribution]++;
          }

          const item: ThumbnailAnalysisItem = {
            id: analysis.id,
            productId: product.id,
            productName: product.name,
            imageUrl: analysis.imageUrl,
            overallScore: analysis.overallScore,
            grade: analysis.grade,
            scores: analysis.scores as Record<string, number> | null,
            issues: analysis.issues as Array<{ type: string; severity: string; message: string }>,
            suggestions: analysis.suggestions as string[],
            method: analysis.method,
            analyzed: fullyAnalyzed,
            qualityAnalyzed,
            complianceAnalyzed,
            complianceGrade: complianceGrade ?? undefined,
            complianceScores: (analysis as { complianceScores?: Record<string, unknown> | null }).complianceScores ?? null,
            imageSpec: ((analysis as { imageSpec?: unknown }).imageSpec as ImageSpec | null) ?? null,
          };

          if (fullyAnalyzed) {
            if (!query.grade || item.grade === query.grade) {
              analyzedItems.push(item);
            }
          } else {
            unclassifiedItems.push(item);
          }
        } else {
          const item: ThumbnailAnalysisItem = {
            id: `unclassified-${product.id}`,
            productId: product.id,
            productName: product.name,
            imageUrl,
            overallScore: 0,
            grade: 'F',
            scores: null,
            issues: [],
            suggestions: [],
            method: 'none',
            analyzed: false,
            qualityAnalyzed: false,
            complianceAnalyzed: false,
            imageSpec: null,
          };
          unclassifiedItems.push(item);
        }
      }

      const allResults = [...analyzedItems, ...unclassifiedItems];

      return {
        total: products.length,
        analyzed: analyzedItems.length,
        partialCount: unclassifiedItems.filter((i) => i.qualityAnalyzed || i.complianceAnalyzed).length,
        unclassifiedCount: unclassifiedItems.length,
        gradeDistribution,
        complianceDistribution,
        allResults,
        unclassified: unclassifiedItems,
      };
    } catch {
      throw new InternalServerErrorException('썸네일 분석 목록 조회 실패');
    }
  }

  async getSummary(): Promise<ThumbnailAnalysisSummary> {
    try {
      const [total, fullyAnalyzed, partialCount, gradeGroups, complianceGroups] = await Promise.all([
        this.prisma.product.count({ where: { isDeleted: false } }),
        this.prisma.thumbnailAnalysis.count({
          where: {
            qualityAnalyzedAt: { not: null },
            complianceAnalyzedAt: { not: null },
          },
        }),
        this.prisma.thumbnailAnalysis.count({
          where: {
            OR: [
              { qualityAnalyzedAt: { not: null }, complianceAnalyzedAt: null },
              { qualityAnalyzedAt: null, complianceAnalyzedAt: { not: null } },
            ],
          },
        }),
        this.prisma.thumbnailAnalysis.groupBy({
          by: ['grade'],
          _count: { id: true },
          where: { qualityAnalyzedAt: { not: null } },
        }),
        this.prisma.thumbnailAnalysis.groupBy({
          by: ['complianceGrade'],
          _count: { id: true },
          where: { complianceGrade: { not: null }, complianceAnalyzedAt: { not: null } },
        }),
      ]);

      const gradeDistribution = { S: 0, A: 0, B: 0, C: 0, F: 0 };
      for (const g of gradeGroups) {
        const grade = g.grade as keyof typeof gradeDistribution;
        if (grade in gradeDistribution) {
          gradeDistribution[grade] = g._count.id;
        }
      }

      const complianceDistribution = { PASS: 0, WARN: 0, FAIL: 0 };
      for (const g of complianceGroups) {
        const cg = g.complianceGrade as keyof typeof complianceDistribution;
        if (cg && cg in complianceDistribution) {
          complianceDistribution[cg] = g._count.id;
        }
      }

      return {
        total,
        analyzed: fullyAnalyzed,
        partialCount,
        unclassifiedCount: total - fullyAnalyzed - partialCount,
        gradeDistribution,
        complianceDistribution,
      } satisfies SharedThumbnailAnalysisSummary;
    } catch {
      throw new InternalServerErrorException('썸네일 분석 요약 조회 실패');
    }
  }

  async analyzeProduct(productId: string, scope: AnalysisScope = 'all'): Promise<ThumbnailAnalysisItem> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { thumbnails: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    const rawImageUrl =
      product.imageUrl ??
      product.thumbnails[0]?.imageUrl ??
      null;

    const imageUrl = rawImageUrl
      ? this.thumbnailAiService.toCoupangOriginal(rawImageUrl)
      : null;

    // 이미지 스펙 사전 체크 (AI 불필요)
    let imageSpec: ImageSpec | null = null;
    if (imageUrl) {
      try {
        imageSpec = await this.thumbnailAiService.checkImageSpec(imageUrl);
      } catch (err) {
        this.logger.warn(`이미지 스펙 체크 실패 (${productId}): ${err instanceof Error ? err.message : err}`);
      }
    }

    const specHasFail = imageSpec?.issues.some((i) => i.severity === 'fail') ?? false;

    let result: AiAnalysisResult;

    if (!imageUrl) {
      result = this.thumbnailAiService.analyzeWithRules({ id: product.id, name: product.name, imageUrl: rawImageUrl });
    } else {
      const item = { imageUrl, productName: product.name, productId: product.id, category: product.category ?? undefined };

      if (scope === 'quality') {
        const qualityMap = await this.thumbnailAiService.analyzeQuality([item]);
        const qualityResult = qualityMap.get(product.id) ?? null;
        result = qualityResult ?? this.thumbnailAiService.analyzeWithRules({ id: product.id, name: product.name, imageUrl: rawImageUrl });
      } else if (scope === 'compliance') {
        const existing = await this.prisma.thumbnailAnalysis.findUnique({ where: { productId } });
        if (specHasFail) {
          result = {
            overallScore: existing?.overallScore ?? 0,
            grade: (existing?.grade ?? 'F') as AiAnalysisResult['grade'],
            scores: existing?.scores as unknown as AiAnalysisResult['scores'] ?? null,
            issues: (existing?.issues ?? []) as unknown as AiAnalysisResult['issues'],
            suggestions: (existing?.suggestions ?? []) as unknown as AiAnalysisResult['suggestions'],
            method: existing?.method === 'ai' ? 'ai' : 'rule',
            complianceGrade: 'FAIL',
            complianceScores: null,
          };
        } else {
          const complianceMap = await this.thumbnailAiService.checkCompliance([item]);
          const complianceResult = complianceMap.get(product.id) ?? null;
          result = {
            overallScore: existing?.overallScore ?? 0,
            grade: (existing?.grade ?? 'F') as AiAnalysisResult['grade'],
            scores: existing?.scores as unknown as AiAnalysisResult['scores'] ?? null,
            issues: (existing?.issues ?? []) as unknown as AiAnalysisResult['issues'],
            suggestions: (existing?.suggestions ?? []) as unknown as AiAnalysisResult['suggestions'],
            method: existing?.method === 'ai' ? 'ai' : 'rule',
            complianceGrade: complianceResult?.complianceGrade ?? null,
            complianceScores: complianceResult?.complianceScores ?? null,
          };
        }
      } else {
        // scope === 'all'
        const qualityMap = await this.thumbnailAiService.analyzeQuality([item]);
        const qualityResult = qualityMap.get(product.id) ?? null;
        const base = qualityResult ?? this.thumbnailAiService.analyzeWithRules({ id: product.id, name: product.name, imageUrl: rawImageUrl });

        if (specHasFail) {
          result = { ...base, complianceGrade: 'FAIL', complianceScores: null };
        } else {
          const complianceMap = await this.thumbnailAiService.checkCompliance([item]);
          const complianceResult = complianceMap.get(product.id) ?? null;
          result = {
            ...base,
            complianceGrade: complianceResult?.complianceGrade ?? null,
            complianceScores: complianceResult?.complianceScores ?? null,
          };
        }
      }
    }

    const now = new Date();
    const upsertData: Record<string, unknown> = {
      imageUrl: imageUrl ?? rawImageUrl ?? '',
      method: result.method,
      imageSpec: imageSpec as unknown as Prisma.InputJsonValue ?? undefined,
    };

    // scope에 따라 업데이트할 필드 결정
    if (scope === 'all' || scope === 'quality') {
      upsertData.overallScore = result.overallScore;
      upsertData.grade = result.grade;
      upsertData.scores = result.scores as unknown as Prisma.InputJsonValue ?? undefined;
      upsertData.issues = result.issues as unknown as Prisma.InputJsonValue;
      upsertData.suggestions = result.suggestions as unknown as Prisma.InputJsonValue;
      upsertData.qualityAnalyzedAt = now;
    }

    if (scope === 'all' || scope === 'compliance') {
      if (result.complianceGrade != null) {
        upsertData.complianceGrade = result.complianceGrade;
        upsertData.complianceScores = result.complianceScores as unknown as Prisma.InputJsonValue ?? undefined;
        upsertData.complianceAnalyzedAt = now;
      }
    }

    const saved = await this.prisma.thumbnailAnalysis.upsert({
      where: { productId },
      create: {
        productId,
        companyId: product.companyId,
        ...upsertData,
      } as Prisma.ThumbnailAnalysisUncheckedCreateInput,
      update: upsertData as Prisma.ThumbnailAnalysisUncheckedUpdateInput,
    });

    const qualityAnalyzed = !!(saved as { qualityAnalyzedAt?: Date | null }).qualityAnalyzedAt;
    const complianceAnalyzed = !!(saved as { complianceAnalyzedAt?: Date | null }).complianceAnalyzedAt;

    return {
      id: saved.id,
      productId,
      productName: product.name,
      imageUrl: saved.imageUrl,
      overallScore: saved.overallScore,
      grade: saved.grade,
      scores: saved.scores as Record<string, number> | null,
      issues: saved.issues as Array<{ type: string; severity: string; message: string }>,
      suggestions: saved.suggestions as string[],
      method: saved.method,
      analyzed: qualityAnalyzed && complianceAnalyzed,
      qualityAnalyzed,
      complianceAnalyzed,
      complianceGrade: (saved as { complianceGrade?: string | null }).complianceGrade ?? undefined,
      complianceScores: (saved as { complianceScores?: Record<string, unknown> | null }).complianceScores ?? null,
      imageSpec: ((saved as { imageSpec?: unknown }).imageSpec as ImageSpec | null) ?? null,
    };
  }

  async analyzeBatch(productIds: string[], scope: AnalysisScope = 'all'): Promise<ThumbnailAnalysisItem[]> {
    if (this.batchAbort) {
      throw new InternalServerErrorException('이미 배치 분석이 진행 중입니다. 취소 후 다시 시도하세요.');
    }

    const BATCH_SIZE = 10;
    const results: ThumbnailAnalysisItem[] = [];
    this.batchAbort = new AbortController();
    const signal = this.batchAbort.signal;

    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: { thumbnails: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    const itemsForBatch: Array<{ imageUrl: string; productName: string; productId: string; category?: string }> = [];
    const noImageProductIds: string[] = [];

    for (const productId of productIds) {
      const product = productMap.get(productId);
      if (!product) continue;

      const rawImageUrl = product.imageUrl ?? product.thumbnails[0]?.imageUrl ?? null;
      if (rawImageUrl) {
        itemsForBatch.push({
          imageUrl: this.thumbnailAiService.toCoupangOriginal(rawImageUrl),
          productName: product.name,
          productId: product.id,
          category: product.category ?? undefined,
        });
      } else {
        noImageProductIds.push(productId);
      }
    }

    // 배치 분석: 청크 단위로 멀티이미지 API 호출
    for (let i = 0; i < itemsForBatch.length; i += BATCH_SIZE) {
      if (signal.aborted) break;
      const chunk = itemsForBatch.slice(i, i + BATCH_SIZE);
      try {
        const [qualityMap, complianceMap] = await Promise.all([
          scope !== 'compliance' ? this.thumbnailAiService.analyzeQuality(chunk) : Promise.resolve(new Map()),
          scope !== 'quality' ? this.thumbnailAiService.checkCompliance(chunk) : Promise.resolve(new Map()),
        ]);

        for (const item of chunk) {
          const product = productMap.get(item.productId)!;
          const qualityResult = qualityMap.get(item.productId) ?? null;
          const complianceResult = complianceMap.get(item.productId) ?? null;

          let result: AiAnalysisResult;
          if (scope === 'compliance') {
            const existing = await this.prisma.thumbnailAnalysis.findUnique({ where: { productId: item.productId } });
            result = {
              overallScore: existing?.overallScore ?? 0,
              grade: (existing?.grade ?? 'F') as AiAnalysisResult['grade'],
              scores: existing?.scores as unknown as AiAnalysisResult['scores'] ?? null,
              issues: (existing?.issues ?? []) as unknown as AiAnalysisResult['issues'],
              suggestions: (existing?.suggestions ?? []) as unknown as AiAnalysisResult['suggestions'],
              method: existing?.method === 'ai' ? 'ai' : 'rule',
              complianceGrade: complianceResult?.complianceGrade ?? null,
              complianceScores: complianceResult?.complianceScores ?? null,
            };
          } else {
            const base = qualityResult ?? this.thumbnailAiService.analyzeWithRules({
              id: product.id, name: product.name, imageUrl: item.imageUrl,
            });
            result = {
              ...base,
              complianceGrade: complianceResult?.complianceGrade ?? null,
              complianceScores: complianceResult?.complianceScores ?? null,
            };
          }

          try {
            const saved = await this.saveAnalysisResult(product, item.imageUrl, result);
            results.push(saved);
          } catch (err) {
            this.logger.warn(`분석 결과 저장 실패 (${item.productId}): ${err instanceof Error ? err.message : err}`);
          }
        }
      } catch (err) {
        this.logger.warn(`배치 분석 실패, 개별 fallback: ${err instanceof Error ? err.message : err}`);
        for (const item of chunk) {
          try {
            const saved = await this.analyzeProduct(item.productId, scope);
            results.push(saved);
          } catch (innerErr) {
            this.logger.warn(`개별 분석 실패 (${item.productId}): ${innerErr instanceof Error ? innerErr.message : innerErr}`);
          }
        }
      }
    }

    for (const productId of noImageProductIds) {
      if (signal.aborted) break;
      try {
        const saved = await this.analyzeProduct(productId, scope);
        results.push(saved);
      } catch (err) {
        this.logger.warn(`이미지 없는 상품 분석 실패 (${productId}): ${err instanceof Error ? err.message : err}`);
      }
    }

    this.batchAbort = null;
    return results;
  }

  private async saveAnalysisResult(
    product: { id: string; companyId: string; name: string },
    imageUrl: string,
    result: AiAnalysisResult,
  ): Promise<ThumbnailAnalysisItem> {
    const now = new Date();
    const upsertData = {
      imageUrl,
      overallScore: result.overallScore,
      grade: result.grade,
      scores: result.scores as unknown as Prisma.InputJsonValue ?? undefined,
      issues: result.issues as unknown as Prisma.InputJsonValue,
      suggestions: result.suggestions as unknown as Prisma.InputJsonValue,
      method: result.method,
      complianceGrade: result.complianceGrade ?? undefined,
      complianceScores: result.complianceScores as unknown as Prisma.InputJsonValue ?? undefined,
      qualityAnalyzedAt: now,
      complianceAnalyzedAt: result.complianceGrade != null ? now : undefined,
    };

    const saved = await this.prisma.thumbnailAnalysis.upsert({
      where: { productId: product.id },
      create: {
        productId: product.id,
        companyId: product.companyId,
        ...upsertData,
      } as Prisma.ThumbnailAnalysisUncheckedCreateInput,
      update: upsertData as Prisma.ThumbnailAnalysisUncheckedUpdateInput,
    });

    const qualityAnalyzed = !!(saved as { qualityAnalyzedAt?: Date | null }).qualityAnalyzedAt;
    const complianceAnalyzed = !!(saved as { complianceAnalyzedAt?: Date | null }).complianceAnalyzedAt;

    return {
      id: saved.id,
      productId: product.id,
      productName: product.name,
      imageUrl: saved.imageUrl,
      overallScore: saved.overallScore,
      grade: saved.grade,
      scores: saved.scores as Record<string, number> | null,
      issues: saved.issues as Array<{ type: string; severity: string; message: string }>,
      suggestions: saved.suggestions as string[],
      method: saved.method,
      analyzed: qualityAnalyzed && complianceAnalyzed,
      qualityAnalyzed,
      complianceAnalyzed,
      complianceGrade: (saved as { complianceGrade?: string | null }).complianceGrade ?? undefined,
      complianceScores: (saved as { complianceScores?: Record<string, unknown> | null }).complianceScores ?? null,
      imageSpec: ((saved as { imageSpec?: unknown }).imageSpec as ImageSpec | null) ?? null,
    };
  }

  async analyzeDirectImage(
    imageUrl: string,
    productName?: string,
  ): Promise<ReturnType<ThumbnailAiService['analyzeWithRules']>> {
    const name = productName ?? '직접 분석';
    const item = { imageUrl, productName: name, productId: 'direct', category: undefined };

    const [qualityMap, complianceMap] = await Promise.all([
      this.thumbnailAiService.analyzeQuality([item]),
      this.thumbnailAiService.checkCompliance([item]),
    ]);

    const base = qualityMap.get('direct') ?? this.thumbnailAiService.analyzeWithRules({
      id: 'direct',
      name,
      imageUrl,
    });

    const complianceResult = complianceMap.get('direct') ?? null;
    return {
      ...base,
      complianceGrade: complianceResult?.complianceGrade ?? null,
      complianceScores: complianceResult?.complianceScores ?? null,
    };
  }
}

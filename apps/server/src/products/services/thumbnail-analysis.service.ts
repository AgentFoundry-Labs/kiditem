import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ThumbnailAiService } from './thumbnail-ai.service';
import type { ThumbnailAnalysisItem, ThumbnailAnalysisSummaryInternal, ThumbnailAnalysisListResponse } from './types';
import type { ThumbnailAnalysisSummary as SharedThumbnailAnalysisSummary } from '@kiditem/shared';

export type { ThumbnailAnalysisItem, ThumbnailAnalysisListResponse } from './types';
export type ThumbnailAnalysisSummary = ThumbnailAnalysisSummaryInternal;

@Injectable()
export class ThumbnailAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly thumbnailAiService: ThumbnailAiService,
  ) {}

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

      for (const product of products) {
        const analysis = product.thumbnailAnalysis;
        const imageUrl = product.imageUrl ?? product.thumbnailUrl ?? null;

        if (analysis) {
          const grade = analysis.grade as keyof typeof gradeDistribution;
          if (grade in gradeDistribution) {
            gradeDistribution[grade]++;
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
            analyzed: true,
          };

          if (!query.grade || item.grade === query.grade) {
            analyzedItems.push(item);
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
          };
          unclassifiedItems.push(item);
        }
      }

      const allResults = [...analyzedItems, ...unclassifiedItems];

      return {
        total: products.length,
        analyzed: analyzedItems.length,
        unclassifiedCount: unclassifiedItems.length,
        gradeDistribution,
        allResults,
        unclassified: unclassifiedItems,
      };
    } catch {
      throw new InternalServerErrorException('썸네일 분석 목록 조회 실패');
    }
  }

  async getSummary(): Promise<ThumbnailAnalysisSummary> {
    try {
      const [total, analyzed, gradeGroups] = await Promise.all([
        this.prisma.product.count({ where: { isDeleted: false } }),
        this.prisma.thumbnailAnalysis.count(),
        this.prisma.thumbnailAnalysis.groupBy({
          by: ['grade'],
          _count: { id: true },
        }),
      ]);

      const gradeDistribution = { S: 0, A: 0, B: 0, C: 0, F: 0 };
      for (const g of gradeGroups) {
        const grade = g.grade as keyof typeof gradeDistribution;
        if (grade in gradeDistribution) {
          gradeDistribution[grade] = g._count.id;
        }
      }

      return {
        total,
        analyzed,
        unclassifiedCount: total - analyzed,
        gradeDistribution,
      } satisfies SharedThumbnailAnalysisSummary;
    } catch {
      throw new InternalServerErrorException('썸네일 분석 요약 조회 실패');
    }
  }

  async analyzeProduct(productId: string): Promise<ThumbnailAnalysisItem> {
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

    let result = imageUrl
      ? await this.thumbnailAiService.analyzeWithGeminiVision(imageUrl, product.name, product.category ?? undefined)
      : null;

    if (!result) {
      result = this.thumbnailAiService.analyzeWithRules({
        id: product.id,
        name: product.name,
        imageUrl: rawImageUrl,
      });
    }

    const saved = await this.prisma.thumbnailAnalysis.upsert({
      where: { productId },
      create: {
        productId,
        companyId: product.companyId,
        imageUrl: imageUrl ?? rawImageUrl ?? '',
        overallScore: result.overallScore,
        grade: result.grade,
        scores: result.scores as unknown as Prisma.InputJsonValue ?? undefined,
        issues: result.issues as unknown as Prisma.InputJsonValue,
        suggestions: result.suggestions as unknown as Prisma.InputJsonValue,
        method: result.method,
      },
      update: {
        imageUrl: imageUrl ?? rawImageUrl ?? '',
        overallScore: result.overallScore,
        grade: result.grade,
        scores: result.scores as unknown as Prisma.InputJsonValue ?? undefined,
        issues: result.issues as unknown as Prisma.InputJsonValue,
        suggestions: result.suggestions as unknown as Prisma.InputJsonValue,
        method: result.method,
      },
    });

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
      analyzed: true,
    };
  }

  async analyzeBatch(productIds: string[]): Promise<ThumbnailAnalysisItem[]> {
    const results: ThumbnailAnalysisItem[] = [];
    for (const productId of productIds) {
      try {
        const result = await this.analyzeProduct(productId);
        results.push(result);
      } catch {
        // continue with remaining
      }
    }
    return results;
  }

  async analyzeDirectImage(
    imageUrl: string,
    productName?: string,
  ): Promise<ReturnType<ThumbnailAiService['analyzeWithRules']>> {
    const result = await this.thumbnailAiService.analyzeWithGeminiVision(
      imageUrl,
      productName ?? '직접 분석',
    );

    if (!result) {
      return this.thumbnailAiService.analyzeWithRules({
        id: 'direct',
        name: productName ?? '직접 분석',
        imageUrl,
      });
    }

    return result;
  }
}

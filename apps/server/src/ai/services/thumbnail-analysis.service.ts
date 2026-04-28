import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ComplianceScores,
  ImageSpec,
  ThumbnailAnalysisListResponse,
  ThumbnailAnalysisResult,
  ThumbnailAnalysisSummary,
  ThumbnailScores,
} from '@kiditem/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { AnalysisScope } from '../dto/thumbnail-analyze.dto';

const EMPTY_GRADE_DIST = { S: 0, A: 0, B: 0, C: 0, F: 0 } as const;
const EMPTY_COMPLIANCE_DIST = { PASS: 0, WARN: 0, FAIL: 0 } as const;

type MasterRow = {
  id: string;
  name: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  images: Array<{ url: string; role: string; sortOrder: number; isPrimary: boolean }>;
  createdAt: Date;
};

type AnalysisRow = Awaited<
  ReturnType<typeof PrismaService.prototype.thumbnailAnalysis.findMany>
>[number] & {
  recompose: Prisma.JsonValue;
  master: {
    id: string;
    name: string;
    imageUrl: string | null;
    thumbnailUrl: string | null;
    images: Array<{ url: string; role: string; sortOrder: number; isPrimary: boolean }>;
  } | null;
};

const MASTER_IMAGE_SELECT: Prisma.MasterProduct$imagesArgs = {
  where: { isDeleted: false },
  select: { url: true, role: true, sortOrder: true, isPrimary: true },
  orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
};

const isDisplayable = (u: string | null | undefined): u is string =>
  !!u &&
  (u.startsWith('http://') ||
    u.startsWith('https://') ||
    u.startsWith('/generated-thumbnails/'));

function resolveMasterImage(m: {
  imageUrl: string | null;
  thumbnailUrl: string | null;
  images: Array<{ url: string; role: string; sortOrder: number; isPrimary: boolean }>;
}): string | null {
  if (isDisplayable(m.imageUrl)) return m.imageUrl;
  const primary = m.images.find((img) => img.isPrimary && isDisplayable(img.url));
  if (primary) return primary.url;
  const first = m.images.find((img) => isDisplayable(img.url));
  if (first) return first.url;
  if (isDisplayable(m.thumbnailUrl)) return m.thumbnailUrl;
  return null;
}

@Injectable()
export class ThumbnailAnalysisService {
  private readonly logger = new Logger(ThumbnailAnalysisService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAllWithAnalysis(companyId: string): Promise<ThumbnailAnalysisListResponse> {
    const [masters, analyses] = await Promise.all([
      this.prisma.masterProduct.findMany({
        where: { companyId, isDeleted: false, pipelineStep: null },
        select: {
          id: true,
          name: true,
          imageUrl: true,
          thumbnailUrl: true,
          images: MASTER_IMAGE_SELECT,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.thumbnailAnalysis.findMany({
        where: { companyId },
        orderBy: { updatedAt: 'desc' },
        include: {
          master: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
              thumbnailUrl: true,
              images: MASTER_IMAGE_SELECT,
            },
          },
        },
      }),
    ]);

    const analyzedMasterIds = new Set(
      analyses
        .filter((a) => a.qualityAnalyzedAt !== null && a.complianceAnalyzedAt !== null)
        .map((a) => a.masterId),
    );

    const allResults: ThumbnailAnalysisResult[] = (analyses as AnalysisRow[]).map((a) =>
      this.toResult(a, a.master),
    );

    const unclassified: ThumbnailAnalysisResult[] = (masters as MasterRow[])
      .filter((m) => !analyzedMasterIds.has(m.id))
      .map((m) => this.unclassifiedResult(m));

    const gradeDistribution: Record<'S' | 'A' | 'B' | 'C' | 'F', number> = {
      ...EMPTY_GRADE_DIST,
    };
    const complianceDistribution: Record<'PASS' | 'WARN' | 'FAIL', number> = {
      ...EMPTY_COMPLIANCE_DIST,
    };
    let partialCount = 0;
    let qualityAnalyzedCount = 0;
    for (const a of analyses) {
      if (!a.qualityAnalyzedAt) continue;
      qualityAnalyzedCount += 1;
      if (a.grade in gradeDistribution) {
        gradeDistribution[a.grade as keyof typeof gradeDistribution] += 1;
      }
      if (a.complianceGrade && a.complianceGrade in complianceDistribution) {
        complianceDistribution[a.complianceGrade as keyof typeof complianceDistribution] += 1;
      }
      if (!a.complianceAnalyzedAt) partialCount += 1;
    }

    return {
      total: masters.length,
      analyzed: qualityAnalyzedCount,
      partialCount,
      unclassifiedCount: unclassified.length,
      gradeDistribution,
      complianceDistribution,
      allResults,
      unclassified,
    } satisfies ThumbnailAnalysisListResponse;
  }

  async getSummary(companyId: string): Promise<ThumbnailAnalysisSummary> {
    const [masterCount, analyses] = await Promise.all([
      this.prisma.masterProduct.count({
        where: { companyId, isDeleted: false, pipelineStep: null },
      }),
      this.prisma.thumbnailAnalysis.findMany({
        where: { companyId },
        select: {
          grade: true,
          complianceGrade: true,
          qualityAnalyzedAt: true,
          complianceAnalyzedAt: true,
        },
      }),
    ]);

    const gradeDistribution = { ...EMPTY_GRADE_DIST };
    const complianceDistribution = { ...EMPTY_COMPLIANCE_DIST };
    let analyzed = 0;
    let partialCount = 0;
    for (const a of analyses) {
      if (!a.qualityAnalyzedAt) continue;
      analyzed += 1;
      if (a.grade in gradeDistribution) {
        gradeDistribution[a.grade as keyof typeof gradeDistribution] += 1;
      }
      if (a.complianceGrade && a.complianceGrade in complianceDistribution) {
        complianceDistribution[a.complianceGrade as keyof typeof complianceDistribution] += 1;
      }
      if (!a.complianceAnalyzedAt) partialCount += 1;
    }

    return {
      total: masterCount,
      analyzed,
      partialCount,
      unclassifiedCount: Math.max(masterCount - analyzed, 0),
      gradeDistribution,
      complianceDistribution,
    } satisfies ThumbnailAnalysisSummary;
  }

  /**
   * Rule-based 분석 — 현재 main 에는 Gemini Vision 호출 경로가 연결되어 있지 않다.
   * 이미지 존재 여부만 확인하고 deterministic baseline (method='rule') 으로 row 를 upsert.
   * 사용자에게는 method 라벨로 "룰 기반" 임을 노출 → 가짜 AI 결과로 위장하지 않음.
   */
  async analyzeProduct(
    productId: string,
    companyId: string,
    _scope: AnalysisScope,
  ): Promise<ThumbnailAnalysisResult> {
    const master = await this.prisma.masterProduct.findFirst({
      where: { id: productId, companyId, isDeleted: false },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        thumbnailUrl: true,
        images: MASTER_IMAGE_SELECT,
        createdAt: true,
      },
    });
    if (!master) throw new NotFoundException(`Master ${productId} not found`);
    const imageUrl = resolveMasterImage(master);
    if (!imageUrl) {
      throw new BadRequestException('master 의 표시 가능한 이미지가 없어 분석을 시작할 수 없습니다');
    }

    const now = new Date();
    const grade = 'C';
    const overallScore = 50;
    const upserted = await this.prisma.thumbnailAnalysis.upsert({
      where: { masterId: master.id },
      create: {
        masterId: master.id,
        companyId,
        imageUrl,
        overallScore,
        grade,
        issues: [],
        suggestions: [],
        method: 'rule',
        qualityAnalyzedAt: now,
      },
      update: {
        imageUrl,
        overallScore,
        grade,
        method: 'rule',
        qualityAnalyzedAt: now,
      },
      include: {
        master: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            thumbnailUrl: true,
            images: MASTER_IMAGE_SELECT,
          },
        },
      },
    });

    return this.toResult(upserted as AnalysisRow, upserted.master);
  }

  /**
   * imageUrl 직접 분석 — DB 미저장. 진짜 AI 분류기가 없으므로 honest baseline 만 반환.
   */
  analyzeDirectImage(imageUrl: string, productName?: string): ThumbnailAnalysisResult {
    const now = new Date();
    return {
      id: `direct-${Date.now()}`,
      productId: '',
      productName: productName ?? '',
      imageUrl,
      overallScore: 50,
      grade: 'C',
      scores: null,
      issues: [],
      suggestions: [],
      method: 'rule',
      analyzed: true,
      qualityAnalyzed: true,
      complianceAnalyzed: false,
      complianceGrade: null,
      complianceScores: null,
      imageSpec: null,
      recompose: null,
      createdAt: now.toISOString(),
    } satisfies ThumbnailAnalysisResult;
  }

  async analyzeBatch(
    productIds: string[],
    companyId: string,
    scope: AnalysisScope,
  ): Promise<ThumbnailAnalysisResult[]> {
    const results: ThumbnailAnalysisResult[] = [];
    for (const id of productIds) {
      try {
        results.push(await this.analyzeProduct(id, companyId, scope));
      } catch (err) {
        this.logger.warn(
          `analyzeBatch skip ${id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return results;
  }

  cancelBatch(_companyId: string): { cancelled: boolean } {
    // 현재 구현은 inflight batch 추적이 없다. honest 응답 — 취소할 게 없다.
    return { cancelled: false };
  }

  /**
   * 외부 image-spec probe (HEAD/Sharp) 가 main 에 연결되어 있지 않다.
   * 가짜 dimensions 로 위장하지 말고 truthful unavailable 로 응답.
   */
  checkImageSpec(_imageUrl: string): ImageSpec {
    throw new ServiceUnavailableException('image_spec_probe_not_connected');
  }

  /**
   * pre-inspect — master 별 이미지 존재 여부만 확인.
   * 실제 spec probe 가 없으므로 imageUrl 만 보고 processed/failed 로 분류.
   */
  async preInspect(
    productIds: string[] | undefined,
    companyId: string,
  ): Promise<{ processed: number; failed: number }> {
    const where: Prisma.MasterProductWhereInput = { companyId, isDeleted: false };
    if (productIds?.length) where.id = { in: productIds };
    const masters = await this.prisma.masterProduct.findMany({
      where,
      select: { id: true, imageUrl: true, thumbnailUrl: true, images: MASTER_IMAGE_SELECT },
    });
    let processed = 0;
    let failed = 0;
    for (const m of masters) {
      if (resolveMasterImage(m)) processed += 1;
      else failed += 1;
    }
    return { processed, failed };
  }

  // ─── helpers ────────────────────────────────────────────────────────

  private toResult(
    a: AnalysisRow,
    master: AnalysisRow['master'],
  ): ThumbnailAnalysisResult {
    const fallback = master ? resolveMasterImage(master) : null;
    return {
      id: a.id,
      productId: a.masterId,
      productName: master?.name ?? '',
      imageUrl: isDisplayable(a.imageUrl) ? a.imageUrl : fallback,
      overallScore: a.overallScore,
      grade: a.grade,
      scores: (a.scores as ThumbnailScores | null) ?? null,
      issues: (a.issues as ThumbnailAnalysisResult['issues']) ?? [],
      suggestions: (a.suggestions as string[]) ?? [],
      method: a.method ?? 'rule',
      analyzed: !!a.qualityAnalyzedAt,
      qualityAnalyzed: !!a.qualityAnalyzedAt,
      complianceAnalyzed: !!a.complianceAnalyzedAt,
      complianceGrade: a.complianceGrade ?? null,
      complianceScores: (a.complianceScores as ComplianceScores | null) ?? null,
      imageSpec: (a.imageSpec as ImageSpec | null) ?? null,
      recompose: (a.recompose as ThumbnailAnalysisResult['recompose']) ?? null,
      createdAt: a.createdAt.toISOString(),
    } satisfies ThumbnailAnalysisResult;
  }

  private unclassifiedResult(m: MasterRow): ThumbnailAnalysisResult {
    return {
      id: m.id,
      productId: m.id,
      productName: m.name,
      imageUrl: resolveMasterImage(m),
      overallScore: 0,
      grade: 'F',
      scores: null,
      issues: [],
      suggestions: [],
      method: 'pending',
      analyzed: false,
      qualityAnalyzed: false,
      complianceAnalyzed: false,
      complianceGrade: null,
      complianceScores: null,
      imageSpec: null,
      recompose: null,
      createdAt: m.createdAt.toISOString(),
    } satisfies ThumbnailAnalysisResult;
  }
}

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
  RecomposeVariantClassification,
} from '@kiditem/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { AnalysisScope } from '../dto/thumbnail-analyze.dto';
import {
  THUMBNAIL_MASTER_IMAGE_SELECT,
  isDisplayableThumbnailUrl,
  resolveMasterThumbnailImage,
  type ThumbnailMasterImageRow,
} from './thumbnail-master-image-resolver';
import {
  ThumbnailVisionAiService,
  type ThumbnailAiItem,
} from './thumbnail-vision-ai.service';
import { ThumbnailRecomposeService } from './thumbnail-recompose.service';

const EMPTY_GRADE_DIST = { S: 0, A: 0, B: 0, C: 0, F: 0 } as const;
const EMPTY_COMPLIANCE_DIST = { PASS: 0, WARN: 0, FAIL: 0 } as const;

type MasterRow = {
  id: string;
  name: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  images: ThumbnailMasterImageRow[];
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
    images: ThumbnailMasterImageRow[];
  } | null;
};

@Injectable()
export class ThumbnailAnalysisService {
  private readonly logger = new Logger(ThumbnailAnalysisService.name);
  private readonly batchAborts = new Map<string, AbortController>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly vision: ThumbnailVisionAiService,
    private readonly recomposeService: ThumbnailRecomposeService,
  ) {}

  // ─── 목록 / 요약 ─────────────────────────────────────────────

  async findAllWithAnalysis(companyId: string): Promise<ThumbnailAnalysisListResponse> {
    const [masters, analyses] = await Promise.all([
      this.prisma.masterProduct.findMany({
        where: { companyId, isDeleted: false, pipelineStep: null },
        select: {
          id: true,
          name: true,
          imageUrl: true,
          thumbnailUrl: true,
          images: THUMBNAIL_MASTER_IMAGE_SELECT,
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
              images: THUMBNAIL_MASTER_IMAGE_SELECT,
            },
          },
        },
      }),
    ]);

    const analysisRows = analyses as AnalysisRow[];
    const analysisByMasterId = new Map(analysisRows.map((a) => [a.masterId, a]));
    const qualityAnalyzedMasterIds = new Set(
      analysisRows.filter((a) => a.qualityAnalyzedAt !== null).map((a) => a.masterId),
    );

    const allResults: ThumbnailAnalysisResult[] = analysisRows
      .filter((a) => this.hasActualAnalysis(a))
      .map((a) => this.toResult(a, a.master));

    const unclassified: ThumbnailAnalysisResult[] = (masters as MasterRow[])
      .filter((m) => !qualityAnalyzedMasterIds.has(m.id))
      .map((m) => this.unclassifiedResult(m, analysisByMasterId.get(m.id)));

    const gradeDistribution: Record<'S' | 'A' | 'B' | 'C' | 'F', number> = {
      ...EMPTY_GRADE_DIST,
    };
    const complianceDistribution: Record<'PASS' | 'WARN' | 'FAIL', number> = {
      ...EMPTY_COMPLIANCE_DIST,
    };
    let partialCount = 0;
    let qualityAnalyzedCount = 0;
    for (const a of analyses) {
      const hasQuality = a.qualityAnalyzedAt !== null;
      const hasCompliance = a.complianceAnalyzedAt !== null;
      if (hasQuality) {
        qualityAnalyzedCount += 1;
        if (a.grade in gradeDistribution) {
          gradeDistribution[a.grade as keyof typeof gradeDistribution] += 1;
        }
      }
      if (hasCompliance && a.complianceGrade && a.complianceGrade in complianceDistribution) {
        complianceDistribution[a.complianceGrade as keyof typeof complianceDistribution] += 1;
      }
      if (hasQuality !== hasCompliance) partialCount += 1;
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
      const hasQuality = a.qualityAnalyzedAt !== null;
      const hasCompliance = a.complianceAnalyzedAt !== null;
      if (hasQuality) {
        analyzed += 1;
        if (a.grade in gradeDistribution) {
          gradeDistribution[a.grade as keyof typeof gradeDistribution] += 1;
        }
      }
      if (hasCompliance && a.complianceGrade && a.complianceGrade in complianceDistribution) {
        complianceDistribution[a.complianceGrade as keyof typeof complianceDistribution] += 1;
      }
      if (hasQuality !== hasCompliance) partialCount += 1;
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

  // ─── 분석 / 사전검수 ─────────────────────────────────────────────

  /**
   * 단일 master 분석 — `scope` 에 따라 quality / compliance / 둘 다 갱신.
   * AI 호출 결과를 ThumbnailAnalysis 에 upsert. 갱신되지 않는 다른 branch 의
   * 기존 값은 보존된다.
   */
  async analyzeProduct(
    productId: string,
    companyId: string,
    scope: AnalysisScope,
    signal?: AbortSignal,
  ): Promise<ThumbnailAnalysisResult> {
    const master = await this.prisma.masterProduct.findFirst({
      where: { id: productId, companyId, isDeleted: false },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        thumbnailUrl: true,
        category: true,
        images: THUMBNAIL_MASTER_IMAGE_SELECT,
        createdAt: true,
      },
    });
    if (!master) throw new NotFoundException(`Master ${productId} not found`);
    const imageUrl = resolveMasterThumbnailImage(master);
    if (!imageUrl) {
      throw new BadRequestException('master 의 표시 가능한 이미지가 없어 분석을 시작할 수 없습니다');
    }

    const visionItem: ThumbnailAiItem = {
      productId: master.id,
      productName: master.name,
      imageUrl,
      category: master.category ?? null,
    };

    const now = new Date();
    const update: Prisma.ThumbnailAnalysisUpdateInput = { imageUrl };
    const create: Prisma.ThumbnailAnalysisCreateInput = {
      master: { connect: { id: master.id } },
      company: { connect: { id: companyId } },
      imageUrl,
      overallScore: 0,
      grade: 'F',
      issues: [] as Prisma.InputJsonValue,
      suggestions: [] as Prisma.InputJsonValue,
      method: 'ai',
    };

    const wantsQuality = scope === 'all' || scope === 'quality';
    const wantsCompliance = scope === 'all' || scope === 'compliance';
    let recompose: RecomposeVariantClassification | undefined;

    if (wantsQuality) {
      const [qmap, recomposeResult] = await Promise.all([
        this.vision.analyzeQuality([visionItem], signal),
        this.recomposeService.classifyByImage(imageUrl),
      ]);
      const q = qmap.get(master.id);
      if (!q) {
        throw new ServiceUnavailableException('thumbnail_ai_quality_result_missing');
      }
      recompose = recomposeResult;
      update.overallScore = q.overallScore;
      update.grade = q.grade;
      update.scores = (q.scores ?? Prisma.JsonNull) as Prisma.InputJsonValue;
      update.issues = (q.issues as unknown as Prisma.InputJsonValue) ?? [];
      update.suggestions = q.suggestions as Prisma.InputJsonValue;
      update.method = q.method;
      update.qualityAnalyzedAt = now;
      create.overallScore = q.overallScore;
      create.grade = q.grade;
      create.scores = (q.scores ?? undefined) as Prisma.InputJsonValue;
      create.issues = q.issues as unknown as Prisma.InputJsonValue;
      create.suggestions = q.suggestions as Prisma.InputJsonValue;
      create.method = q.method;
      create.qualityAnalyzedAt = now;
    }

    if (wantsCompliance) {
      const [imageSpec, cmap] = await Promise.all([
        this.vision.checkImageSpec(imageUrl),
        this.vision.checkCompliance([visionItem], signal),
      ]);
      const c = cmap.get(master.id);
      if (!c) {
        throw new ServiceUnavailableException('thumbnail_ai_compliance_result_missing');
      }
      update.complianceGrade = c.complianceGrade;
      update.complianceScores = c.complianceScores as unknown as Prisma.InputJsonValue;
      update.complianceAnalyzedAt = now;
      create.complianceGrade = c.complianceGrade;
      create.complianceScores = c.complianceScores as unknown as Prisma.InputJsonValue;
      create.complianceAnalyzedAt = now;
      if (imageSpec) {
        update.imageSpec = imageSpec as unknown as Prisma.InputJsonValue;
        create.imageSpec = imageSpec as unknown as Prisma.InputJsonValue;
      }
    }

    if (recompose !== undefined) {
      update.recompose = recompose as unknown as Prisma.InputJsonValue;
      create.recompose = recompose as unknown as Prisma.InputJsonValue;
    }

    const upserted = await this.prisma.thumbnailAnalysis.upsert({
      where: { masterId: master.id },
      create,
      update,
      include: {
        master: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            thumbnailUrl: true,
            images: THUMBNAIL_MASTER_IMAGE_SELECT,
          },
        },
      },
    });

    return this.toResult(upserted as AnalysisRow, upserted.master);
  }

  /**
   * imageUrl 직접 분석 — DB 미저장. scope 별로 quality / compliance 호출 결과를 즉시 반환.
   */
  async analyzeDirectImage(
    imageUrl: string,
    productName?: string,
    scope: AnalysisScope = 'all',
  ): Promise<ThumbnailAnalysisResult> {
    const visionItem: ThumbnailAiItem = {
      productId: 'direct',
      productName: productName ?? '',
      imageUrl,
      category: null,
    };

    let overallScore = 0;
    let grade: 'S' | 'A' | 'B' | 'C' | 'F' = 'F';
    let scores: ThumbnailScores | null = null;
    let issues: ThumbnailAnalysisResult['issues'] = [];
    let suggestions: string[] = [];
    let method: string = 'ai';
    let qualityAnalyzed = false;

    let complianceGrade: string | null = null;
    let complianceScores: ComplianceScores | null = null;
    let imageSpec: ImageSpec | null = null;
    let recompose: RecomposeVariantClassification | null = null;
    let complianceAnalyzed = false;

    if (scope === 'all' || scope === 'quality') {
      const [qmap, recomposeVal] = await Promise.all([
        this.vision.analyzeQuality([visionItem]),
        this.recomposeService.classifyByImage(imageUrl),
      ]);
      const q = qmap.get('direct');
      if (!q) {
        throw new ServiceUnavailableException('thumbnail_ai_quality_result_missing');
      }
      overallScore = q.overallScore;
      grade = q.grade;
      scores = q.scores;
      issues = q.issues;
      suggestions = q.suggestions;
      method = q.method;
      qualityAnalyzed = true;
      recompose = recomposeVal;
    }

    if (scope === 'all' || scope === 'compliance') {
      const [spec, cmap] = await Promise.all([
        this.vision.checkImageSpec(imageUrl),
        this.vision.checkCompliance([visionItem]),
      ]);
      imageSpec = spec;
      const c = cmap.get('direct');
      if (!c) {
        throw new ServiceUnavailableException('thumbnail_ai_compliance_result_missing');
      }
      complianceGrade = c.complianceGrade;
      complianceScores = c.complianceScores;
      complianceAnalyzed = true;
    }

    return {
      id: `direct-${Date.now()}`,
      productId: '',
      productName: productName ?? '',
      imageUrl,
      overallScore,
      grade,
      scores,
      issues,
      suggestions,
      method,
      analyzed: qualityAnalyzed,
      qualityAnalyzed,
      complianceAnalyzed,
      complianceGrade,
      complianceScores,
      imageSpec,
      recompose,
      createdAt: new Date().toISOString(),
    } satisfies ThumbnailAnalysisResult;
  }

  /**
   * Company-scoped batch analysis. AbortController 가 회사별로 1개 유지되어
   * 같은 회사가 새 batch 를 시작하면 이전 inflight 는 cancel.
   */
  async analyzeBatch(
    productIds: string[],
    companyId: string,
    scope: AnalysisScope,
  ): Promise<ThumbnailAnalysisResult[]> {
    if (productIds.length === 0) return [];
    const previous = this.batchAborts.get(companyId);
    if (previous) previous.abort();
    const controller = new AbortController();
    this.batchAborts.set(companyId, controller);

    const results: ThumbnailAnalysisResult[] = [];
    try {
      for (const id of productIds) {
        if (controller.signal.aborted) break;
        try {
          results.push(await this.analyzeProduct(id, companyId, scope, controller.signal));
        } catch (err) {
          if (controller.signal.aborted || this.isAbortError(err)) break;
          this.logger.warn(
            `analyzeBatch skip ${id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } finally {
      // Only clear if this is still the active controller (a newer batch
      // would have replaced it).
      if (this.batchAborts.get(companyId) === controller) {
        this.batchAborts.delete(companyId);
      }
    }
    return results;
  }

  cancelBatch(companyId: string): { cancelled: boolean } {
    const controller = this.batchAborts.get(companyId);
    const hasInflight = Boolean(controller);
    if (controller) {
      controller.abort();
      this.batchAborts.delete(companyId);
    }
    return { cancelled: hasInflight };
  }

  /**
   * 외부 image-spec probe — `ThumbnailVisionAiService.checkImageSpec` 위임.
   * 호출자가 raw imageUrl 을 줄 때만 사용한다 (controller 의 image-spec 엔드포인트).
   */
  checkImageSpec(imageUrl: string): Promise<ImageSpec> {
    return this.vision.checkImageSpec(imageUrl);
  }

  /**
   * pre-inspect — 스펙 probe 결과를 ThumbnailAnalysis.imageSpec 에 upsert.
   * fail 카운트는 단순 count, 부분 실패가 batch 전체를 abort 하지 않는다.
   */
  async preInspect(
    productIds: string[] | undefined,
    companyId: string,
  ): Promise<{ processed: number; failed: number }> {
    const where: Prisma.MasterProductWhereInput = { companyId, isDeleted: false };
    if (productIds?.length) where.id = { in: productIds };
    const masters = await this.prisma.masterProduct.findMany({
      where,
      select: {
        id: true,
        imageUrl: true,
        thumbnailUrl: true,
        images: THUMBNAIL_MASTER_IMAGE_SELECT,
      },
    });
    let processed = 0;
    let failed = 0;
    for (const m of masters) {
      const imageUrl = resolveMasterThumbnailImage(m);
      if (!imageUrl) {
        failed += 1;
        continue;
      }
      try {
        const spec = await this.vision.checkImageSpec(imageUrl);
        await this.prisma.thumbnailAnalysis.upsert({
          where: { masterId: m.id },
          create: {
            masterId: m.id,
            companyId,
            imageUrl,
            overallScore: 0,
            grade: 'F',
            issues: [] as Prisma.InputJsonValue,
            suggestions: [] as Prisma.InputJsonValue,
            method: 'ai',
            imageSpec: spec as unknown as Prisma.InputJsonValue,
          },
          update: {
            imageUrl,
            imageSpec: spec as unknown as Prisma.InputJsonValue,
          },
        });
        processed += 1;
      } catch (err) {
        this.logger.warn(
          `preInspect skip ${m.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
        failed += 1;
      }
    }
    return { processed, failed };
  }

  // ─── 내부 helpers ──────────────────────────────────────────────────────

  private isAbortError(err: unknown): boolean {
    return err instanceof Error && err.message === 'ABORTED';
  }

  private hasActualAnalysis(a: AnalysisRow): boolean {
    return a.qualityAnalyzedAt !== null || a.complianceAnalyzedAt !== null;
  }

  private toResult(
    a: AnalysisRow,
    master: AnalysisRow['master'],
  ): ThumbnailAnalysisResult {
    const fallback = master ? resolveMasterThumbnailImage(master) : null;
    return {
      id: a.id,
      productId: a.masterId,
      productName: master?.name ?? '',
      imageUrl: isDisplayableThumbnailUrl(a.imageUrl) ? a.imageUrl : fallback,
      overallScore: a.overallScore,
      grade: a.grade,
      scores: (a.scores as ThumbnailScores | null) ?? null,
      issues: (a.issues as ThumbnailAnalysisResult['issues']) ?? [],
      suggestions: (a.suggestions as string[]) ?? [],
      method: a.method ?? 'ai',
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

  private unclassifiedResult(
    m: MasterRow,
    existing?: AnalysisRow,
  ): ThumbnailAnalysisResult {
    return {
      id: m.id,
      productId: m.id,
      productName: m.name,
      imageUrl: resolveMasterThumbnailImage(m),
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
      imageSpec: (existing?.imageSpec as ImageSpec | null) ?? null,
      recompose: (existing?.recompose as ThumbnailAnalysisResult['recompose']) ?? null,
      createdAt: m.createdAt.toISOString(),
    } satisfies ThumbnailAnalysisResult;
  }
}

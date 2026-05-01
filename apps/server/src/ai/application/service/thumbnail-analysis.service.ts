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
} from '@kiditem/shared/ai';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AnalysisScope } from '../../adapter/in/http/dto/thumbnail-analyze.dto';
import { resolveMasterThumbnailImage } from '../../domain/thumbnail-master-image';
import { thumbnailMasterImageSelect } from '../../adapter/out/prisma/master-image-select.preset';
import {
  ThumbnailVisionAiService,
  type ThumbnailAiItem,
} from './thumbnail-vision-ai.service';
import { ThumbnailRecomposeService } from './thumbnail-recompose.service';
import {
  type AnalysisRow,
  type MasterRow,
  buildAnalysisListResponse,
  buildAnalysisSummary,
} from '../../adapter/out/prisma/thumbnail-analysis.query';
import { toAnalysisResult } from '../../mapper/thumbnail-analysis.mapper';

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

  async findAllWithAnalysis(organizationId: string): Promise<ThumbnailAnalysisListResponse> {
    const [masters, analyses] = await Promise.all([
      this.prisma.masterProduct.findMany({
        where: { organizationId, isDeleted: false, pipelineStep: null },
        select: {
          id: true,
          name: true,
          imageUrl: true,
          thumbnailUrl: true,
          images: thumbnailMasterImageSelect(organizationId),
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.thumbnailAnalysis.findMany({
        where: { organizationId },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    return buildAnalysisListResponse(
      masters as MasterRow[],
      analyses as AnalysisRow[],
    );
  }

  async getSummary(organizationId: string): Promise<ThumbnailAnalysisSummary> {
    const masters = await this.prisma.masterProduct.findMany({
      where: { organizationId, isDeleted: false, pipelineStep: null },
      select: { id: true },
    });
    const analyses = masters.length
      ? await this.prisma.thumbnailAnalysis.findMany({
          where: { organizationId, masterId: { in: masters.map((m) => m.id) } },
          select: {
            grade: true,
            complianceGrade: true,
            qualityAnalyzedAt: true,
            complianceAnalyzedAt: true,
          },
        })
      : [];

    return buildAnalysisSummary(masters.length, analyses);
  }

  // ─── 분석 / 사전검수 ─────────────────────────────────────────────

  /**
   * 단일 master 분석 — `scope` 에 따라 quality / compliance / 둘 다 갱신.
   * AI 호출 결과를 ThumbnailAnalysis 에 upsert. 갱신되지 않는 다른 branch 의
   * 기존 값은 보존된다.
   */
  async analyzeProduct(
    productId: string,
    organizationId: string,
    scope: AnalysisScope,
    signal?: AbortSignal,
  ): Promise<ThumbnailAnalysisResult> {
    const master = await this.prisma.masterProduct.findFirst({
      where: { id: productId, organizationId, isDeleted: false },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        thumbnailUrl: true,
        category: true,
        images: thumbnailMasterImageSelect(organizationId),
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
      organization: { connect: { id: organizationId } },
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
    });

    return toAnalysisResult(upserted as AnalysisRow, master);
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
   * Organization-scoped batch analysis. AbortController 가 회사별로 1개 유지되어
   * 같은 회사가 새 batch 를 시작하면 이전 inflight 는 cancel.
   */
  async analyzeBatch(
    productIds: string[],
    organizationId: string,
    scope: AnalysisScope,
  ): Promise<ThumbnailAnalysisResult[]> {
    if (productIds.length === 0) return [];
    const previous = this.batchAborts.get(organizationId);
    if (previous) previous.abort();
    const controller = new AbortController();
    this.batchAborts.set(organizationId, controller);

    const results: ThumbnailAnalysisResult[] = [];
    try {
      for (const id of productIds) {
        if (controller.signal.aborted) break;
        try {
          results.push(await this.analyzeProduct(id, organizationId, scope, controller.signal));
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
      if (this.batchAborts.get(organizationId) === controller) {
        this.batchAborts.delete(organizationId);
      }
    }
    return results;
  }

  cancelBatch(organizationId: string): { cancelled: boolean } {
    const controller = this.batchAborts.get(organizationId);
    const hasInflight = Boolean(controller);
    if (controller) {
      controller.abort();
      this.batchAborts.delete(organizationId);
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
    organizationId: string,
  ): Promise<{ processed: number; failed: number }> {
    const where: Prisma.MasterProductWhereInput = { organizationId, isDeleted: false };
    if (productIds?.length) where.id = { in: productIds };
    const masters = await this.prisma.masterProduct.findMany({
      where,
      select: {
        id: true,
        imageUrl: true,
        thumbnailUrl: true,
        images: thumbnailMasterImageSelect(organizationId),
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
            organizationId,
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
}

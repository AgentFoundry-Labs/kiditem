import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  ComplianceScores,
  ImageSpec,
  ThumbnailAnalysisResult,
  ThumbnailScores,
  RecomposeVariantClassification,
} from '@kiditem/shared/ai';
import type { AnalysisScope } from './thumbnail-analysis-requests';
import { ThumbnailVisionAiService, type ThumbnailAiItem } from './thumbnail-vision-ai.service';
import { ThumbnailRecomposeService } from './thumbnail-recompose.service';
import { toAnalysisResult } from '../../mapper/thumbnail-analysis.mapper';
import {
  THUMBNAIL_ANALYSIS_REPOSITORY_PORT,
  type ThumbnailAnalysisComplianceFacet,
  type ThumbnailAnalysisQualityFacet,
  type ThumbnailAnalysisRepositoryPort,
} from '../port/out/repository/thumbnail-analysis.repository.port';

/**
 * Single-product analyzer — owns analyzeWorkspace / analyzeDirectImage /
 * preInspect / checkImageSpec. All persistence routes through
 * `upsertThumbnailAnalysis` so the chunk-batch sibling can reuse the same
 * write path without duplicating the upsert payload assembly.
 */
@Injectable()
export class ThumbnailAnalysisAnalyzerService {
  private readonly logger = new Logger(ThumbnailAnalysisAnalyzerService.name);

  constructor(
    @Inject(THUMBNAIL_ANALYSIS_REPOSITORY_PORT)
    private readonly repository: ThumbnailAnalysisRepositoryPort,
    private readonly vision: ThumbnailVisionAiService,
    private readonly recomposeService: ThumbnailRecomposeService,
  ) {}

  /**
   * 단일 workspace 분석 — `scope` 에 따라 quality / compliance / 둘 다 갱신.
   * AI 호출 결과를 ThumbnailAnalysis 에 upsert. 갱신되지 않는 다른 branch 의
   * 기존 값은 보존된다.
   */
  async analyzeWorkspace(
    contentWorkspaceId: string,
    organizationId: string,
    scope: AnalysisScope,
    signal?: AbortSignal,
  ): Promise<ThumbnailAnalysisResult> {
    const workspace = await this.repository.findWorkspaceForAnalysis(contentWorkspaceId, organizationId);
    if (!workspace) throw new NotFoundException(`ContentWorkspace ${contentWorkspaceId} not found`);
    const imageUrl = workspace.imageUrl;

    const visionItem: ThumbnailAiItem = {
      contentWorkspaceId: workspace.id,
      productName: workspace.name,
      imageUrl,
      category: workspace.category ?? null,
    };

    const wantsQuality = scope === 'all' || scope === 'quality';
    const wantsCompliance = scope === 'all' || scope === 'compliance';

    let qualityResult: ThumbnailAnalysisQualityFacet | undefined;
    let complianceResult: ThumbnailAnalysisComplianceFacet | undefined;
    let imageSpec: ImageSpec | null | undefined;
    let recompose: RecomposeVariantClassification | undefined;

    if (wantsQuality) {
      const [qmap, recomposeResult] = await Promise.all([
        this.vision.analyzeQuality([visionItem], signal),
        this.recomposeService.classifyByImage(imageUrl, {
          productName: workspace.name,
          category: workspace.category,
        }),
      ]);
      const q = qmap.get(workspace.id);
      if (!q) {
        throw new ServiceUnavailableException('thumbnail_ai_quality_result_missing');
      }
      recompose = recomposeResult;
      qualityResult = {
        overallScore: q.overallScore,
        grade: q.grade,
        scores: q.scores,
        issues: q.issues,
        suggestions: q.suggestions,
        method: q.method,
      };
    }

    if (wantsCompliance) {
      const [spec, cmap] = await Promise.all([
        this.vision.checkImageSpec(imageUrl),
        this.vision.checkCompliance([visionItem], signal),
      ]);
      const c = cmap.get(workspace.id);
      if (!c) {
        throw new ServiceUnavailableException('thumbnail_ai_compliance_result_missing');
      }
      imageSpec = spec;
      complianceResult = {
        complianceGrade: c.complianceGrade,
        complianceScores: c.complianceScores,
      };
    }

    const upserted = await this.repository.upsertAnalysis({
      contentWorkspaceId: workspace.id,
      organizationId,
      imageUrl,
      qualityResult,
      complianceResult,
      imageSpec,
      recompose,
    });

    return toAnalysisResult(upserted, workspace);
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
      contentWorkspaceId: 'direct',
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
        this.recomposeService.classifyByImage(imageUrl, {
          productName: productName ?? null,
          category: null,
        }),
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
      contentWorkspaceId: null,
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
    contentWorkspaceIds: string[] | undefined,
    organizationId: string,
  ): Promise<{ processed: number; failed: number }> {
    const workspaces = await this.repository.findWorkspacesForPreInspect(contentWorkspaceIds, organizationId);
    let processed = 0;
    let failed = 0;
    for (const workspace of workspaces) {
      const imageUrl = workspace.imageUrl;
      try {
        const spec = await this.vision.checkImageSpec(imageUrl);
        await this.repository.upsertAnalysis({
          contentWorkspaceId: workspace.id,
          organizationId,
          imageUrl,
          imageSpec: spec,
        });
        processed += 1;
      } catch (err) {
        this.logger.warn(`preInspect skip ${workspace.id}: ${err instanceof Error ? err.message : String(err)}`);
        failed += 1;
      }
    }
    return { processed, failed };
  }
}

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

const THUMBNAIL_ANALYSIS_CHANNEL = 'coupang';

function thumbnailAnalysisMasterWhere(organizationId: string): Prisma.MasterProductWhereInput {
  return {
    organizationId,
    isDeleted: false,
    pipelineStep: null,
    listings: {
      some: {
        organizationId,
        channel: THUMBNAIL_ANALYSIS_CHANNEL,
        isDeleted: false,
      },
    },
  };
}

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
        where: thumbnailAnalysisMasterWhere(organizationId),
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
      where: thumbnailAnalysisMasterWhere(organizationId),
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
        this.recomposeService.classifyByImage(imageUrl, {
          productName: master.name,
          category: master.category,
        }),
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
   * Organization-scoped batch analysis.
   *
   * **Chunk-batched**: chunk 의 모든 product 를 한 번의 Gemini multi-image
   * batch 호출로 처리한다. for-loop sequential 패턴은 product 1개당 ~30s ×
   * 15 = 7~8분 이 걸려서 사용 불가. chunk batch 로 ~30~60s/chunk 로 단축.
   *
   * Per-chunk parallel:
   *   - vision.analyzeQuality(chunk)        — quality 한 번
   *   - vision.checkCompliance(chunk)       — compliance 한 번
   *   - recomposeChunk(chunk) (Promise.all) — recompose 는 multi-image batch
   *     안정성이 떨어져서 individual call × Promise.all 로 chunk 내 병렬.
   *
   * AbortController 는 organization 별 1개 — 새 batch 시작 시 이전 abort.
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
    const signal = controller.signal;

    const BATCH_SIZE = 15;
    const CHUNK_DELAY_MS = 1500;
    const wantsQuality = scope === 'all' || scope === 'quality';
    const wantsCompliance = scope === 'all' || scope === 'compliance';
    const results: ThumbnailAnalysisResult[] = [];

    try {
      const masters = await this.prisma.masterProduct.findMany({
        where: { id: { in: productIds }, organizationId, isDeleted: false },
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
      const masterMap = new Map(masters.map((m) => [m.id, m]));

      // 표시 가능한 이미지가 있는 product 만 vision batch 대상.
      const items: ThumbnailAiItem[] = [];
      for (const productId of productIds) {
        const master = masterMap.get(productId);
        if (!master) continue;
        const imageUrl = resolveMasterThumbnailImage(master);
        if (!imageUrl) continue;
        items.push({
          productId: master.id,
          productName: master.name,
          imageUrl,
          category: master.category ?? null,
        });
      }

      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        if (signal.aborted) break;
        if (i > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
          if (signal.aborted) break;
        }

        const chunk = items.slice(i, i + BATCH_SIZE);
        try {
          const [qualityMap, complianceMap, recomposeMap] = await Promise.all([
            wantsQuality
              ? this.vision.analyzeQuality(chunk, signal)
              : Promise.resolve(new Map()),
            wantsCompliance
              ? this.vision.checkCompliance(chunk, signal)
              : Promise.resolve(new Map()),
            wantsQuality
              ? this.recomposeChunk(chunk, signal)
              : Promise.resolve(new Map<string, RecomposeVariantClassification>()),
          ]);

          // imageSpec 은 chunk 내 product 별로 sequential 처리해도 부담 적음.
          // (sharp pixel mask + 작은 Gemini call). chunk 내 병렬화 가능하지만
          // verifier 쪽이 동시 호출 부담 — 안정성 우선 sequential.
          for (const item of chunk) {
            if (signal.aborted) break;
            const master = masterMap.get(item.productId);
            if (!master) continue;
            try {
              const saved = await this.persistChunkResult({
                master,
                imageUrl: item.imageUrl,
                scope,
                qualityResult: qualityMap.get(item.productId),
                complianceResult: complianceMap.get(item.productId),
                recompose: recomposeMap.get(item.productId),
                organizationId,
                signal,
              });
              if (saved) results.push(saved);
            } catch (err) {
              if (signal.aborted || this.isAbortError(err)) break;
              this.logger.warn(
                `analyzeBatch skip ${item.productId}: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }
        } catch (err) {
          if (signal.aborted || this.isAbortError(err)) break;
          // chunk 전체 batch 호출 실패 → 개별 fallback. (Gemini 일시 quota 등)
          this.logger.warn(
            `analyzeBatch chunk ${i}-${i + chunk.length} batch 실패, individual fallback: ${err instanceof Error ? err.message : String(err)}`,
          );
          for (const item of chunk) {
            if (signal.aborted) break;
            try {
              results.push(await this.analyzeProduct(item.productId, organizationId, scope, signal));
            } catch (innerErr) {
              if (signal.aborted || this.isAbortError(innerErr)) break;
              this.logger.warn(
                `analyzeBatch fallback skip ${item.productId}: ${innerErr instanceof Error ? innerErr.message : String(innerErr)}`,
              );
            }
          }
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

  /**
   * recompose 는 chunk-batch 가 안정성 떨어져서 individual call × Promise.all.
   * chunk 내 병렬은 OK (Gemini Flash 동시 요청 수십개 받음).
   */
  private async recomposeChunk(
    chunk: ThumbnailAiItem[],
    signal?: AbortSignal,
  ): Promise<Map<string, RecomposeVariantClassification>> {
    const map = new Map<string, RecomposeVariantClassification>();
    if (chunk.length === 0) return map;
    const results = await Promise.all(
      chunk.map(async (item) => {
        if (signal?.aborted) return null;
        try {
          const r = await this.recomposeService.classifyByImage(item.imageUrl, {
            productName: item.productName,
            category: item.category ?? null,
          });
          return { productId: item.productId, recompose: r };
        } catch (err) {
          if (signal?.aborted || this.isAbortError(err)) return null;
          this.logger.warn(
            `recompose chunk skip ${item.productId}: ${err instanceof Error ? err.message : String(err)}`,
          );
          return null;
        }
      }),
    );
    for (const r of results) {
      if (r) map.set(r.productId, r.recompose);
    }
    return map;
  }

  /**
   * chunk batch 결과를 ThumbnailAnalysis 에 persist. quality / compliance /
   * recompose 가 부분 누락돼도 가능한 부분만 upsert. analyzeProduct 와 같은
   * shape 의 row 반환.
   */
  private async persistChunkResult(input: {
    master: MasterRow & { name: string; category: string | null; createdAt: Date };
    imageUrl: string;
    scope: AnalysisScope;
    qualityResult: {
      overallScore: number;
      grade: 'S' | 'A' | 'B' | 'C' | 'F';
      scores: ThumbnailScores | null;
      issues: ThumbnailAnalysisResult['issues'];
      suggestions: string[];
      method: string;
    } | undefined;
    complianceResult: { complianceGrade: string; complianceScores: ComplianceScores } | undefined;
    recompose: RecomposeVariantClassification | undefined;
    organizationId: string;
    signal?: AbortSignal;
  }): Promise<ThumbnailAnalysisResult | null> {
    const { master, imageUrl, scope, qualityResult, complianceResult, recompose, organizationId, signal } = input;
    const wantsQuality = scope === 'all' || scope === 'quality';
    const wantsCompliance = scope === 'all' || scope === 'compliance';

    if (wantsQuality && !qualityResult) {
      // quality 결과 누락은 partial-success. 다른 chunk product 영향 없음.
      this.logger.warn(`persistChunkResult: quality result missing for ${master.id}`);
    }
    if (wantsCompliance && !complianceResult) {
      this.logger.warn(`persistChunkResult: compliance result missing for ${master.id}`);
    }

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

    if (qualityResult) {
      update.overallScore = qualityResult.overallScore;
      update.grade = qualityResult.grade;
      update.scores = (qualityResult.scores ?? Prisma.JsonNull) as Prisma.InputJsonValue;
      update.issues = (qualityResult.issues as unknown as Prisma.InputJsonValue) ?? [];
      update.suggestions = qualityResult.suggestions as Prisma.InputJsonValue;
      update.method = qualityResult.method;
      update.qualityAnalyzedAt = now;
      create.overallScore = qualityResult.overallScore;
      create.grade = qualityResult.grade;
      create.scores = (qualityResult.scores ?? undefined) as Prisma.InputJsonValue;
      create.issues = qualityResult.issues as unknown as Prisma.InputJsonValue;
      create.suggestions = qualityResult.suggestions as Prisma.InputJsonValue;
      create.method = qualityResult.method;
      create.qualityAnalyzedAt = now;
    }

    if (complianceResult) {
      update.complianceGrade = complianceResult.complianceGrade;
      update.complianceScores = complianceResult.complianceScores as unknown as Prisma.InputJsonValue;
      update.complianceAnalyzedAt = now;
      create.complianceGrade = complianceResult.complianceGrade;
      create.complianceScores = complianceResult.complianceScores as unknown as Prisma.InputJsonValue;
      create.complianceAnalyzedAt = now;

      // imageSpec 은 chunk batch 결과에 없음 — sharp pixel mask 가 별도라
      // sequential 처리. 부담 적음 (1초 내).
      if (!signal?.aborted) {
        try {
          const imageSpec = await this.vision.checkImageSpec(imageUrl);
          if (imageSpec) {
            update.imageSpec = imageSpec as unknown as Prisma.InputJsonValue;
            create.imageSpec = imageSpec as unknown as Prisma.InputJsonValue;
          }
        } catch (err) {
          this.logger.warn(`imageSpec skip ${master.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
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

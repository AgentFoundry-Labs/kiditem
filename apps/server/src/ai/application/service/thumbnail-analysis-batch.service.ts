import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  ImageSpec,
  RecomposeVariantClassification,
  ThumbnailAnalysisResult,
} from '@kiditem/shared/ai';
import type { AnalysisScope } from './thumbnail-analysis-requests';
import { resolveMasterThumbnailImage } from '../../domain/thumbnail-master-image';
import {
  ThumbnailVisionAiService,
  type ThumbnailAiItem,
} from './thumbnail-vision-ai.service';
import { ThumbnailRecomposeService } from './thumbnail-recompose.service';
import {
  THUMBNAIL_ANALYSIS_REPOSITORY_PORT,
  type ThumbnailAnalysisComplianceFacet,
  type ThumbnailAnalysisMasterRow,
  type ThumbnailAnalysisQualityFacet,
  type ThumbnailAnalysisRepositoryPort,
} from '../port/out/repository/thumbnail-analysis.repository.port';
import { toAnalysisResult } from '../../mapper/thumbnail-analysis.mapper';
import { ThumbnailAnalysisAnalyzerService } from './thumbnail-analysis-analyzer.service';

/**
 * Chunk-batched analysis with per-organization cancellation.
 *
 * Chunk strategy: `vision.analyzeQuality` and `vision.checkCompliance` are
 * multi-image batch calls. `recomposeService.classifyByImage` is
 * single-image — we parallelize it across the chunk via `Promise.all`.
 *
 * Cancellation: `batchAborts` holds one `AbortController` per
 * `organizationId`. Starting a new batch aborts the previous one; finally
 * clears the entry only if it is still the active controller so a parallel
 * cancel cannot wipe a fresh batch's controller.
 *
 * Fallback: if the chunk batch call fails (e.g. Gemini quota), we fall back
 * to `analyzer.analyzeProduct(...)` per product. The analyzer is injected
 * one-way, which is fine — the facade composes analyzer + batch but the
 * batch service itself never calls back into the facade.
 */
@Injectable()
export class ThumbnailAnalysisBatchService {
  private readonly logger = new Logger(ThumbnailAnalysisBatchService.name);
  private readonly batchAborts = new Map<string, AbortController>();

  constructor(
    @Inject(THUMBNAIL_ANALYSIS_REPOSITORY_PORT)
    private readonly repository: ThumbnailAnalysisRepositoryPort,
    private readonly vision: ThumbnailVisionAiService,
    private readonly recomposeService: ThumbnailRecomposeService,
    private readonly analyzer: ThumbnailAnalysisAnalyzerService,
  ) {}

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
      const masters = await this.repository.findMastersForBatch(productIds, organizationId);
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
              results.push(
                await this.analyzer.analyzeProduct(item.productId, organizationId, scope, signal),
              );
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
    master: ThumbnailAnalysisMasterRow & { name: string; category: string | null; createdAt: Date };
    imageUrl: string;
    scope: AnalysisScope;
    qualityResult: ThumbnailAnalysisQualityFacet | undefined;
    complianceResult: ThumbnailAnalysisComplianceFacet | undefined;
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

    // imageSpec 은 chunk batch 결과에 없음 — sharp pixel mask 가 별도라
    // sequential 처리. 부담 적음 (1초 내). compliance 가 함께 있는 경우에만 호출.
    let imageSpec: ImageSpec | null | undefined;
    if (complianceResult && !signal?.aborted) {
      try {
        imageSpec = await this.vision.checkImageSpec(imageUrl);
      } catch (err) {
        this.logger.warn(`imageSpec skip ${master.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const upserted = await this.repository.upsertAnalysis({
      masterId: master.id,
      organizationId,
      imageUrl,
      qualityResult,
      complianceResult,
      imageSpec,
      recompose,
    });
    return toAnalysisResult(upserted, master);
  }

  private isAbortError(err: unknown): boolean {
    return err instanceof Error && err.message === 'ABORTED';
  }
}

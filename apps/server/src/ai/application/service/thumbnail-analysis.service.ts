import { Injectable } from '@nestjs/common';
import type {
  ImageSpec,
  ThumbnailAnalysisListResponse,
  ThumbnailAnalysisResult,
  ThumbnailAnalysisSummary,
} from '@kiditem/shared/ai';
import type { AnalysisScope } from '../../adapter/in/http/dto/thumbnail-analyze.dto';
import { ThumbnailAnalysisQueryService } from './thumbnail-analysis-query.service';
import { ThumbnailAnalysisAnalyzerService } from './thumbnail-analysis-analyzer.service';
import { ThumbnailAnalysisBatchService } from './thumbnail-analysis-batch.service';

/**
 * Public facade for the thumbnail-analysis surface. Composes three
 * specialized services:
 *
 *   - `ThumbnailAnalysisQueryService` — read-only list / summary
 *   - `ThumbnailAnalysisAnalyzerService` — single-product analyze
 *     (analyzeProduct / analyzeDirectImage / preInspect / checkImageSpec)
 *   - `ThumbnailAnalysisBatchService` — chunk-batched analyze with
 *     per-organization cancellation (analyzeBatch / cancelBatch)
 *
 * The HTTP controller binds to this facade so the public surface
 * (`/api/thumbnail-analysis/*`) is unchanged across the split. Persistence
 * routes through `adapter/out/prisma/thumbnail-analysis.persistence.ts` so
 * analyzer and batch share one upsert path.
 */
@Injectable()
export class ThumbnailAnalysisService {
  constructor(
    private readonly query: ThumbnailAnalysisQueryService,
    private readonly analyzer: ThumbnailAnalysisAnalyzerService,
    private readonly batch: ThumbnailAnalysisBatchService,
  ) {}

  findAllWithAnalysis(organizationId: string): Promise<ThumbnailAnalysisListResponse> {
    return this.query.findAllWithAnalysis(organizationId);
  }

  getSummary(organizationId: string): Promise<ThumbnailAnalysisSummary> {
    return this.query.getSummary(organizationId);
  }

  analyzeProduct(
    productId: string,
    organizationId: string,
    scope: AnalysisScope,
    signal?: AbortSignal,
  ): Promise<ThumbnailAnalysisResult> {
    return this.analyzer.analyzeProduct(productId, organizationId, scope, signal);
  }

  analyzeDirectImage(
    imageUrl: string,
    productName?: string,
    scope: AnalysisScope = 'all',
  ): Promise<ThumbnailAnalysisResult> {
    return this.analyzer.analyzeDirectImage(imageUrl, productName, scope);
  }

  checkImageSpec(imageUrl: string): Promise<ImageSpec> {
    return this.analyzer.checkImageSpec(imageUrl);
  }

  preInspect(
    productIds: string[] | undefined,
    organizationId: string,
  ): Promise<{ processed: number; failed: number }> {
    return this.analyzer.preInspect(productIds, organizationId);
  }

  analyzeBatch(
    productIds: string[],
    organizationId: string,
    scope: AnalysisScope,
  ): Promise<ThumbnailAnalysisResult[]> {
    return this.batch.analyzeBatch(productIds, organizationId, scope);
  }

  cancelBatch(organizationId: string): { cancelled: boolean } {
    return this.batch.cancelBatch(organizationId);
  }
}

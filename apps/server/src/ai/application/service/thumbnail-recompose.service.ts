import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { RecomposeVariantClassification } from '@kiditem/shared/ai';
import {
  parseRecomposeClassification,
  singleProductFallback,
  SINGLE_PRODUCT_FALLBACK,
} from '../../domain/recompose-classification';
import {
  buildProductContextHeader,
  RECOMPOSE_CLASSIFY_PROMPT,
} from '../../domain/prompts/thumbnail-prompts';
import { resolveMasterThumbnailImage } from '../../domain/thumbnail-master-image';
import { ThumbnailVisionAiService } from './thumbnail-vision-ai.service';
import {
  THUMBNAIL_ANALYSIS_REPOSITORY_PORT,
  type ThumbnailAnalysisRepositoryPort,
} from '../port/out/thumbnail-analysis.repository.port';

/**
 * Runtime classifier wrapper around ThumbnailVisionAiService.classifyImageJson.
 *
 * Uses the same RECOMPOSE_CLASSIFY_PROMPT and RECOMPOSE_KINDS that the prompt
 * router (`thumbnail-recompose-prompts.ts`) consumes, so the analysis side and
 * the edit-job prompt-routing side stay in sync.
 */
@Injectable()
export class ThumbnailRecomposeService {
  private readonly logger = new Logger(ThumbnailRecomposeService.name);

  constructor(
    @Inject(THUMBNAIL_ANALYSIS_REPOSITORY_PORT)
    private readonly repository: ThumbnailAnalysisRepositoryPort,
    private readonly vision: ThumbnailVisionAiService,
  ) {}

  async classify(productId: string, organizationId: string): Promise<RecomposeVariantClassification> {
    const master = await this.repository.findRecomposeMaster(productId, organizationId);
    if (!master) throw new NotFoundException('Product not found');
    const imageUrl = resolveMasterThumbnailImage(master);
    if (!imageUrl) {
      return singleProductFallback('원본 이미지가 없습니다');
    }
    return this.classifyByImage(imageUrl, {
      productName: master.name,
      category: master.category,
    });
  }

  async classifyByImage(
    imageUrl: string,
    context?: { productName?: string | null; category?: string | null },
  ): Promise<RecomposeVariantClassification> {
    try {
      const contextHeader = buildProductContextHeader(context?.productName, context?.category).trim();
      const prompt = [contextHeader, RECOMPOSE_CLASSIFY_PROMPT].filter(Boolean).join('\n\n');
      const text = await this.vision.classifyImageJson(imageUrl, prompt);
      return parseRecomposeClassification(text);
    } catch (err) {
      this.logger.warn(
        `recompose classify 실패 (${imageUrl}): ${err instanceof Error ? err.message : err}`,
      );
      return SINGLE_PRODUCT_FALLBACK;
    }
  }
}

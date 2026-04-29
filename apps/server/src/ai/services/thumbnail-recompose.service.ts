import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { RecomposeVariantClassification } from '@kiditem/shared/ai';
import { PrismaService } from '../../prisma/prisma.service';
import {
  parseRecomposeClassification,
  singleProductFallback,
  SINGLE_PRODUCT_FALLBACK,
} from '../domain/recompose-classification';
import { RECOMPOSE_CLASSIFY_PROMPT } from './thumbnail-prompts';
import {
  resolveMasterThumbnailImage,
  thumbnailMasterImageSelect,
} from './thumbnail-master-image-resolver';
import { ThumbnailVisionAiService } from './thumbnail-vision-ai.service';

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
    private readonly prisma: PrismaService,
    private readonly vision: ThumbnailVisionAiService,
  ) {}

  async classify(productId: string, companyId: string): Promise<RecomposeVariantClassification> {
    const master = await this.prisma.masterProduct.findFirst({
      where: { id: productId, companyId, isDeleted: false },
      select: {
        imageUrl: true,
        thumbnailUrl: true,
        images: thumbnailMasterImageSelect(companyId),
      },
    });
    if (!master) throw new NotFoundException('Product not found');
    const imageUrl = resolveMasterThumbnailImage(master);
    if (!imageUrl) {
      return singleProductFallback('원본 이미지가 없습니다');
    }
    return this.classifyByImage(imageUrl);
  }

  async classifyByImage(imageUrl: string): Promise<RecomposeVariantClassification> {
    try {
      const text = await this.vision.classifyImageJson(imageUrl, RECOMPOSE_CLASSIFY_PROMPT);
      return parseRecomposeClassification(text);
    } catch (err) {
      this.logger.warn(
        `recompose classify 실패 (${imageUrl}): ${err instanceof Error ? err.message : err}`,
      );
      return SINGLE_PRODUCT_FALLBACK;
    }
  }
}

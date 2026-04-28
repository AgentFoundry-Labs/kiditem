import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RECOMPOSE_KINDS, type RecomposeKind, type RecomposeVariantClassification } from '@kiditem/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RECOMPOSE_CLASSIFY_PROMPT } from './thumbnail-prompts';
import {
  THUMBNAIL_MASTER_IMAGE_SELECT,
  resolveMasterThumbnailImage,
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
        images: THUMBNAIL_MASTER_IMAGE_SELECT,
      },
    });
    if (!master) throw new NotFoundException('Product not found');
    const imageUrl = resolveMasterThumbnailImage(master);
    if (!imageUrl) {
      return {
        kind: 'single-product',
        requiresChoice: false,
        options: [],
        recommended: null,
        reasoning: '원본 이미지가 없습니다',
      };
    }
    return this.classifyByImage(imageUrl);
  }

  async classifyByImage(imageUrl: string): Promise<RecomposeVariantClassification> {
    try {
      const text = await this.vision.classifyImageJson(imageUrl, RECOMPOSE_CLASSIFY_PROMPT);
      return this.parse(text);
    } catch (err) {
      this.logger.warn(
        `recompose classify 실패 (${imageUrl}): ${err instanceof Error ? err.message : err}`,
      );
      return {
        kind: 'single-product',
        requiresChoice: false,
        options: [],
        recommended: null,
        reasoning: null,
      };
    }
  }

  private parse(text: string | null): RecomposeVariantClassification {
    if (!text) {
      return {
        kind: 'single-product',
        requiresChoice: false,
        options: [],
        recommended: null,
        reasoning: null,
      };
    }
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    let obj: { kind?: string; requiresChoice?: boolean; reasoning?: string };
    try {
      obj = JSON.parse(cleaned) as typeof obj;
    } catch (err) {
      this.logger.warn(`recompose JSON 파싱 실패: ${err instanceof Error ? err.message : err}`);
      return {
        kind: 'single-product',
        requiresChoice: false,
        options: [],
        recommended: null,
        reasoning: null,
      };
    }
    const kind: RecomposeKind = (RECOMPOSE_KINDS as readonly string[]).includes(obj.kind ?? '')
      ? (obj.kind as RecomposeKind)
      : 'single-product';
    if (obj.requiresChoice) {
      return {
        kind,
        requiresChoice: true,
        options: [
          {
            key: 'with-box',
            label: '박스 + 상품',
            description: '박스와 상품을 함께 구성',
            recommended: true,
          },
          {
            key: 'no-box',
            label: '상품만',
            description: '박스 없이 상품만 구성',
          },
        ],
        recommended: 'with-box',
        reasoning: obj.reasoning ?? null,
      };
    }
    return {
      kind,
      requiresChoice: false,
      options: [],
      recommended: null,
      reasoning: obj.reasoning ?? null,
    };
  }
}

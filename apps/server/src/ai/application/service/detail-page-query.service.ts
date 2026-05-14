import { createHash } from 'node:crypto';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { moveSafetyLabelImagesToEnd } from '../../domain/detail-page-image-order';
import type { DetailPageGenerationDto, DetailPageTemplateId } from './detail-page-ai.types';
import { DetailPageResultRefinerService } from './detail-page-result-refiner.service';
import {
  normalizeStoredDetailPageRawInput,
  toDetailPageStoredJson,
} from './detail-page-stored.helpers';
import {
  IMAGE_STORAGE_PORT,
  type ImageStoragePort,
} from '../port/out/image-storage.port';
import { ContentAssetService } from './content-asset.service';

const detailPageGenerationInclude = {
  generationGroup: {
    select: {
      id: true,
      targetMasterId: true,
    },
  },
} satisfies Prisma.ContentGenerationInclude;

type DetailPageGenerationRow = Prisma.ContentGenerationGetPayload<{
  include: typeof detailPageGenerationInclude;
}>;

@Injectable()
export class DetailPageQueryService {
  private readonly logger = new Logger(DetailPageQueryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resultRefiner: DetailPageResultRefinerService,
    @Inject(IMAGE_STORAGE_PORT)
    private readonly imageStorage: ImageStoragePort,
    private readonly contentAssets: ContentAssetService,
  ) {}

  async list(
    organizationId: string,
    productId?: string,
    templateId?: string,
  ): Promise<DetailPageGenerationDto[]> {
    if (templateId && templateId !== 'kids-playful' && templateId !== 'bold-vertical') {
      throw new BadRequestException('invalid templateId');
    }
    const rows = await this.prisma.contentGeneration.findMany({
      where: {
        organizationId,
        contentType: 'detail_page',
        ...(productId ? { generationGroup: { targetMasterId: productId } } : {}),
      },
      include: detailPageGenerationInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows
      .map((row) => this.toDto(row))
      .filter((row) => (templateId ? row.templateId === templateId : true));
  }

  async getById(id: string, organizationId: string): Promise<DetailPageGenerationDto> {
    const row = await this.prisma.contentGeneration.findFirst({
      where: { id, organizationId },
      include: detailPageGenerationInclude,
    });
    if (!row) throw new NotFoundException('Detail page generation not found');
    return this.toDto(row);
  }

  async remove(id: string, organizationId: string): Promise<{ ok: true }> {
    const row = await this.prisma.contentGeneration.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Detail page generation not found');
    await this.prisma.contentGeneration.delete({ where: { id } });
    return { ok: true };
  }

  async saveEditedHtml(
    id: string,
    organizationId: string,
    html: string,
  ): Promise<{ html: string; savedAt: string; assetUrlMap: Record<string, string> }> {
    const row = await this.prisma.contentGeneration.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        generationGroupId: true,
        detailPageArtifactId: true,
        generatedTitle: true,
        sourceCandidateId: true,
        triggeredByUserId: true,
        generationGroup: {
          select: {
            targetMasterId: true,
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Detail page generation not found');

    const promoted = await this.promoteEditableImageUrls({
      organizationId,
      contentGenerationId: id,
      html,
    });
    const imageUrls = extractImageSrcs(promoted.html);
    const savedAt = new Date();
    const revision = await this.prisma.$transaction(async (tx) => {
      await this.contentAssets.syncGenerationImageUsagesTx(tx, {
        organizationId,
        generationGroupId: row.generationGroupId,
        contentGenerationId: id,
        createdByUserId: row.triggeredByUserId,
        imageUrls,
      });

      const artifactId = row.detailPageArtifactId ?? (await tx.detailPageArtifact.create({
        data: {
          organizationId,
          sourceCandidateId: row.sourceCandidateId,
          targetMasterId: row.generationGroup.targetMasterId,
          sourceContentGenerationId: id,
          title: row.generatedTitle ?? '상세페이지',
          status: 'draft',
          createdByUserId: row.triggeredByUserId,
          metadata: { source: 'detail_page_editor_save' },
        },
        select: { id: true },
      })).id;

      const createdRevision = await tx.detailPageRevision.create({
        data: {
          organizationId,
          artifactId,
          contentGenerationId: id,
          revisionType: 'manual_edit',
          html: promoted.html,
          assetUrlMap: promoted.assetUrlMap as Prisma.InputJsonValue,
          imageUrls: imageUrls as Prisma.InputJsonValue,
          createdByUserId: row.triggeredByUserId,
          createdAt: savedAt,
        },
        select: {
          id: true,
          html: true,
          createdAt: true,
        },
      });

      const artifactUpdated = await tx.detailPageArtifact.updateMany({
        where: { id: artifactId, organizationId },
        data: {
          currentRevisionId: createdRevision.id,
          status: 'draft',
        },
      });
      if (artifactUpdated.count === 0) {
        throw new NotFoundException('Detail page artifact not found');
      }

      const generationUpdated = await tx.contentGeneration.updateMany({
        where: { id, organizationId },
        data: { detailPageArtifactId: artifactId },
      });
      if (generationUpdated.count === 0) {
        throw new NotFoundException('Detail page generation not found');
      }

      return createdRevision;
    });

    void this.deleteTmpImagesBestEffort(promoted.tmpKeysToDelete);
    return {
      html: revision.html,
      savedAt: revision.createdAt.toISOString(),
      assetUrlMap: promoted.assetUrlMap,
    };
  }

  async getEditedHtml(
    id: string,
    organizationId: string,
  ): Promise<{ html: string | null; savedAt: string | null }> {
    const row = await this.prisma.contentGeneration.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        editedHtml: true,
        editedHtmlSavedAt: true,
        detailPageArtifact: {
          select: {
            currentRevision: {
              select: {
                html: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Detail page generation not found');
    const currentRevision = row.detailPageArtifact?.currentRevision;
    if (currentRevision) {
      return {
        html: currentRevision.html,
        savedAt: currentRevision.createdAt.toISOString(),
      };
    }
    return {
      html: row.editedHtml,
      savedAt: row.editedHtmlSavedAt?.toISOString() ?? null,
    };
  }

  toDto(row: DetailPageGenerationRow): DetailPageGenerationDto {
    const stored = toDetailPageStoredJson({
      templateId: this.normalizeTemplateId(row.templateId),
      generationInput: row.generationInput,
      generationResult: row.generationResult,
    });
    const orderedImageUrls = moveSafetyLabelImagesToEnd(stored.imageUrls);
    const productName = row.generatedTitle ?? stored.rawTitle ?? '상세페이지';
    const rawInput = normalizeStoredDetailPageRawInput({
      stored,
      templateId: stored.templateId,
      productName,
      imageUrls: orderedImageUrls,
    });
    const result = this.resultRefiner.suppressProductInfoWhenSafetyLabelExists(
      stored.result,
      stored.templateId,
      orderedImageUrls,
    );
    return {
      id: row.id,
      productId: row.generationGroup.targetMasterId,
      templateId: stored.templateId,
      productName,
      rawInput,
      result,
      imageUrls: orderedImageUrls,
      processedImages: stored.processedImages,
      imageProcessingStatus: this.mapStatus(row.status),
      imageProcessingError: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async promoteEditableImageUrls(input: {
    organizationId: string;
    contentGenerationId: string;
    html: string;
  }): Promise<{
    html: string;
    assetUrlMap: Record<string, string>;
    tmpKeysToDelete: string[];
  }> {
    const uniqueUrls = [...new Set(extractImageSrcs(input.html))];
    const assetUrlMap: Record<string, string> = {};
    const tmpKeysToDelete: string[] = [];

    for (const url of uniqueUrls) {
      const key = this.imageStorage.extractKey(url);
      if (!key || !isEditableTmpImageKey(key)) continue;
      const promotedKey = permanentAssetKey({
        organizationId: input.organizationId,
        contentGenerationId: input.contentGenerationId,
        sourceKey: key,
      });
      const promotedUrl = await this.imageStorage.copy(key, promotedKey);
      assetUrlMap[url] = promotedUrl;
      tmpKeysToDelete.push(key);
    }

    let html = input.html;
    for (const [from, to] of Object.entries(assetUrlMap).sort((a, b) => b[0].length - a[0].length)) {
      html = html.split(from).join(to);
    }
    return { html, assetUrlMap, tmpKeysToDelete };
  }

  private async deleteTmpImagesBestEffort(keys: string[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.imageStorage.delete(key);
      } catch (error) {
        this.logger.warn(
          `Failed to delete tmp edited image ${key}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private normalizeTemplateId(value: string | null): DetailPageTemplateId {
    return value === 'bold-vertical' ? 'bold-vertical' : 'kids-playful';
  }

  private mapStatus(status: string): string {
    if (status === 'READY' || status === 'completed') return 'completed';
    if (status === 'FAILED' || status === 'failed') return 'failed';
    if (status === 'CANCELLED' || status === 'cancelled') return 'cancelled';
    if (status === 'PROCESSING' || status === 'generating') return 'processing';
    return status.toLowerCase();
  }
}

export function extractImageSrcs(html: string): string[] {
  const out: string[] = [];
  const quoted = /<img\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/gi;
  for (const match of html.matchAll(quoted)) {
    const value = match[2]?.trim();
    if (value) out.push(value);
  }
  const unquoted = /<img\b[^>]*?\bsrc\s*=\s*([^"'\s>]+)/gi;
  for (const match of html.matchAll(unquoted)) {
    const value = match[1]?.trim();
    if (value) out.push(value);
  }
  return [...new Set(out)];
}

function isEditableTmpImageKey(key: string): boolean {
  return key.startsWith('tmp/image-edits/') || key.startsWith('image-edits/');
}

function permanentAssetKey(input: {
  organizationId: string;
  contentGenerationId: string;
  sourceKey: string;
}): string {
  const ext = extensionFromKey(input.sourceKey);
  const hash = createHash('sha256').update(input.sourceKey).digest('hex').slice(0, 32);
  return `content-assets/${input.organizationId}/${input.contentGenerationId}/${hash}.${ext}`;
}

function extensionFromKey(key: string): string {
  const segment = key.split('/').pop() ?? '';
  const ext = segment.includes('.') ? segment.split('.').pop()?.toLowerCase() : null;
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp' || ext === 'gif') {
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  return 'png';
}

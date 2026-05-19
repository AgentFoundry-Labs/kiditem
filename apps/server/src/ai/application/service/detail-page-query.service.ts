import { createHash } from 'node:crypto';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
} from '../port/out/storage/image-storage.port';
import {
  DETAIL_PAGE_QUERY_REPOSITORY_PORT,
  type DetailPageGenerationSnapshot,
  type DetailPageQueryRepositoryPort,
} from '../port/out/repository/detail-page-query.repository.port';

export interface DetailPageListQuery {
  productId?: string | null;
  sourceCandidateId?: string | null;
  contentWorkspaceId?: string | null;
  templateId?: string | null;
}

@Injectable()
export class DetailPageQueryService {
  private readonly logger = new Logger(DetailPageQueryService.name);

  constructor(
    @Inject(DETAIL_PAGE_QUERY_REPOSITORY_PORT)
    private readonly repository: DetailPageQueryRepositoryPort,
    private readonly resultRefiner: DetailPageResultRefinerService,
    @Inject(IMAGE_STORAGE_PORT)
    private readonly imageStorage: ImageStoragePort,
  ) {}

  async list(
    organizationId: string,
    queryOrProductId?: DetailPageListQuery | string,
    legacyTemplateId?: string,
  ): Promise<DetailPageGenerationDto[]> {
    const query = typeof queryOrProductId === 'string'
      ? { productId: queryOrProductId, templateId: legacyTemplateId }
      : queryOrProductId ?? {};
    const { contentWorkspaceId, productId, sourceCandidateId, templateId } = query;
    if (templateId && templateId !== 'kids-playful' && templateId !== 'bold-vertical') {
      throw new BadRequestException('invalid templateId');
    }
    const rows = await this.repository.list({
      organizationId,
      contentWorkspaceId,
      productId,
      sourceCandidateId,
    });
    return rows
      .map((row) => this.toDto(row))
      .filter((row) => (templateId ? row.templateId === templateId : true));
  }

  async getById(id: string, organizationId: string): Promise<DetailPageGenerationDto> {
    const row = await this.repository.findById({ id, organizationId });
    if (!row) throw new NotFoundException('Detail page generation not found');
    return this.toDto(row);
  }

  async remove(id: string, organizationId: string): Promise<{ ok: true }> {
    const exists = await this.repository.existsActive({ id, organizationId });
    if (!exists) throw new NotFoundException('Detail page generation not found');
    await this.repository.markDeleted({ id, organizationId, deletedAt: new Date() });
    return { ok: true };
  }

  async renameVersion(
    id: string,
    organizationId: string,
    title: string,
  ): Promise<{ ok: true }> {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) throw new BadRequestException('title is required');
    const renamed = await this.repository.renameVersion({ id, organizationId, title: normalizedTitle });
    if (!renamed) throw new NotFoundException('Detail page generation not found');
    return { ok: true };
  }

  async duplicateVersion(
    id: string,
    organizationId: string,
    triggeredByUserId: string | null,
  ): Promise<DetailPageGenerationDto> {
    const source = await this.repository.findDuplicateSource({ id, organizationId });
    if (!source) throw new NotFoundException('Detail page generation not found');

    const duplicateTitle = duplicateVersionTitle(
      source.detailPageArtifact?.title ?? source.generatedTitle ?? '상세페이지',
    );
    const duplicated = await this.repository.duplicateVersion({
      organizationId,
      triggeredByUserId,
      source,
      duplicateTitle,
    });

    return this.toDto(duplicated);
  }

  async saveEditedHtml(
    id: string,
    organizationId: string,
    html: string,
  ): Promise<{ html: string; savedAt: string; assetUrlMap: Record<string, string> }> {
    if (!isRenderableDetailHtml(html)) {
      throw new BadRequestException('렌더링 가능한 상세페이지 HTML만 저장할 수 있습니다.');
    }
    const promoted = await this.promoteEditableImageUrls({
      organizationId,
      contentGenerationId: id,
      html,
    });
    const imageUrls = extractImageSrcs(promoted.html);
    const savedAt = new Date();
    const revision = await this.repository.saveEditedHtmlRevision({
      organizationId,
      contentGenerationId: id,
      html: promoted.html,
      assetUrlMap: promoted.assetUrlMap,
      imageUrls,
      savedAt,
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
    const row = await this.repository.getEditedHtml({ id, organizationId });
    if (!row) throw new NotFoundException('Detail page generation not found');
    const currentRevision = row.detailPageArtifact?.currentRevision;
    if (
      currentRevision &&
      row.detailPageArtifact?.isDeleted === false &&
      isRenderableDetailHtml(currentRevision.html)
    ) {
      return {
        html: currentRevision.html,
        savedAt: currentRevision.createdAt.toISOString(),
      };
    }
    if (!isRenderableDetailHtml(row.editedHtml)) {
      return {
        html: null,
        savedAt: null,
      };
    }
    return {
      html: row.editedHtml,
      savedAt: row.editedHtmlSavedAt?.toISOString() ?? null,
    };
  }

  toDto(row: DetailPageGenerationSnapshot): DetailPageGenerationDto {
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
      sourceCandidateId: row.sourceCandidateId,
      contentWorkspaceId: row.contentWorkspaceId,
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

function duplicateVersionTitle(title: string): string {
  const normalized = title.trim() || '상세페이지';
  return normalized.endsWith('복사본') ? `${normalized} 2` : `${normalized} 복사본`;
}

function isRenderableDetailHtml(html: string | null | undefined): html is string {
  const source = html?.trim();
  if (!source) return false;
  if (source.startsWith('{') || source.startsWith('[')) return false;
  return (
    /^<!doctype\s+html/i.test(source) ||
    /^<html[\s>]/i.test(source) ||
    /^<body[\s>]/i.test(source) ||
    /<\/?[a-z][\s\S]*>/i.test(source)
  );
}

function extensionFromKey(key: string): string {
  const segment = key.split('/').pop() ?? '';
  const ext = segment.includes('.') ? segment.split('.').pop()?.toLowerCase() : null;
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp' || ext === 'gif') {
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  return 'png';
}

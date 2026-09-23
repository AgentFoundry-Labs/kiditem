import { createHash } from 'node:crypto';
import type { DetailPageWithRevisions } from '@kiditem/shared/product-content';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { moveSafetyLabelImagesToEnd } from '../../domain/detail-page-image-order';
import { buildUploadedDetailPageHtml } from '../../domain/detail-page/uploaded-detail-page';
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
  DETAIL_PAGE_REPOSITORY_PORT,
  type DetailPageRepositoryPort,
  type DetailPageRow,
} from '../port/out/repository/detail-page.repository.port';
import { isRenderableDetailHtml } from '../../domain/detail-page/renderable-detail-html';
import { DETAIL_PAGE_REVISION_TYPE } from '../../domain/detail-page/detail-page-revision-type';

export interface DetailPageListQuery {
  contentWorkspaceId?: string | null;
  templateId?: string | null;
}

@Injectable()
export class DetailPageQueryService {
  private readonly logger = new Logger(DetailPageQueryService.name);

  constructor(
    @Inject(DETAIL_PAGE_REPOSITORY_PORT)
    private readonly detailPages: DetailPageRepositoryPort,
    private readonly resultRefiner: DetailPageResultRefinerService,
    @Inject(IMAGE_STORAGE_PORT)
    private readonly imageStorage: ImageStoragePort,
  ) {}

  async list(
    organizationId: string,
    query: DetailPageListQuery = {},
  ): Promise<DetailPageGenerationDto[]> {
    const { contentWorkspaceId, templateId } = query;
    if (templateId && templateId !== 'kids-playful' && templateId !== 'bold-vertical') {
      throw new BadRequestException('invalid templateId');
    }
    const rows = await this.detailPages.listByWorkspace({
      organizationId,
      contentWorkspaceId: contentWorkspaceId ?? null,
    });
    return rows
      .map((row) => this.toDto(row))
      .filter((row) => (templateId ? row.templateId === templateId : true));
  }

  async getById(id: string, organizationId: string): Promise<DetailPageGenerationDto> {
    const row = await this.detailPages.findById({ detailPageId: id, organizationId });
    if (!row) throw new NotFoundException('Detail page not found');
    return this.toDto(row);
  }

  /** 상세 페이지 하나와 그 revision 이력(새 것부터). 이 페이지의 현재가 몰로 가는 현재인지도 말한다. */
  async getWithRevisions(id: string, organizationId: string): Promise<DetailPageWithRevisions> {
    const page = await this.detailPages.findById({ organizationId, detailPageId: id });
    if (!page) throw new NotFoundException('Detail page not found');
    const [revisions, workspaceCurrent] = await Promise.all([
      this.detailPages.listRevisions({ organizationId, detailPageId: id }),
      this.detailPages.findWorkspaceRevision({ organizationId, contentWorkspaceId: page.contentWorkspaceId, revisionId: null }),
    ]);
    return {
      id: page.id,
      contentWorkspaceId: page.contentWorkspaceId,
      source: page.source,
      templateId: page.templateId,
      title: page.title,
      status: page.status,
      errorMessage: page.errorMessage,
      currentRevisionId: page.currentRevisionId,
      isWorkspaceCurrent: Boolean(page.currentRevisionId && workspaceCurrent?.id === page.currentRevisionId),
      createdAt: page.createdAt.toISOString(),
      updatedAt: page.updatedAt.toISOString(),
      revisions: revisions.map((revision) => ({
        id: revision.id,
        detailPageId: revision.detailPageId,
        revisionType: revision.revisionType,
        imageUrls: [...revision.imageUrls],
        source: revision.source,
        createdByUserId: revision.createdByUserId,
        createdAt: revision.createdAt.toISOString(),
      })),
    };
  }

  async remove(id: string, organizationId: string): Promise<{ ok: true }> {
    const deleted = await this.detailPages.runInTransaction((transaction) =>
      this.detailPages.markDeleted(transaction, { organizationId, detailPageId: id }));
    if (!deleted) throw new NotFoundException('Detail page not found');
    return { ok: true };
  }

  async renameVersion(
    id: string,
    organizationId: string,
    title: string,
  ): Promise<{ ok: true }> {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) throw new BadRequestException('title is required');
    const renamed = await this.detailPages.runInTransaction((transaction) =>
      this.detailPages.rename(transaction, { organizationId, detailPageId: id, title: normalizedTitle }));
    if (!renamed) throw new NotFoundException('Detail page not found');
    return { ok: true };
  }

  /**
   * 상세 페이지를 복제한다 — 같은 워크스페이스에 사람이 만든(`manual`) 새 상세 페이지와, 원본의 현재 revision 을
   * 옮긴 `duplicate` revision. 사람이 한 일이라 몰로 가는 현재가 된다. 저장한 HTML 이 없는 페이지는 복제할 것이 없다.
   */
  async duplicateVersion(
    id: string,
    organizationId: string,
    triggeredByUserId: string | null,
  ): Promise<DetailPageGenerationDto> {
    const source = await this.detailPages.findById({ organizationId, detailPageId: id });
    if (!source) throw new NotFoundException('Detail page not found');
    const sourceRevision = source.currentRevisionId
      ? await this.detailPages.findRevision({ organizationId, revisionId: source.currentRevisionId })
      : null;
    if (!sourceRevision) throw new BadRequestException('저장한 상세페이지가 있어야 복제할 수 있습니다.');

    const duplicated = await this.detailPages.runInTransaction(async (transaction) => {
      const page = await this.detailPages.create(transaction, {
        organizationId,
        contentWorkspaceId: source.contentWorkspaceId,
        source: 'manual',
        templateId: source.templateId,
        title: duplicateVersionTitle(source.title ?? '상세페이지'),
        status: 'ready',
        generationInput: { duplicatedFromDetailPageId: source.id, duplicatedFromRevisionId: sourceRevision.id },
        triggeredByUserId,
      });
      await this.detailPages.appendRevision(transaction, {
        organizationId,
        detailPageId: page.id,
        revisionType: DETAIL_PAGE_REVISION_TYPE.duplicate,
        html: sourceRevision.html,
        imageUrls: sourceRevision.imageUrls,
        assetUrlMap: sourceRevision.assetUrlMap,
        createdByUserId: triggeredByUserId,
      });
      return page.id;
    });
    return this.getById(duplicated, organizationId);
  }

  /**
   * 다른 데서 가져온 상세페이지를 우리 상세페이지로 등록한다. AI 를 부르지 않는다 — 이미 있는
   * 이미지를 세로로 이어 한 판으로 만들 뿐이다(사장님 2026-09-22). `source: 'uploaded'` 상세 페이지 하나이고,
   * HTML 은 편집 저장과 **같은 경로**로 넣는다(사람의 `manual_edit`). 그래야 이미지 승격 규칙이 한 벌로 남는다.
   */
  async registerUploaded(input: {
    organizationId: string;
    triggeredByUserId: string | null;
    contentWorkspaceId: string;
    title: string;
    imageUrls: readonly string[];
  }): Promise<{ id: string; contentWorkspaceId: string }> {
    let html: string;
    try {
      html = buildUploadedDetailPageHtml({ title: input.title, imageUrls: input.imageUrls });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '상세페이지를 만들지 못했습니다.');
    }
    const title = input.title.trim().slice(0, 80) || '상세페이지';
    const created = await this.detailPages.runInTransaction((transaction) => this.detailPages.create(transaction, {
      organizationId: input.organizationId,
      contentWorkspaceId: input.contentWorkspaceId,
      source: 'uploaded',
      templateId: null,
      title,
      status: 'ready',
      generationInput: { imageUrls: [...input.imageUrls] },
      triggeredByUserId: input.triggeredByUserId,
    }));
    await this.saveEditedHtml(created.id, input.organizationId, html, input.triggeredByUserId);
    return { id: created.id, contentWorkspaceId: input.contentWorkspaceId };
  }

  /**
   * 편집 저장. 생성 페이지의 첫 저장은 웹 템플릿이 결과로 처음 그린 HTML 이라 `generated`, 그 밖은 사람의
   * `manual_edit` 이다. 두 현재 포인터는 상세 페이지 저장소가 도메인 규칙으로 옮긴다.
   */
  async saveEditedHtml(
    id: string,
    organizationId: string,
    html: string,
    savedByUserId: string | null = null,
  ): Promise<{ html: string; savedAt: string; assetUrlMap: Record<string, string> }> {
    if (!isRenderableDetailHtml(html)) {
      throw new BadRequestException('렌더링 가능한 상세페이지 HTML만 저장할 수 있습니다.');
    }
    const page = await this.detailPages.findById({ organizationId, detailPageId: id });
    if (!page) throw new NotFoundException('Detail page not found');
    const promoted = await this.promoteEditableImageUrls({ organizationId, detailPageId: id, html });
    const imageUrls = extractImageSrcs(promoted.html);
    // 새 페이지의 첫 revision 은 늘 그 페이지의 현재가 되므로, 현재가 없으면 아직 저장한 적이 없다.
    const revisionType = page.source === 'generated' && !page.currentRevisionId
      ? DETAIL_PAGE_REVISION_TYPE.generated
      : DETAIL_PAGE_REVISION_TYPE.manual_edit;
    const revision = await this.detailPages.runInTransaction(async (transaction) => {
      return this.detailPages.appendRevision(transaction, {
        organizationId,
        detailPageId: id,
        revisionType,
        html: promoted.html,
        imageUrls,
        assetUrlMap: promoted.assetUrlMap,
        createdByUserId: savedByUserId ?? page.triggeredByUserId,
      });
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
    const page = await this.detailPages.findById({ organizationId, detailPageId: id });
    if (!page) throw new NotFoundException('Detail page not found');
    const revision = page.currentRevisionId
      ? await this.detailPages.findRevision({ organizationId, revisionId: page.currentRevisionId })
      : null;
    if (revision && isRenderableDetailHtml(revision.html)) {
      return { html: revision.html, savedAt: revision.createdAt.toISOString() };
    }
    return { html: null, savedAt: null };
  }

  toDto(row: DetailPageRow): DetailPageGenerationDto {
    const stored = toDetailPageStoredJson({
      templateId: this.normalizeTemplateId(row.templateId),
      generationInput: row.generationInput,
      generationResult: row.generationResult,
    });
    const orderedImageUrls = moveSafetyLabelImagesToEnd(stored.imageUrls);
    const productName = row.title ?? stored.rawTitle ?? '상세페이지';
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
      contentWorkspaceId: row.contentWorkspaceId,
      templateId: stored.templateId,
      productName,
      rawInput,
      result,
      imageUrls: orderedImageUrls,
      processedImages: stored.processedImages,
      imageProcessingStatus: mapStatus(row.status),
      imageProcessingError: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async promoteEditableImageUrls(input: {
    organizationId: string;
    detailPageId: string;
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
        detailPageId: input.detailPageId,
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

}

/**
 * 웹이 읽는 진행 표시(옛 계약 그대로): 생성 전 · 중 → processing, ready → completed, failed → failed(취소 포함 —
 * 사유는 `imageProcessingError`).
 */
function mapStatus(status: DetailPageRow['status']): string {
  if (status === 'ready') return 'completed';
  if (status === 'failed') return 'failed';
  return 'processing';
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
  detailPageId: string;
  sourceKey: string;
}): string {
  const ext = extensionFromKey(input.sourceKey);
  const hash = createHash('sha256').update(input.sourceKey).digest('hex').slice(0, 32);
  return `content-assets/${input.organizationId}/${input.detailPageId}/${hash}.${ext}`;
}

function duplicateVersionTitle(title: string): string {
  const normalized = title.trim() || '상세페이지';
  return normalized.endsWith('복사본') ? `${normalized} 2` : `${normalized} 복사본`;
}

function extensionFromKey(key: string): string {
  const segment = key.split('/').pop() ?? '';
  const ext = segment.includes('.') ? segment.split('.').pop()?.toLowerCase() : null;
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp' || ext === 'gif') {
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  return 'png';
}

import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ThumbnailJobListResponse } from '@kiditem/shared/ai';
import type { ThumbnailJob } from '@kiditem/shared/product-content';
import { resolveWorkspaceThumbnailSource } from '../../domain/thumbnail-workspace-source';
import { toThumbnailJob } from '../../domain/thumbnail/thumbnail-job.mapper';
import {
  THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT,
  type ThumbnailGenerationLedgerRepositoryPort,
  type ThumbnailJobRow,
} from '../port/out/repository/thumbnail-generation-ledger.repository.port';
import {
  CONTENT_ASSET_LIBRARY_REPOSITORY_PORT,
  type ContentAssetLibraryRepositoryPort,
} from '../port/out/repository/content-asset-library.repository.port';
import {
  ThumbnailGenerationJobService,
  type ThumbnailEditorGenerationEnqueueInput,
} from './thumbnail-generation-job.service';
import type { ThumbnailGenerationListScope } from '../../domain/thumbnail-generation-subject';
import { toContentAssetItem } from './content-asset.service';

/**
 * 대표이미지 생성 job 의 읽기와 운영자 동작(KID-313 W3a). 결과 후보는 `content_assets` 행이고, 채택은
 * `PATCH /ai/content-workspaces/:id/current-thumbnail` 하나가 한다 — job 에는 선택 · 적용 단계가 없다.
 */
@Injectable()
export class ThumbnailGenerationService {
  private readonly logger = new Logger(ThumbnailGenerationService.name);

  constructor(
    @Inject(THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT)
    private readonly ledger: ThumbnailGenerationLedgerRepositoryPort,
    @Inject(CONTENT_ASSET_LIBRARY_REPOSITORY_PORT)
    private readonly assets: ContentAssetLibraryRepositoryPort,
    private readonly generationJobs: ThumbnailGenerationJobService,
  ) {}

  async findWorkspaceForThumbnailEditor(contentWorkspaceId: string, organizationId: string) {
    return this.ledger.findWorkspaceForThumbnailEditor(contentWorkspaceId, organizationId);
  }

  async enqueueEditorGeneration(
    input: ThumbnailEditorGenerationEnqueueInput,
  ): Promise<{ generationId: string; status: 'pending' | 'cancelled' }> {
    return this.generationJobs.enqueueEditorGeneration(input);
  }

  async enqueueSalesProductGeneration(
    input: Parameters<ThumbnailGenerationJobService['enqueueSalesProductGeneration']>[0],
  ): Promise<{ generationId: string; status: 'pending' | 'cancelled' }> {
    return this.generationJobs.enqueueSalesProductGeneration(input);
  }

  async enqueueStandaloneGeneration(
    input: Parameters<ThumbnailGenerationJobService['enqueueStandaloneGeneration']>[0],
  ): Promise<{ generationId: string; status: 'pending' | 'cancelled' }> {
    return this.generationJobs.enqueueStandaloneGeneration(input);
  }

  async findAll(
    organizationId: string,
    opts: {
      contentWorkspaceId?: string | null;
      scope?: ThumbnailGenerationListScope;
      limit?: number | null;
    } = {},
  ): Promise<ThumbnailJobListResponse> {
    const rows = await this.ledger.findGenerationRows(organizationId, opts);
    return this.toListResponse(organizationId, rows);
  }

  async findOne(id: string, organizationId: string): Promise<ThumbnailJobListResponse> {
    const row = await this.ledger.findGenerationOrThrow(id, organizationId);
    return this.toListResponse(organizationId, [row]);
  }

  async skipGeneration(id: string, organizationId: string): Promise<ThumbnailJobListResponse> {
    const cancellation = await this.ledger.cancelDirectGeneration({
      organizationId,
      generationId: id,
      reason: 'Thumbnail generation cancelled by user.',
    });
    if (cancellation.status === 'not_found') {
      throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
    }
    return this.findOne(id, organizationId);
  }

  async cancelGeneration(input: {
    organizationId: string;
    generationId: string;
    actorUserId: string | null;
    reason: string;
  }): Promise<{
    status: 'cancelled' | 'already_terminal' | 'not_found';
    generationId: string;
    preserved: boolean;
  }> {
    return this.ledger.cancelDirectGeneration({
      organizationId: input.organizationId,
      generationId: input.generationId,
      reason: input.reason,
    });
  }

  async deleteGeneration(id: string, organizationId: string): Promise<{ ok: true }> {
    await this.assertGenerationOwned(id, organizationId);
    await this.ledger.deleteGeneration(id, organizationId);
    return { ok: true };
  }

  async removeCandidate(
    id: string,
    organizationId: string,
    assetId: string,
  ): Promise<{ ok: true; generationDeleted: boolean; remaining: number }> {
    const result = await this.ledger.removeCandidate({ id, organizationId, assetId });
    if (!result) {
      throw new NotFoundException('해당 후보를 찾을 수 없습니다');
    }
    return { ok: true, ...result };
  }

  async createEditJobs(
    contentWorkspaceIds: string[],
    organizationId: string,
    purpose: 'compliance' | 'quality',
    variantKey: 'auto' | 'with-box' | 'no-box' | null,
    triggeredByUserId: string | null,
    method = 'generate',
  ): Promise<ThumbnailJob[]> {
    if (contentWorkspaceIds.length === 0) return [];
    const byId = await this.ledger.findWorkspacesForThumbnailJobs(contentWorkspaceIds, organizationId);
    const items: ThumbnailJob[] = [];

    for (const contentWorkspaceId of contentWorkspaceIds) {
      const workspace = byId.get(contentWorkspaceId);
      if (!workspace) {
        throw new NotFoundException(`ContentWorkspace ${contentWorkspaceId} not found`);
      }
      const sourceUrl = resolveWorkspaceThumbnailSource(workspace);
      if (!sourceUrl) throw new BadRequestException('상품 원본 이미지가 필요합니다');

      const active = await this.ledger.findActiveJobForWorkspace(workspace.id, organizationId, method);
      if (active) {
        items.push(toThumbnailJob(active));
        continue;
      }

      const generation = await this.ledger.openPendingEditorJob({
        organizationId,
        contentWorkspaceId: workspace.id,
        originalUrl: sourceUrl,
        method,
        inputMeta: {
          mode: 'edit',
          purpose,
          editCase: 'single',
          variantKey: variantKey ?? 'auto',
          automated: method === 'auto',
          inputCount: 1,
        },
        triggeredByUserId,
      });
      await this.generationJobs.scheduleEditJob(generation.id, organizationId, purpose, variantKey);
      items.push(toThumbnailJob(generation));
    }
    return items;
  }

  async reEditJob(
    id: string,
    organizationId: string,
    purpose: 'compliance' | 'quality',
    variantKey: 'auto' | 'with-box' | 'no-box' | null,
  ): Promise<{ ok: true }> {
    const change = await this.ledger.resetGenerationForReEdit({ id, organizationId, purpose, variantKey });
    if (!change) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
    await this.generationJobs.scheduleEditJob(id, organizationId, purpose, variantKey);
    return { ok: true };
  }

  async createAutoBatch(
    organizationId: string,
    limit = 30,
    triggeredByUserId: string | null = null,
  ): Promise<{
    attempted: number;
    succeeded: number;
    failed: number;
    skipped: number;
    runs: Array<{
      ok: boolean;
      contentWorkspaceId: string;
      generationId?: string | null;
      error?: string;
    }>;
  }> {
    const take = Math.min(Math.max(limit, 1), 30);
    const cooldown = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const workspaces = await this.ledger.findAutoBatchCandidates(organizationId, take * 3);

    const runs: Array<{
      ok: boolean;
      contentWorkspaceId: string;
      generationId?: string | null;
      error?: string;
    }> = [];
    let skipped = 0;
    for (const workspace of workspaces) {
      if (runs.length >= take) break;
      const recent = await this.ledger.findRecentAutoJob(workspace.id, organizationId, cooldown);
      if (recent) {
        skipped++;
        continue;
      }
      try {
        const [item] = await this.createEditJobs(
          [workspace.id],
          organizationId,
          'compliance',
          'auto',
          triggeredByUserId,
          'auto',
        );
        runs.push({ ok: true, contentWorkspaceId: workspace.id, generationId: item?.id ?? null });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[thumbnail-auto] failed contentWorkspaceId=${workspace.id}: ${message}`);
        runs.push({ ok: false, contentWorkspaceId: workspace.id, error: message });
      }
    }

    const succeeded = runs.filter((run) => run.ok).length;
    return { attempted: runs.length, succeeded, failed: runs.length - succeeded, skipped, runs };
  }

  private async toListResponse(organizationId: string, rows: ThumbnailJobRow[]): Promise<ThumbnailJobListResponse> {
    const [candidates, workspaces] = await Promise.all([
      this.assets.listThumbnailCandidates({ organizationId, thumbnailGenerationIds: rows.map((row) => row.id) }),
      this.ledger.findGenerationWorkspaces(rows, organizationId),
    ]);
    return {
      items: rows.map(toThumbnailJob),
      candidates: candidates.map(toContentAssetItem),
      workspaces: [...workspaces.values()].map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        imageUrl: workspace.imageUrl,
      })),
      total: rows.length,
    };
  }

  private async assertGenerationOwned(id: string, organizationId: string): Promise<void> {
    const existing = await this.ledger.findGenerationProjectionStatus({ generationId: id, organizationId });
    if (!existing) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
  }
}

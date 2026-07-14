import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import type { ThumbnailGenerationItem, ThumbnailGenerationListResponse } from '@kiditem/shared/ai';
import { AI_OPERATION_ALERT_PORT, type OperationAlertPort } from '../port/out/cross-domain/operation-alert.port';
import { resolveWorkspaceThumbnailSource } from '../../domain/thumbnail-workspace-source';
import { ThumbnailTrackingService } from './thumbnail-tracking.service';
import {
  type ThumbnailAnalysisContext,
  extractEditSuggestions,
  toAnalysisContextJson,
  toEditAnalysis,
} from '../../domain/thumbnail-generation-inputs';
import { toThumbnailGenerationItem, type GenerationRow } from '../../mapper/thumbnail-generation.mapper';
import {
  THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT,
  type SaveEditorResultInput,
  type ThumbnailGenerationLedgerRepositoryPort,
} from '../port/out/repository/thumbnail-generation-ledger.repository.port';
import {
  ThumbnailGenerationJobService,
  type ThumbnailEditorGenerationEnqueueInput,
} from './thumbnail-generation-job.service';
import { operationCancellationAudit } from '../../../common/operation-cancellation-audit';
import { ProductGenerationAlertService } from './product-generation-alert.service';
import { readProductGenerationAlertLink } from './product-generation-alert-link';
import type { ThumbnailGenerationListScope } from '../../domain/thumbnail-generation-subject';
import { ThumbnailGenerationLifecycleService } from './thumbnail-generation-lifecycle.service';

@Injectable()
export class ThumbnailGenerationService {
  private readonly logger = new Logger(ThumbnailGenerationService.name);

  constructor(
    @Inject(THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT)
    private readonly ledger: ThumbnailGenerationLedgerRepositoryPort,
    private readonly trackingService: ThumbnailTrackingService,
    @Inject(AI_OPERATION_ALERT_PORT)
    private readonly operationAlerts: OperationAlertPort,
    private readonly generationJobs: ThumbnailGenerationJobService,
    private readonly lifecycle: ThumbnailGenerationLifecycleService,
    @Optional()
    private readonly productGenerationAlerts: ProductGenerationAlertService | null = null,
  ) {}

  private editJobOperationKey(generationId: string): string {
    return `thumbnail-edit:${generationId}`;
  }

  private thumbnailGenerationHref(generationId: string): string {
    return `/product-pipeline/thumbnail-generation?generationId=${encodeURIComponent(generationId)}`;
  }

  async findWorkspaceForThumbnailEditor(contentWorkspaceId: string, organizationId: string) {
    return this.ledger.findWorkspaceForThumbnailEditor(contentWorkspaceId, organizationId);
  }

  async saveEditorResult(input: SaveEditorResultInput): Promise<string> {
    await this.assertWorkspaceOwned(input.contentWorkspaceId, input.organizationId);
    const generationId = await this.ledger.saveEditorResult(input);
    await this.lifecycle.recordStatusChange({
      organizationId: input.organizationId,
      generationId,
      fromStatus: null,
      toStatus: 'succeeded',
      fromPhase: null,
      toPhase: 'ready',
      actorUserId: input.triggeredByUserId ?? null,
      payload: {
        method: input.method,
        inputCount: input.inputImages?.length ?? 0,
        candidateCount: input.candidates.length,
      },
    });
    return generationId;
  }

  async enqueueEditorGeneration(
    input: ThumbnailEditorGenerationEnqueueInput,
  ): Promise<{ generationId: string; status: 'pending' | 'cancelled' }> {
    return this.generationJobs.enqueueEditorGeneration(input);
  }

  async enqueueCandidateGeneration(
    input: Parameters<ThumbnailGenerationJobService['enqueueCandidateGeneration']>[0],
  ): Promise<{ generationId: string; status: 'pending' | 'cancelled' }> {
    return this.generationJobs.enqueueCandidateGeneration(input);
  }

  async enqueueStandaloneGeneration(
    input: Parameters<ThumbnailGenerationJobService['enqueueStandaloneGeneration']>[0],
  ): Promise<{ generationId: string; status: 'pending' | 'cancelled' }> {
    return this.generationJobs.enqueueStandaloneGeneration(input);
  }

  async findAll(
    organizationId: string,
    opts: {
      sourceCandidateId?: string | null;
      contentWorkspaceId?: string | null;
      scope?: ThumbnailGenerationListScope;
      limit?: number | null;
    } = {},
  ): Promise<ThumbnailGenerationListResponse> {
    const rows = await this.ledger.findGenerationRows(organizationId, opts);
    const workspaces = await this.ledger.findGenerationWorkspaces(rows, organizationId);
    const items = rows.map((r) =>
      toThumbnailGenerationItem(r as GenerationRow, workspaces.get(r.contentWorkspaceId) ?? null),
    );
    return {
      items,
      total: items.length,
    } satisfies ThumbnailGenerationListResponse;
  }

  async findOne(id: string, organizationId: string): Promise<ThumbnailGenerationItem> {
    const row = await this.ledger.findGenerationOrThrow(id, organizationId);
    const workspace = await this.ledger.findGenerationWorkspace(row.contentWorkspaceId, organizationId);
    return toThumbnailGenerationItem(row as GenerationRow, workspace);
  }

  async selectCandidate(id: string, organizationId: string, selectedUrl: string): Promise<ThumbnailGenerationItem> {
    const existing = await this.ledger.findGenerationWithCandidatesOrThrow(id, organizationId);
    const isDeselect = !selectedUrl;
    if (!isDeselect && !existing.candidates.some((c) => c.url === selectedUrl)) {
      throw new BadRequestException('selectedUrl 은 해당 generation 의 candidates 중 하나여야 합니다');
    }
    await this.ledger.setSelectedCandidate(id, organizationId, isDeselect ? null : selectedUrl);
    return this.findOne(id, organizationId);
  }

  /**
   * "선택 대기" (`phase: 'ready'`) 상태 generation 들의 `selectedUrl` 일괄 해제.
   * 사용자가 thumbnails 페이지의 "선택 대기" 탭에 진입할 때마다 깨끗한 상태로
   * 시작하도록 frontend 가 호출. applied 항목은 유지.
   */
  async clearReadySelections(organizationId: string): Promise<{ count: number }> {
    return this.ledger.clearReadySelections(organizationId);
  }

  async applyGeneration(
    id: string,
    organizationId: string,
    actorUserId: string | null = null,
  ): Promise<ThumbnailGenerationItem> {
    const existing = await this.ledger.findGenerationWithCandidatesOrThrow(id, organizationId);
    const workspace = await this.ledger.findGenerationWorkspace(existing.contentWorkspaceId, organizationId);
    if (!workspace) {
      throw new NotFoundException(`ContentWorkspace ${existing.contentWorkspaceId} not found`);
    }

    const matchedCandidate = existing.candidates.find((c) => c.url === existing.selectedUrl);
    const selected = matchedCandidate
      ? {
          url: matchedCandidate.url,
          storageKey: matchedCandidate.storageKey,
          mimeType: matchedCandidate.mimeType ?? null,
          width: matchedCandidate.width ?? null,
          height: matchedCandidate.height ?? null,
          fileSize: matchedCandidate.fileSize ?? null,
        }
      : existing.selectedUrl
        ? { url: existing.selectedUrl, storageKey: null }
        : null;

    await this.ledger.applyGenerationToWorkspace({
      id,
      organizationId,
      contentWorkspaceId: existing.contentWorkspaceId,
      selected,
    });
    await this.lifecycle.recordPhaseChange({
      organizationId,
      generationId: id,
      fromPhase: existing.phase,
      toPhase: 'applied',
      fromStatus: existing.status,
      toStatus: 'succeeded',
      actorUserId,
      payload: { selectedUrl: selected?.url ?? null },
    });

    const analysis = await this.ledger.findThumbnailAnalysisGrade(existing.contentWorkspaceId, organizationId);
    void this.trackingService
      .create({
        organizationId,
        contentWorkspaceId: existing.contentWorkspaceId,
        generationId: existing.id,
        originalGrade: analysis?.grade ?? existing.grade,
        originalScore: analysis?.overallScore ?? existing.score,
      })
      .catch((err) => {
        this.logger.warn(
          `ThumbnailTracking 자동 생성 실패 (generationId=${existing.id}): ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    return this.findOne(id, organizationId);
  }

  async skipGeneration(
    id: string,
    organizationId: string,
    triggeredByUserId: string | null = null,
  ): Promise<ThumbnailGenerationItem> {
    const change = await this.lifecycle.markCancelled({
      generationId: id,
      organizationId,
      actorUserId: triggeredByUserId,
    });
    if (!change) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
    // No-op when the generation never opened an alert (e.g. auto-batch).
    await this.operationAlerts.cancel(organizationId, this.editJobOperationKey(id));
    return this.findOne(id, organizationId);
  }

  async cancelForOperation(input: {
    organizationId: string;
    generationId: string;
    actorUserId: string | null;
    reason: string;
    notifyProductGenerationParent?: boolean;
  }): Promise<{
    status: 'cancelled' | 'already_terminal' | 'not_found';
    generationId: string;
    operationKey: string | null;
    preserved: boolean;
  }> {
    const row = await this.ledger.findGenerationProjectionStatus({
      generationId: input.generationId,
      organizationId: input.organizationId,
    });
    if (!row) {
      return {
        status: 'not_found',
        generationId: input.generationId,
        operationKey: null,
        preserved: false,
      };
    }
    if (!['pending', 'running'].includes(row.status)) {
      return {
        status: 'already_terminal',
        generationId: row.id,
        operationKey: this.editJobOperationKey(row.id),
        preserved: row.status === 'succeeded' || row.phase === 'applied',
      };
    }

    const change = await this.lifecycle.markCancelled({
      organizationId: input.organizationId,
      generationId: row.id,
      actorUserId: input.actorUserId,
      payload: {
        reason: input.reason,
        operationCancellation: operationCancellationAudit({
          requestedByUserId: input.actorUserId,
          reason: input.reason,
          target: { targetType: 'thumbnail_generation', generationId: row.id },
          affected: { thumbnailGenerationIds: [row.id] },
          result: 'cancelled',
        }),
      },
    });
    if (!change) {
      return {
        status: 'already_terminal',
        generationId: row.id,
        operationKey: this.editJobOperationKey(row.id),
        preserved: false,
      };
    }
    await this.generationJobs.cancelAgentRequestForGeneration({
      organizationId: input.organizationId,
      generationId: row.id,
      reason: input.reason,
      actorUserId: input.actorUserId,
    });
    await this.operationAlerts.cancel(input.organizationId, this.editJobOperationKey(row.id), {
      message: input.reason,
      metadata: {
        errorCode: 'user_cancelled',
        cancel: {
          requestedByUserId: input.actorUserId,
          requestedAt: new Date().toISOString(),
          reason: input.reason,
        },
      },
    });
    const parentLink = readProductGenerationAlertLink(row.inputMeta);
    if (parentLink && input.notifyProductGenerationParent !== false && this.productGenerationAlerts) {
      await this.productGenerationAlerts.markChildFinished({
        organizationId: input.organizationId,
        parentOperationKey: parentLink.parentOperationKey,
        childKind: parentLink.childKind,
        status: 'failed',
        childId: row.id,
        errorMessage: input.reason,
      });
    }
    return {
      status: 'cancelled',
      generationId: row.id,
      operationKey: this.editJobOperationKey(row.id),
      preserved: false,
    };
  }

  async deleteGeneration(id: string, organizationId: string): Promise<{ ok: true }> {
    await this.assertGenerationOwned(id, organizationId);
    await this.ledger.deleteGeneration(id, organizationId);
    return { ok: true };
  }

  async removeCandidate(
    id: string,
    organizationId: string,
    candidateUrl: string,
  ): Promise<{ ok: true; generationDeleted: boolean; remaining: number }> {
    const result = await this.ledger.removeCandidate({
      id,
      organizationId,
      candidateUrl,
    });
    if (!result) {
      throw new NotFoundException('해당 candidate URL 을 찾을 수 없습니다');
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
  ): Promise<ThumbnailGenerationItem[]> {
    if (contentWorkspaceIds.length === 0) return [];
    const byId = await this.ledger.findWorkspacesForThumbnailJobs(contentWorkspaceIds, organizationId);
    const items: ThumbnailGenerationItem[] = [];

    for (const contentWorkspaceId of contentWorkspaceIds) {
      const workspace = byId.get(contentWorkspaceId);
      if (!workspace) {
        throw new NotFoundException(`ContentWorkspace ${contentWorkspaceId} not found`);
      }
      const sourceUrl = resolveWorkspaceThumbnailSource(workspace);
      if (!sourceUrl) throw new BadRequestException('상품 원본 이미지가 필요합니다');

      const active = await this.ledger.findActiveJobForWorkspace(workspace.id, organizationId, method);
      if (active) {
        items.push(toThumbnailGenerationItem(active as GenerationRow, workspace));
        continue;
      }

      const analysis: ThumbnailAnalysisContext | null = workspace.thumbnailAnalyses[0] ?? null;
      const editSuggestions = extractEditSuggestions(analysis?.complianceScores ?? null);
      const editAnalysis = toEditAnalysis(analysis);

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
          recompose: analysis?.recompose ?? null,
          analysisContext: toAnalysisContextJson(analysis, editSuggestions),
        },
        editAnalysis,
        triggeredByUserId,
      });
      await this.lifecycle.recordStatusChange({
        organizationId,
        generationId: generation.id,
        fromStatus: null,
        toStatus: 'pending',
        fromPhase: null,
        toPhase: null,
        actorUserId: triggeredByUserId,
        payload: {
          method,
          contentWorkspaceId: workspace.id,
          purpose,
          variantKey: variantKey ?? 'auto',
          automated: method === 'auto',
        },
      });

      // Per-generation alert for every method, including auto-batch. The
      // earlier "method === 'auto'" gate was dropped because the cohort alert
      // it relied on was being marked succeeded before background jobs
      // finished — see review feedback on PR #209. Per-generation alerts are
      // the source of truth for actual edit-job completion.
      await this.operationAlerts.start({
        organizationId,
        operationKey: this.editJobOperationKey(generation.id),
        type: 'thumbnail_edit_job',
        title: `${method === 'auto' ? '썸네일 자동 재편집' : '썸네일 편집'}: ${workspace.name}`,
        sourceType: 'thumbnail_generation',
        sourceId: generation.id,
        actorUserId: triggeredByUserId,
        targetType: 'content_workspace',
        targetId: workspace.id,
        href: this.thumbnailGenerationHref(generation.id),
        metadata: { method, purpose, variantKey: variantKey ?? 'auto' },
      });

      this.scheduleEditJob(generation.id, organizationId, purpose, variantKey);
      items.push(toThumbnailGenerationItem(generation as GenerationRow, workspace));
    }
    return items;
  }

  async reEditJob(
    id: string,
    organizationId: string,
    purpose: 'compliance' | 'quality',
    variantKey: 'auto' | 'with-box' | 'no-box' | null,
    triggeredByUserId: string | null,
  ): Promise<{ ok: true }> {
    const existing = await this.ledger.findGenerationProjectionStatus({
      generationId: id,
      organizationId,
    });
    if (!existing) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
    const row = await this.ledger.findGenerationOrThrow(id, organizationId);

    const change = await this.ledger.resetGenerationForReEdit({
      id,
      organizationId,
      purpose,
      variantKey,
    });
    if (!change) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
    await this.lifecycle.recordStatusChange({
      organizationId,
      generationId: id,
      fromStatus: change.fromStatus,
      toStatus: 'pending',
      fromPhase: change.fromPhase,
      toPhase: null,
      actorUserId: triggeredByUserId,
      payload: { purpose, variantKey: variantKey ?? 'auto' },
    });

    // Re-open the operation alert. `start()` is idempotent on the
    // (organizationId, operationKey) tuple — a previous failed/succeeded
    // alert flips back to running, fresh runs create a new row.
    await this.operationAlerts.start({
      organizationId,
      operationKey: this.editJobOperationKey(id),
      type: 'thumbnail_edit_job',
      title: '썸네일 재편집',
      sourceType: 'thumbnail_generation',
      sourceId: id,
      actorUserId: triggeredByUserId,
      targetType: 'content_workspace',
      targetId: row.contentWorkspaceId,
      href: this.thumbnailGenerationHref(id),
      metadata: {
        method: row.method,
        purpose,
        variantKey: variantKey ?? 'auto',
        retry: true,
      },
    });

    this.scheduleEditJob(id, organizationId, purpose, variantKey);
    return { ok: true };
  }

  private scheduleEditJob(
    generationId: string,
    organizationId: string,
    purpose: 'compliance' | 'quality',
    variantKey: 'auto' | 'with-box' | 'no-box' | null,
  ): void {
    this.generationJobs.scheduleEditJob(generationId, organizationId, purpose, variantKey);
  }

  private async processEditJob(
    id: string,
    organizationId: string,
    purpose: 'compliance' | 'quality',
    variantKey: 'auto' | 'with-box' | 'no-box' | null,
  ): Promise<void> {
    await this.generationJobs.processEditJob(id, organizationId, purpose, variantKey);
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
        runs.push({
          ok: true,
          contentWorkspaceId: workspace.id,
          generationId: item?.id ?? null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[thumbnail-auto] failed contentWorkspaceId=${workspace.id}: ${message}`);
        runs.push({
          ok: false,
          contentWorkspaceId: workspace.id,
          error: message,
        });
      }
    }

    const succeeded = runs.filter((run) => run.ok).length;
    return {
      attempted: runs.length,
      succeeded,
      failed: runs.length - succeeded,
      skipped,
      runs,
    };
  }

  // ─── helpers ────────────────────────────────────────────────────────

  private async assertWorkspaceOwned(contentWorkspaceId: string, organizationId: string): Promise<void> {
    const workspace = await this.ledger.findWorkspaceForThumbnailEditor(contentWorkspaceId, organizationId);
    if (!workspace) {
      throw new NotFoundException(`ContentWorkspace ${contentWorkspaceId} not found`);
    }
  }

  private async assertGenerationOwned(id: string, organizationId: string): Promise<void> {
    const existing = await this.ledger.findGenerationProjectionStatus({
      generationId: id,
      organizationId,
    });
    if (!existing) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
  }
}

// Re-export for backwards-compat with existing GenerationRow consumers (none
// expected — kept narrow for test compatibility).
export type { GenerationRow };

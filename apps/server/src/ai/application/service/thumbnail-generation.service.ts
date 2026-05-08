import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ThumbnailGenerationItem,
  ThumbnailGenerationListResponse,
} from '@kiditem/shared/ai';
import { PrismaService } from '../../../prisma/prisma.service';
import { OperationAlertService } from '../../../automation/application/service/operation-alert.service';
import {
  ThumbnailEditorAiService,
} from './thumbnail-editor-ai.service';
import type {
  ThumbnailEditorCandidate,
  ThumbnailEditorInputImage,
} from '../../domain/model/thumbnail-editor';
import { resolveMasterThumbnailImage } from '../../domain/thumbnail-master-image';
import { getRecomposePromptOverride } from '../../domain/prompts/thumbnail-recompose-prompts';
import { ThumbnailTrackingService } from './thumbnail-tracking.service';
import {
  type ThumbnailAnalysisContext,
  extractEditSuggestions,
  extractRecomposeKind,
  findRecomposeKindIn,
  inferEditCaseFromInputs,
  toAnalysisContextJson,
  toEditAnalysis,
  toInputRole,
  variantInstruction,
} from '../../domain/thumbnail-generation-inputs';
import {
  toThumbnailGenerationItem,
  type GenerationRow,
} from '../../mapper/thumbnail-generation.mapper';
import {
  findActiveJobForProduct,
  findAutoBatchCandidates,
  findGenerationMaster,
  findGenerationMasters,
  findGenerationOrThrow,
  findGenerationRows,
  findGenerationWithCandidatesOrThrow,
  findGenerationWithInputImages,
  findJobMaster,
  findJobMastersByIds,
  findProductForEditor,
  findRecentAutoJob,
  findThumbnailAnalysisGrade,
  type EditorProductRow,
} from '../../adapter/out/prisma/thumbnail-generation.query';
import {
  applyGenerationToMaster,
  clearReadySelections,
  createPendingEditJob,
  deleteGeneration,
  lockGenerationForProcessing,
  markGenerationCancelled,
  markGenerationFailed,
  persistPendingInputImages,
  removeCandidate as removeCandidatePersistence,
  replaceGenerationResult,
  resetGenerationForReEdit,
  saveEditorResult as saveEditorResultPersistence,
  setSelectedCandidate,
  type SaveEditorResultInput,
} from '../../adapter/out/prisma/thumbnail-generation.persistence';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
} from '../../../agent-os/application/port/in/agent-runner.port';
import {
  AI_AGENT_SOURCE_TYPES,
  THUMBNAIL_GENERATE_AGENT_TYPE,
} from '../../domain/agent-output';
import {
  THUMBNAIL_GENERATION_EVENT_PORT,
  type AppendThumbnailGenerationEventInput,
  type ThumbnailGenerationEventPort,
} from '../port/out/thumbnail-generation-event.port';

@Injectable()
export class ThumbnailGenerationService {
  private readonly logger = new Logger(ThumbnailGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly editorAiService: ThumbnailEditorAiService,
    private readonly trackingService: ThumbnailTrackingService,
    private readonly operationAlerts: OperationAlertService,
    @Inject(AGENT_RUNNER_PORT)
    private readonly agentRunner: AgentRunnerPort,
    @Optional()
    @Inject(THUMBNAIL_GENERATION_EVENT_PORT)
    private readonly generationEvents: ThumbnailGenerationEventPort | null = null,
  ) {}

  private editJobOperationKey(generationId: string): string {
    return `thumbnail-edit:${generationId}`;
  }

  private thumbnailGenerationHref(generationId: string): string {
    return `/thumbnails?generationId=${encodeURIComponent(generationId)}`;
  }

  async findProductForEditor(
    productId: string,
    organizationId: string,
  ): Promise<EditorProductRow | null> {
    return findProductForEditor(this.prisma, productId, organizationId);
  }

  async saveEditorResult(input: SaveEditorResultInput): Promise<string> {
    await this.assertProductOwned(input.productId, input.organizationId);
    const generationId = await saveEditorResultPersistence(this.prisma, input);
    await this.emitStatusChange({
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

  /**
   * Enqueue a thumbnail editor generation onto Agent OS.
   *
   * Async product-bound path used by `/api/thumbnail-editor/generate`. The
   * sequence mirrors `createEditJobs` (auto-batch) but the actual Gemini
   * call is delegated to the Agent OS runtime via
   * `AGENT_RUNNER_PORT.runByType('thumbnail_generate', …)`. The bridge +
   * sink (`ThumbnailGenerationSinkAdapter`) finalize the row + close the
   * operation alert.
   *
   * Operation alert keeps the existing `(thumbnail_generation, <id>)`
   * source contract so PR #214 panel projection hides the legacy image
   * run while the alert is alive.
   */
  async enqueueEditorGeneration(input: {
    organizationId: string;
    productId: string;
    productName: string;
    triggeredByUserId: string | null;
    inputs: ThumbnailEditorInputImage[];
    inputMeta: Prisma.InputJsonValue;
    method: 'generate' | 'creative';
    originalUrl: string;
    agentPayload: Record<string, unknown>;
  }): Promise<{ generationId: string; status: 'pending' }> {
    const generation = await createPendingEditJob(this.prisma, {
      organizationId: input.organizationId,
      masterId: input.productId,
      originalUrl: input.originalUrl,
      method: input.method,
      inputMeta: input.inputMeta,
      editAnalysis: null,
      triggeredByUserId: input.triggeredByUserId,
    });

    await persistPendingInputImages(this.prisma, {
      generationId: generation.id,
      organizationId: input.organizationId,
      inputImages: input.inputs,
    });

    await this.emitStatusChange({
      organizationId: input.organizationId,
      generationId: generation.id,
      fromStatus: null,
      toStatus: 'pending',
      fromPhase: null,
      toPhase: null,
      actorUserId: input.triggeredByUserId,
      payload: {
        method: input.method,
        productId: input.productId,
        inputCount: input.inputs.length,
      },
    });

    await this.operationAlerts.start({
      organizationId: input.organizationId,
      operationKey: this.editJobOperationKey(generation.id),
      type: 'thumbnail_edit_job',
      title: `썸네일 ${input.method === 'creative' ? 'AI 연출' : '편집'}: ${input.productName}`,
      sourceType: 'thumbnail_generation',
      sourceId: generation.id,
      actorUserId: input.triggeredByUserId,
      targetType: 'master',
      targetId: input.productId,
      href: this.thumbnailGenerationHref(generation.id),
      metadata: { method: input.method, inputCount: input.inputs.length },
    });

    const enqueueResult = await this.agentRunner.runByType(
      THUMBNAIL_GENERATE_AGENT_TYPE,
      {
        organizationId: input.organizationId,
        requestedByUserId: input.triggeredByUserId ?? undefined,
        sourceType: AI_AGENT_SOURCE_TYPES.THUMBNAIL_GENERATE,
        sourceResourceType: 'thumbnail_generation',
        sourceResourceId: generation.id,
        reason: `thumbnail_generate for product ${input.productId}`,
        payload: input.agentPayload,
      },
    );

    if (!enqueueResult.ok) {
      const errorMessage = enqueueResult.reason
        ? `Agent OS enqueue failed: ${enqueueResult.reason}`
        : 'Agent OS enqueue failed.';
      // Mirror the producer-side enqueue-failure path used by
      // `DetailPageAiService.enqueueProductBoundGeneration`: the row was
      // created so we mark it FAILED and close the alert before throwing.
      const lock = await lockGenerationForProcessing(
        this.prisma,
        generation.id,
        input.organizationId,
      );
      if (lock) {
        await markGenerationFailed(
          this.prisma,
          generation.id,
          input.organizationId,
          errorMessage,
        );
      }
      await this.operationAlerts.fail(
        input.organizationId,
        this.editJobOperationKey(generation.id),
        {
          message: errorMessage,
          metadata: {
            errorCode: 'agent_enqueue_failed',
            agentReason: enqueueResult.reason ?? null,
          },
        },
      );
      throw new BadRequestException(errorMessage);
    }

    return { generationId: generation.id, status: 'pending' };
  }

  async findAll(
    organizationId: string,
    opts: { productId?: string | null; limit?: number | null } = {},
  ): Promise<ThumbnailGenerationListResponse> {
    const rows = await findGenerationRows(this.prisma, organizationId, opts);
    const masters = await findGenerationMasters(this.prisma, rows, organizationId);
    const items = rows.map((r) => toThumbnailGenerationItem(r, masters.get(r.masterId)));
    return { items, total: items.length } satisfies ThumbnailGenerationListResponse;
  }

  async findOne(id: string, organizationId: string): Promise<ThumbnailGenerationItem> {
    const row = await findGenerationOrThrow(this.prisma, id, organizationId);
    const master = await findGenerationMaster(this.prisma, row.masterId, organizationId);
    return toThumbnailGenerationItem(row, master);
  }

  async selectCandidate(
    id: string,
    organizationId: string,
    selectedUrl: string,
  ): Promise<ThumbnailGenerationItem> {
    const existing = await findGenerationWithCandidatesOrThrow(this.prisma, id, organizationId);
    const isDeselect = !selectedUrl;
    if (!isDeselect && !existing.candidates.some((c) => c.url === selectedUrl)) {
      throw new BadRequestException('selectedUrl 은 해당 generation 의 candidates 중 하나여야 합니다');
    }
    await setSelectedCandidate(this.prisma, id, organizationId, isDeselect ? null : selectedUrl);
    return this.findOne(id, organizationId);
  }

  /**
   * "선택 대기" (`phase: 'ready'`) 상태 generation 들의 `selectedUrl` 일괄 해제.
   * 사용자가 thumbnails 페이지의 "선택 대기" 탭에 진입할 때마다 깨끗한 상태로
   * 시작하도록 frontend 가 호출. applied 항목은 유지.
   */
  async clearReadySelections(organizationId: string): Promise<{ count: number }> {
    return clearReadySelections(this.prisma, organizationId);
  }

  async applyGeneration(
    id: string,
    organizationId: string,
    actorUserId: string | null = null,
  ): Promise<ThumbnailGenerationItem> {
    const existing = await findGenerationWithCandidatesOrThrow(this.prisma, id, organizationId);
    const master = await findGenerationMaster(this.prisma, existing.masterId, organizationId);
    if (!master) throw new NotFoundException(`MasterProduct ${existing.masterId} not found`);

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

    await applyGenerationToMaster(this.prisma, {
      id,
      organizationId,
      masterId: existing.masterId,
      selected,
    });
    await this.emitPhaseChange({
      organizationId,
      generationId: id,
      fromPhase: existing.phase,
      toPhase: 'applied',
      fromStatus: existing.status,
      toStatus: 'succeeded',
      actorUserId,
      payload: { selectedUrl: selected?.url ?? null },
    });

    const analysis = await findThumbnailAnalysisGrade(this.prisma, existing.masterId, organizationId);
    void this.trackingService
      .create({
        organizationId,
        masterId: existing.masterId,
        generationId: existing.id,
        originalGrade: analysis?.grade ?? existing.grade,
        originalScore: analysis?.overallScore ?? existing.score,
      })
      .catch((err) => {
        this.logger.warn(
          `ThumbnailTracking 자동 생성 실패 (generationId=${existing.id}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });

    return this.findOne(id, organizationId);
  }

  async skipGeneration(
    id: string,
    organizationId: string,
    triggeredByUserId: string | null = null,
  ): Promise<ThumbnailGenerationItem> {
    const change = await markGenerationCancelled(this.prisma, id, organizationId);
    if (!change) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
    await this.emitStatusChange({
      organizationId,
      generationId: id,
      fromStatus: change.fromStatus,
      toStatus: 'cancelled',
      fromPhase: change.fromPhase,
      toPhase: null,
      actorUserId: triggeredByUserId,
    });
    // No-op when the generation never opened an alert (e.g. auto-batch).
    await this.operationAlerts.cancel(organizationId, this.editJobOperationKey(id));
    return this.findOne(id, organizationId);
  }

  async deleteGeneration(id: string, organizationId: string): Promise<{ ok: true }> {
    await this.assertGenerationOwned(id, organizationId);
    await deleteGeneration(this.prisma, id, organizationId);
    return { ok: true };
  }

  async removeCandidate(
    id: string,
    organizationId: string,
    candidateUrl: string,
  ): Promise<{ ok: true; generationDeleted: boolean; remaining: number }> {
    const existing = await findGenerationWithCandidatesOrThrow(this.prisma, id, organizationId);
    const target = existing.candidates.find((c) => c.url === candidateUrl);
    if (!target) {
      throw new NotFoundException('해당 candidate URL 을 찾을 수 없습니다');
    }
    const remaining = existing.candidates.length - 1;
    await removeCandidatePersistence(this.prisma, {
      id,
      organizationId,
      candidateId: target.id,
      candidateUrl,
      selectedUrl: existing.selectedUrl,
      remainingAfterDelete: remaining,
    });
    return { ok: true, generationDeleted: remaining === 0, remaining };
  }

  async createEditJobs(
    productIds: string[],
    organizationId: string,
    purpose: 'compliance' | 'quality',
    variantKey: 'auto' | 'with-box' | 'no-box' | null,
    triggeredByUserId: string | null,
    method = 'generate',
  ): Promise<ThumbnailGenerationItem[]> {
    if (productIds.length === 0) return [];
    const byId = await findJobMastersByIds(this.prisma, productIds, organizationId);
    const items: ThumbnailGenerationItem[] = [];

    for (const productId of productIds) {
      const product = byId.get(productId);
      if (!product) throw new NotFoundException(`MasterProduct ${productId} not found`);
      const sourceUrl = resolveMasterThumbnailImage(product);
      if (!sourceUrl) throw new BadRequestException('상품 원본 이미지가 필요합니다');

      const active = await findActiveJobForProduct(this.prisma, product.id, organizationId, method);
      if (active) {
        items.push(toThumbnailGenerationItem(active, product));
        continue;
      }

      const analysis: ThumbnailAnalysisContext | null = product.thumbnailAnalyses[0] ?? null;
      const editSuggestions = extractEditSuggestions(analysis?.complianceScores ?? null);
      const editAnalysis = toEditAnalysis(analysis);

      const generation = await createPendingEditJob(this.prisma, {
        organizationId,
        masterId: product.id,
        originalUrl: sourceUrl,
        method,
        inputMeta: {
          mode: 'edit',
          purpose,
          editCase: 'single',
          variantKey: variantKey ?? 'auto',
          automated: method === 'auto',
          inputCount: 1,
          recompose: (analysis?.recompose ?? null) as Prisma.InputJsonValue,
          analysisContext: toAnalysisContextJson(analysis, editSuggestions),
        },
        editAnalysis,
        triggeredByUserId,
      });
      await this.emitStatusChange({
        organizationId,
        generationId: generation.id,
        fromStatus: null,
        toStatus: 'pending',
        fromPhase: null,
        toPhase: null,
        actorUserId: triggeredByUserId,
        payload: {
          method,
          productId: product.id,
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
        title: `${method === 'auto' ? '썸네일 자동 재편집' : '썸네일 편집'}: ${product.name}`,
        sourceType: 'thumbnail_generation',
        sourceId: generation.id,
        actorUserId: triggeredByUserId,
        targetType: 'master',
        targetId: product.id,
        href: this.thumbnailGenerationHref(generation.id),
        metadata: { method, purpose, variantKey: variantKey ?? 'auto' },
      });

      this.scheduleEditJob(generation.id, organizationId, purpose, variantKey);
      items.push(toThumbnailGenerationItem(generation, product));
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
    const existing = await this.prisma.thumbnailGeneration.findFirst({
      where: { id, organizationId },
      select: { id: true, masterId: true, method: true },
    });
    if (!existing) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);

    const change = await resetGenerationForReEdit(this.prisma, { id, organizationId, purpose, variantKey });
    if (!change) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
    await this.emitStatusChange({
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
      targetType: 'master',
      targetId: existing.masterId,
      href: this.thumbnailGenerationHref(id),
      metadata: { method: existing.method, purpose, variantKey: variantKey ?? 'auto', retry: true },
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
    setImmediate(() => {
      this.processEditJob(generationId, organizationId, purpose, variantKey).catch((err) => {
        this.logger.error(
          `편집 job 백그라운드 처리 실패 (${generationId}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
    });
  }

  private async processEditJob(
    id: string,
    organizationId: string,
    purpose: 'compliance' | 'quality',
    variantKey: 'auto' | 'with-box' | 'no-box' | null,
  ): Promise<void> {
    const locked = await lockGenerationForProcessing(this.prisma, id, organizationId);
    if (!locked) return;
    await this.emitStatusChange({
      organizationId,
      generationId: id,
      fromStatus: locked.fromStatus,
      toStatus: 'running',
      fromPhase: locked.fromPhase,
      toPhase: null,
      attemptNumber: locked.attemptNumber,
      payload: { purpose, variantKey: variantKey ?? 'auto' },
    });
    await this.appendGenerationEvent({
      organizationId,
      generationId: id,
      eventType: 'attempt_started',
      fromStatus: locked.fromStatus,
      toStatus: 'running',
      fromPhase: locked.fromPhase,
      toPhase: null,
      attemptNumber: locked.attemptNumber,
      payload: { purpose, variantKey: variantKey ?? 'auto' },
    });

    try {
      const existing = await findGenerationWithInputImages(this.prisma, id, organizationId);
      if (!existing) return;
      const master = await findJobMaster(this.prisma, existing.masterId, organizationId);
      if (!master) {
        throw new BadRequestException('상품 정보를 찾을 수 없습니다');
      }

      const masterFallback = resolveMasterThumbnailImage(master);
      const seedRows =
        existing.inputImages.length > 0
          ? existing.inputImages
          : [
              {
                url: existing.selectedUrl ?? existing.originalUrl ?? masterFallback,
                role: 'product',
                label: 'Product photo',
                sortOrder: 0,
                source: 'master_image',
              },
            ];
      const validSeedRows = seedRows.filter((row) => row.url);
      if (validSeedRows.length === 0) {
        throw new BadRequestException('재편집할 원본 이미지가 없습니다');
      }

      const inputImages: ThumbnailEditorInputImage[] = [];
      for (const row of validSeedRows) {
        inputImages.push(
          await this.editorAiService.resolveInputImage(row.url as string, organizationId, {
            label: row.label ?? 'Product photo',
            role: toInputRole(row.role),
            sortOrder: row.sortOrder,
            source: row.source ?? 're-edit',
          }),
        );
      }
      const editCase = inferEditCaseFromInputs(inputImages);
      const analysis: ThumbnailAnalysisContext | null = master.thumbnailAnalyses[0] ?? null;
      const recomposeKind =
        findRecomposeKindIn(existing.inputMeta) ??
        findRecomposeKindIn(existing.editAnalysis) ??
        extractRecomposeKind(analysis?.recompose ?? null);
      const editSuggestions = extractEditSuggestions(analysis?.complianceScores ?? null);
      const promptOverride = getRecomposePromptOverride(
        recomposeKind,
        variantKey,
        master.category,
        master.name,
      );
      const candidates: ThumbnailEditorCandidate[] = await this.editorAiService.generateEdit(
        inputImages,
        organizationId,
        {
          purpose,
          editCase,
          userPrompt: promptOverride ? undefined : variantInstruction(variantKey),
          productDescription: [master.name, master.category]
            .filter(Boolean)
            .join(' / '),
          productName: master.name,
          category: master.category,
          promptOverride,
          editSuggestions,
          referenceMode: 'edit-image',
        },
      );

      const inputMeta: Prisma.InputJsonValue = {
        mode: 'edit',
        purpose,
        editCase,
        variantKey: variantKey ?? 'auto',
        automated: existing.method === 'auto',
        inputCount: inputImages.length,
        recompose: (analysis?.recompose ?? null) as Prisma.InputJsonValue,
        analysisContext: toAnalysisContextJson(analysis, editSuggestions),
      };
      const completed = await replaceGenerationResult(this.prisma, {
        generationId: id,
        organizationId,
        candidates,
        inputImages,
        inputMeta,
        editAnalysis: toEditAnalysis(analysis),
      });
      if (completed) {
        await this.emitStatusChange({
          organizationId,
          generationId: id,
          fromStatus: completed.fromStatus,
          toStatus: 'succeeded',
          fromPhase: completed.fromPhase,
          toPhase: 'ready',
          attemptNumber: completed.attemptNumber,
          payload: {
            candidateCount: candidates.length,
            inputCount: inputImages.length,
            editCase,
            variantKey: variantKey ?? 'auto',
          },
        });
        await this.appendGenerationEvent({
          organizationId,
          generationId: id,
          eventType: 'attempt_finished',
          fromStatus: completed.fromStatus,
          toStatus: 'succeeded',
          fromPhase: completed.fromPhase,
          toPhase: 'ready',
          attemptNumber: completed.attemptNumber,
          payload: {
            candidateCount: candidates.length,
            inputCount: inputImages.length,
            editCase,
            variantKey: variantKey ?? 'auto',
          },
        });

        // Operation alert succeed — no-op for unrelated lifecycles where the
        // alert is missing.
        await this.operationAlerts.succeed(
          organizationId,
          this.editJobOperationKey(id),
          { metadata: { candidateCount: candidates.length } },
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`편집 처리 실패 (${id}): ${message}`);
      const failed = await markGenerationFailed(this.prisma, id, organizationId, message);
      if (failed) {
        await this.emitStatusChange({
          organizationId,
          generationId: id,
          fromStatus: failed.fromStatus,
          toStatus: 'failed',
          fromPhase: failed.fromPhase,
          toPhase: null,
          attemptNumber: failed.attemptNumber,
          errorMessage: message,
          payload: { purpose, variantKey: variantKey ?? 'auto' },
        });
        await this.appendGenerationEvent({
          organizationId,
          generationId: id,
          eventType: 'error',
          fromStatus: failed.fromStatus,
          toStatus: 'failed',
          fromPhase: failed.fromPhase,
          toPhase: null,
          attemptNumber: failed.attemptNumber,
          errorMessage: message,
          payload: { purpose, variantKey: variantKey ?? 'auto' },
        });
      }
      await this.operationAlerts.fail(
        organizationId,
        this.editJobOperationKey(id),
        { message },
      );
    }
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
    runs: Array<{ ok: boolean; productId: string; generationId?: string | null; error?: string }>;
  }> {
    const take = Math.min(Math.max(limit, 1), 30);
    const cooldown = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const products = await findAutoBatchCandidates(this.prisma, organizationId, take * 3);

    const runs: Array<{ ok: boolean; productId: string; generationId?: string | null; error?: string }> = [];
    let skipped = 0;
    for (const product of products) {
      if (runs.length >= take) break;
      const recent = await findRecentAutoJob(this.prisma, product.id, organizationId, cooldown);
      if (recent) {
        skipped++;
        continue;
      }
      try {
        const [item] = await this.createEditJobs(
          [product.id],
          organizationId,
          'compliance',
          'auto',
          triggeredByUserId,
          'auto',
        );
        runs.push({ ok: true, productId: product.id, generationId: item?.id ?? null });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[thumbnail-auto] failed productId=${product.id}: ${message}`);
        runs.push({ ok: false, productId: product.id, error: message });
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

  private async assertProductOwned(productId: string, organizationId: string): Promise<void> {
    const product = await findProductForEditor(this.prisma, productId, organizationId);
    if (!product) throw new NotFoundException(`MasterProduct ${productId} not found`);
  }

  private async assertGenerationOwned(id: string, organizationId: string): Promise<void> {
    const existing = await this.prisma.thumbnailGeneration.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
  }

  private async emitStatusChange(
    input: Omit<AppendThumbnailGenerationEventInput, 'eventType'> & {
      eventType?: AppendThumbnailGenerationEventInput['eventType'];
      fromPhase?: string | null;
      toPhase?: string | null;
    },
  ): Promise<void> {
    await this.appendGenerationEvent({
      ...input,
      eventType: input.eventType ?? 'status_change',
    });
    if (input.fromPhase !== input.toPhase) {
      await this.appendGenerationEvent({
        organizationId: input.organizationId,
        generationId: input.generationId,
        eventType: 'phase_change',
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        fromPhase: input.fromPhase,
        toPhase: input.toPhase,
        attemptNumber: input.attemptNumber,
        actorUserId: input.actorUserId,
        payload: input.payload,
      });
    }
  }

  private async emitPhaseChange(input: Omit<AppendThumbnailGenerationEventInput, 'eventType'>): Promise<void> {
    if (input.fromPhase === input.toPhase) return;
    await this.appendGenerationEvent({
      ...input,
      eventType: 'phase_change',
    });
  }

  private async appendGenerationEvent(input: AppendThumbnailGenerationEventInput): Promise<void> {
    if (!this.generationEvents) return;
    try {
      await this.generationEvents.append(input);
    } catch (err) {
      this.logger.warn(
        `ThumbnailGenerationEvent 기록 실패 (generationId=${input.generationId}, type=${input.eventType}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

// Re-export for backwards-compat with existing GenerationRow consumers (none
// expected — kept narrow for test compatibility).
export type { GenerationRow };

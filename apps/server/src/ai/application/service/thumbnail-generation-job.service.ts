import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { OperationAlertService } from '../../../automation/application/service/operation-alert.service';
import { ThumbnailEditorAiService } from './thumbnail-editor-ai.service';
import type {
  ThumbnailEditorCandidate,
  ThumbnailEditorInputImage,
} from '../../domain/model/thumbnail-editor';
import { resolveMasterThumbnailImage } from '../../domain/thumbnail-master-image';
import { getRecomposePromptOverride } from '../../domain/prompts/thumbnail-recompose-prompts';
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
  findGenerationWithInputImages,
  findJobMaster,
} from '../../adapter/out/prisma/thumbnail-generation.query';
import {
  createPendingEditJob,
  lockGenerationForProcessing,
  markGenerationFailed,
  persistPendingInputImages,
  replaceGenerationResult,
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

export interface ThumbnailEditorGenerationEnqueueInput {
  organizationId: string;
  productId: string;
  productName: string;
  triggeredByUserId: string | null;
  inputs: ThumbnailEditorInputImage[];
  inputMeta: Prisma.InputJsonValue;
  method: 'generate' | 'creative';
  originalUrl: string;
  agentPayload: Record<string, unknown>;
}

@Injectable()
export class ThumbnailGenerationJobService {
  private readonly logger = new Logger(ThumbnailGenerationJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly editorAiService: ThumbnailEditorAiService,
    private readonly operationAlerts: OperationAlertService,
    @Inject(AGENT_RUNNER_PORT)
    private readonly agentRunner: AgentRunnerPort,
    @Optional()
    @Inject(THUMBNAIL_GENERATION_EVENT_PORT)
    private readonly generationEvents: ThumbnailGenerationEventPort | null = null,
  ) {}

  async enqueueEditorGeneration(
    input: ThumbnailEditorGenerationEnqueueInput,
  ): Promise<{ generationId: string; status: 'pending' }> {
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

  scheduleEditJob(
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

  async processEditJob(
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

  private editJobOperationKey(generationId: string): string {
    return `thumbnail-edit:${generationId}`;
  }

  private thumbnailGenerationHref(generationId: string): string {
    return `/thumbnails?generationId=${encodeURIComponent(generationId)}`;
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

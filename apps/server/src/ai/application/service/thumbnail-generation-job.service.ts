import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  AI_OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../port/out/cross-domain/operation-alert.port';
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
  type ThumbnailJsonValue,
} from '../../domain/thumbnail-generation-inputs';
import {
  THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT,
  type ThumbnailGenerationLedgerRepositoryPort,
} from '../port/out/repository/thumbnail-generation-ledger.repository.port';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
} from '../../../agent-os/application/port/in/agent-runner.port';
import {
  AI_AGENT_SOURCE_TYPES,
  THUMBNAIL_GENERATE_AGENT_TYPE,
} from '../../domain/agent-output';
import { kickEnqueuedAgentRequest as kickInlineAgentRequest } from './agent-inline-execution';
import {
  type GenerationAlertLink,
  STANDALONE_GENERATION_ALERT,
  isParentProductGenerationAlertLink,
  productGenerationMetadata,
} from './product-generation-alert-link';
import { ProductGenerationAlertService } from './product-generation-alert.service';
import { ThumbnailGenerationLifecycleService } from './thumbnail-generation-lifecycle.service';

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export interface ThumbnailEditorGenerationEnqueueInput {
  organizationId: string;
  productId: string;
  productName: string;
  contentWorkspaceId?: string | null;
  triggeredByUserId: string | null;
  inputs: ThumbnailEditorInputImage[];
  inputMeta: unknown;
  method: 'generate' | 'creative';
  originalUrl: string;
  agentPayload: Record<string, unknown>;
}

export interface ThumbnailCandidateGenerationEnqueueInput {
  organizationId: string;
  sourceCandidateId: string;
  productName: string | null;
  contentWorkspaceId?: string | null;
  triggeredByUserId: string | null;
  inputs: ThumbnailEditorInputImage[];
  inputMeta: unknown;
  method: 'generate' | 'creative';
  originalUrl: string;
  agentPayload: Record<string, unknown>;
  operationAlert?: GenerationAlertLink;
}

export interface ThumbnailStandaloneGenerationEnqueueInput {
  organizationId: string;
  productName: string | null;
  contentWorkspaceId?: string | null;
  triggeredByUserId: string | null;
  inputs: ThumbnailEditorInputImage[];
  inputMeta: unknown;
  method: 'generate' | 'creative';
  originalUrl: string;
  agentPayload: Record<string, unknown>;
}

type ThumbnailGenerationEnqueueResult = {
  generationId: string;
  status: 'pending' | 'cancelled';
};

const THUMBNAIL_PARENT_CANCELLED_AFTER_ENQUEUE_MESSAGE =
  'Parent product generation was cancelled before thumbnail request execution.';

@Injectable()
export class ThumbnailGenerationJobService {
  private readonly logger = new Logger(ThumbnailGenerationJobService.name);

  constructor(
    @Inject(THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT)
    private readonly ledger: ThumbnailGenerationLedgerRepositoryPort,
    private readonly editorAiService: ThumbnailEditorAiService,
    @Inject(AI_OPERATION_ALERT_PORT)
    private readonly operationAlerts: OperationAlertPort,
    @Inject(AGENT_RUNNER_PORT)
    private readonly agentRunner: AgentRunnerPort,
    private readonly productGenerationAlerts: ProductGenerationAlertService,
    private readonly lifecycle: ThumbnailGenerationLifecycleService,
  ) {}

  async enqueueEditorGeneration(
    input: ThumbnailEditorGenerationEnqueueInput,
  ): Promise<ThumbnailGenerationEnqueueResult> {
    const generation = await this.ledger.openPendingEditorJob({
      organizationId: input.organizationId,
      masterId: input.productId,
      originalUrl: input.originalUrl,
      method: input.method,
      inputMeta: input.inputMeta,
      editAnalysis: null,
      contentWorkspaceId: input.contentWorkspaceId ?? null,
      triggeredByUserId: input.triggeredByUserId,
    });

    await this.ledger.persistPendingInputImages({
      generationId: generation.id,
      organizationId: input.organizationId,
      inputImages: input.inputs,
    });

    await this.lifecycle.recordStatusChange({
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
        contentWorkspaceId: input.contentWorkspaceId ?? null,
        inputCount: input.inputs.length,
      },
    });

    const alertTarget = this.alertTarget({
      contentWorkspaceId: input.contentWorkspaceId ?? null,
      fallbackTargetType: 'master',
      fallbackTargetId: input.productId,
      fallbackHref: this.thumbnailGenerationHref(generation.id),
    });
    await this.operationAlerts.start({
      organizationId: input.organizationId,
      operationKey: this.editJobOperationKey(generation.id),
      type: 'thumbnail_edit_job',
      title: `썸네일 ${input.method === 'creative' ? 'AI 연출' : '편집'}: ${input.productName}`,
      sourceType: 'thumbnail_generation',
      sourceId: generation.id,
      actorUserId: input.triggeredByUserId,
      targetType: alertTarget.targetType,
      targetId: alertTarget.targetId,
      href: alertTarget.href,
      metadata: {
        method: input.method,
        inputCount: input.inputs.length,
        contentWorkspaceId: input.contentWorkspaceId ?? null,
      },
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
      const lock = await this.lifecycle.startAttempt({
        generationId: generation.id,
        organizationId: input.organizationId,
        payload: {
          errorCode: 'agent_enqueue_failed',
          agentReason: enqueueResult.reason ?? null,
        },
      });
      if (lock) {
        await this.lifecycle.failRunningGeneration({
          generationId: generation.id,
          organizationId: input.organizationId,
          errorMessage,
          payload: {
            errorCode: 'agent_enqueue_failed',
            agentReason: enqueueResult.reason ?? null,
          },
        });
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

    this.kickEnqueuedAgentRequest({
      organizationId: input.organizationId,
      requestId: enqueueResult.requestId,
    });

    return { generationId: generation.id, status: 'pending' };
  }

  async enqueueCandidateGeneration(
    input: ThumbnailCandidateGenerationEnqueueInput,
  ): Promise<ThumbnailGenerationEnqueueResult> {
    const candidate = await this.ledger.findSourceCandidateForJob(
      input.sourceCandidateId,
      input.organizationId,
    );
    if (!candidate) {
      throw new BadRequestException('sourceCandidateId 에 해당하는 소싱 후보를 찾을 수 없습니다');
    }

    const operationAlert = input.operationAlert ?? STANDALONE_GENERATION_ALERT;
    const inputMeta = isParentProductGenerationAlertLink(operationAlert)
      ? {
          ...jsonObject(input.inputMeta),
          productGeneration: {
            mode: 'parent',
            ...productGenerationMetadata(operationAlert),
          },
        }
      : input.inputMeta;

    const generation = await this.ledger.openPendingCandidateJob({
      organizationId: input.organizationId,
      sourceCandidateId: input.sourceCandidateId,
      originalUrl: input.originalUrl,
      method: input.method,
      inputMeta,
      contentWorkspaceId: input.contentWorkspaceId ?? null,
      triggeredByUserId: input.triggeredByUserId,
    });

    const inputImages = this.attachCandidateImageRefs(input.inputs, candidate.images);

    await this.ledger.persistPendingInputImages({
      generationId: generation.id,
      organizationId: input.organizationId,
      inputImages,
    });

    await this.lifecycle.recordStatusChange({
      organizationId: input.organizationId,
      generationId: generation.id,
      fromStatus: null,
      toStatus: 'pending',
      fromPhase: null,
      toPhase: null,
      actorUserId: input.triggeredByUserId,
      payload: {
        method: input.method,
        sourceCandidateId: input.sourceCandidateId,
        contentWorkspaceId: input.contentWorkspaceId ?? null,
        inputCount: inputImages.length,
      },
    });

    if (isParentProductGenerationAlertLink(operationAlert)) {
      const childStart = await this.productGenerationAlerts.recordChildStarted({
        organizationId: input.organizationId,
        parentOperationKey: operationAlert.parentOperationKey,
        childKind: 'thumbnail',
        childId: generation.id,
      });
      if (childStart.status !== 'started') {
        await this.lifecycle.markCancelled({
          organizationId: input.organizationId,
          generationId: generation.id,
          actorUserId: input.triggeredByUserId,
          payload: {
            reason:
              childStart.alert?.status === 'cancelled'
                ? 'Parent product generation was cancelled before thumbnail child enqueue.'
                : 'Parent product generation is not accepting thumbnail child jobs.',
          },
        });
        return { generationId: generation.id, status: 'cancelled' };
      }
    } else {
      const alertTarget = this.alertTarget({
        contentWorkspaceId: input.contentWorkspaceId ?? null,
        fallbackTargetType: 'sourcing_candidate',
        fallbackTargetId: input.sourceCandidateId,
        fallbackHref: `/product-pipeline/collected-products/${encodeURIComponent(input.sourceCandidateId)}`,
      });
      await this.operationAlerts.start({
        organizationId: input.organizationId,
        operationKey: this.editJobOperationKey(generation.id),
        type: 'thumbnail_edit_job',
        title: `소싱 썸네일 ${input.method === 'creative' ? 'AI 연출' : '편집'}: ${(input.productName ?? candidate.name ?? '소싱 후보').slice(0, 40)}`,
        sourceType: 'thumbnail_generation',
        sourceId: generation.id,
        actorUserId: input.triggeredByUserId,
        targetType: alertTarget.targetType,
        targetId: alertTarget.targetId,
        href: alertTarget.href,
        metadata: {
          method: input.method,
          sourceCandidateId: input.sourceCandidateId,
          contentWorkspaceId: input.contentWorkspaceId ?? null,
          inputCount: inputImages.length,
        },
      });
    }

    const enqueueResult = await this.agentRunner.runByType(
      THUMBNAIL_GENERATE_AGENT_TYPE,
      {
        organizationId: input.organizationId,
        requestedByUserId: input.triggeredByUserId ?? undefined,
        sourceType: AI_AGENT_SOURCE_TYPES.THUMBNAIL_GENERATE,
        sourceResourceType: 'thumbnail_generation',
        sourceResourceId: generation.id,
        reason: `thumbnail_generate for sourcing candidate ${input.sourceCandidateId}`,
        payload: input.agentPayload,
      },
    );

    if (!enqueueResult.ok) {
      const errorMessage = enqueueResult.reason
        ? `Agent OS enqueue failed: ${enqueueResult.reason}`
        : 'Agent OS enqueue failed.';
      const lock = await this.lifecycle.startAttempt({
        generationId: generation.id,
        organizationId: input.organizationId,
        actorUserId: input.triggeredByUserId,
        payload: {
          errorCode: 'agent_enqueue_failed',
          agentReason: enqueueResult.reason ?? null,
        },
      });
      if (lock) {
        await this.lifecycle.failRunningGeneration({
          generationId: generation.id,
          organizationId: input.organizationId,
          errorMessage,
          actorUserId: input.triggeredByUserId,
          payload: {
            errorCode: 'agent_enqueue_failed',
            agentReason: enqueueResult.reason ?? null,
          },
        });
      }
      if (isParentProductGenerationAlertLink(operationAlert)) {
        await this.productGenerationAlerts.markChildFinished({
          organizationId: input.organizationId,
          parentOperationKey: operationAlert.parentOperationKey,
          childKind: 'thumbnail',
          status: 'failed',
          childId: generation.id,
          errorMessage,
        });
      } else {
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
      }
      throw new BadRequestException(errorMessage);
    }

    if (
      isParentProductGenerationAlertLink(operationAlert) &&
      enqueueResult.requestId &&
      await this.shouldCancelParentThumbnailRequestAfterEnqueue({
        organizationId: input.organizationId,
        parentOperationKey: operationAlert.parentOperationKey,
        generationId: generation.id,
      })
    ) {
      await this.agentRunner.cancelRequest?.({
        organizationId: input.organizationId,
        requestId: enqueueResult.requestId,
        reason: THUMBNAIL_PARENT_CANCELLED_AFTER_ENQUEUE_MESSAGE,
        actorUserId: input.triggeredByUserId,
      });
      await this.lifecycle.markCancelled({
        organizationId: input.organizationId,
        generationId: generation.id,
        actorUserId: input.triggeredByUserId,
        payload: {
          reason: THUMBNAIL_PARENT_CANCELLED_AFTER_ENQUEUE_MESSAGE,
        },
      });
      return { generationId: generation.id, status: 'cancelled' };
    }

    this.kickEnqueuedAgentRequest({
      organizationId: input.organizationId,
      requestId: enqueueResult.requestId,
    });

    return { generationId: generation.id, status: 'pending' };
  }

  private async shouldCancelParentThumbnailRequestAfterEnqueue(input: {
    organizationId: string;
    parentOperationKey: string;
    generationId: string;
  }): Promise<boolean> {
    const [parentAcceptsChildren, generation] = await Promise.all([
      this.productGenerationAlerts.canStartChild({
        organizationId: input.organizationId,
        parentOperationKey: input.parentOperationKey,
      }),
      this.ledger.findGenerationProjectionStatus({
        generationId: input.generationId,
        organizationId: input.organizationId,
      }),
    ]);
    return (
      !parentAcceptsChildren ||
      !generation ||
      !['pending', 'running'].includes(generation.status)
    );
  }

  async enqueueStandaloneGeneration(
    input: ThumbnailStandaloneGenerationEnqueueInput,
  ): Promise<ThumbnailGenerationEnqueueResult> {
    const generation = await this.ledger.openPendingStandaloneJob({
      organizationId: input.organizationId,
      originalUrl: input.originalUrl,
      method: input.method,
      inputMeta: input.inputMeta,
      contentWorkspaceId: input.contentWorkspaceId ?? null,
      triggeredByUserId: input.triggeredByUserId,
    });

    await this.ledger.persistPendingInputImages({
      generationId: generation.id,
      organizationId: input.organizationId,
      inputImages: input.inputs,
    });

    await this.lifecycle.recordStatusChange({
      organizationId: input.organizationId,
      generationId: generation.id,
      fromStatus: null,
      toStatus: 'pending',
      fromPhase: null,
      toPhase: null,
      actorUserId: input.triggeredByUserId,
      payload: {
        method: input.method,
        inputCount: input.inputs.length,
        contentWorkspaceId: input.contentWorkspaceId ?? null,
        standalone: !input.contentWorkspaceId,
      },
    });

    const alertTarget = this.alertTarget({
      contentWorkspaceId: input.contentWorkspaceId ?? null,
      fallbackTargetType: 'thumbnail_generation',
      fallbackTargetId: generation.id,
      fallbackHref: this.thumbnailGenerationHref(generation.id),
    });
    await this.operationAlerts.start({
      organizationId: input.organizationId,
      operationKey: this.editJobOperationKey(generation.id),
      type: 'thumbnail_edit_job',
      title: `썸네일 ${input.method === 'creative' ? 'AI 연출' : '편집'}: ${(input.productName ?? '직접 업로드').slice(0, 40)}`,
      sourceType: 'thumbnail_generation',
      sourceId: generation.id,
      actorUserId: input.triggeredByUserId,
      targetType: alertTarget.targetType,
      targetId: alertTarget.targetId,
      href: alertTarget.href,
      metadata: {
        method: input.method,
        inputCount: input.inputs.length,
        contentWorkspaceId: input.contentWorkspaceId ?? null,
        standalone: !input.contentWorkspaceId,
      },
    });

    const enqueueResult = await this.agentRunner.runByType(
      THUMBNAIL_GENERATE_AGENT_TYPE,
      {
        organizationId: input.organizationId,
        requestedByUserId: input.triggeredByUserId ?? undefined,
        sourceType: AI_AGENT_SOURCE_TYPES.THUMBNAIL_GENERATE,
        sourceResourceType: 'thumbnail_generation',
        sourceResourceId: generation.id,
        reason: 'thumbnail_generate for standalone editor upload',
        payload: input.agentPayload,
      },
    );

    if (!enqueueResult.ok) {
      const errorMessage = enqueueResult.reason
        ? `Agent OS enqueue failed: ${enqueueResult.reason}`
        : 'Agent OS enqueue failed.';
      const lock = await this.lifecycle.startAttempt({
        generationId: generation.id,
        organizationId: input.organizationId,
        actorUserId: input.triggeredByUserId,
        payload: {
          errorCode: 'agent_enqueue_failed',
          agentReason: enqueueResult.reason ?? null,
        },
      });
      if (lock) {
        await this.lifecycle.failRunningGeneration({
          generationId: generation.id,
          organizationId: input.organizationId,
          errorMessage,
          actorUserId: input.triggeredByUserId,
          payload: {
            errorCode: 'agent_enqueue_failed',
            agentReason: enqueueResult.reason ?? null,
          },
        });
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

    this.kickEnqueuedAgentRequest({
      organizationId: input.organizationId,
      requestId: enqueueResult.requestId,
    });

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

  async cancelAgentRequestForGeneration(input: {
    organizationId: string;
    generationId: string;
    reason: string;
    actorUserId?: string | null;
  }): Promise<void> {
    await this.agentRunner.cancelBySource?.({
      organizationId: input.organizationId,
      sourceType: AI_AGENT_SOURCE_TYPES.THUMBNAIL_GENERATE,
      sourceResourceType: 'thumbnail_generation',
      sourceResourceId: input.generationId,
      reason: input.reason,
      actorUserId: input.actorUserId,
    });
  }

  async processEditJob(
    id: string,
    organizationId: string,
    purpose: 'compliance' | 'quality',
    variantKey: 'auto' | 'with-box' | 'no-box' | null,
  ): Promise<void> {
    const locked = await this.lifecycle.startAttempt({
      generationId: id,
      organizationId,
      payload: { purpose, variantKey: variantKey ?? 'auto' },
    });
    if (!locked) return;

    try {
      const existing = await this.ledger.findGenerationWithInputImages(id, organizationId);
      if (!existing) return;
      if (!existing.masterId) {
        throw new BadRequestException('소싱 후보 썸네일은 후보 생성 작업 경로에서만 실행할 수 있습니다');
      }
      const master = await this.ledger.findJobMaster(existing.masterId, organizationId);
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
            role: toInputRole(row.role ?? 'product'),
            sortOrder: row.sortOrder,
            source: row.source ?? 're-edit',
          }),
        );
      }
      const editCase = inferEditCaseFromInputs(inputImages);
      const analysis: ThumbnailAnalysisContext | null = master.thumbnailAnalyses[0] ?? null;
      const recomposeKind =
        findRecomposeKindIn(existing.inputMeta as ThumbnailJsonValue | null | undefined) ??
        findRecomposeKindIn(existing.editAnalysis as ThumbnailJsonValue | null | undefined) ??
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

      const inputMeta = {
        mode: 'edit',
        purpose,
        editCase,
        variantKey: variantKey ?? 'auto',
        automated: existing.method === 'auto',
        inputCount: inputImages.length,
        recompose: analysis?.recompose ?? null,
        analysisContext: toAnalysisContextJson(analysis, editSuggestions),
      };
      const completionPayload = {
        candidateCount: candidates.length,
        inputCount: inputImages.length,
        editCase,
        variantKey: variantKey ?? 'auto',
      };
      const completed = await this.lifecycle.completeLegacyEdit({
        generationId: id,
        organizationId,
        candidates,
        inputImages,
        inputMeta,
        editAnalysis: toEditAnalysis(analysis),
        payload: completionPayload,
      });
      if (completed) {
        await this.operationAlerts.succeed(
          organizationId,
          this.editJobOperationKey(id),
          { metadata: { candidateCount: candidates.length } },
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`편집 처리 실패 (${id}): ${message}`);
      await this.lifecycle.failRunningGeneration({
        generationId: id,
        organizationId,
        errorMessage: message,
        payload: { purpose, variantKey: variantKey ?? 'auto' },
      });
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

  private attachCandidateImageRefs(
    inputs: ThumbnailEditorInputImage[],
    candidateImages: Array<{ id: string; url: string; storageKey: string | null }>,
  ): ThumbnailEditorInputImage[] {
    if (candidateImages.length === 0) return inputs;
    const byUrl = new Map(candidateImages.map((image) => [image.url, image]));
    const byKey = new Map(
      candidateImages
        .filter((image): image is { id: string; url: string; storageKey: string } => Boolean(image.storageKey))
        .map((image) => [image.storageKey, image]),
    );
    return inputs.map((input) => {
      if (input.candidateImageId) return input;
      const matched = byUrl.get(input.url) ?? (input.storageKey ? byKey.get(input.storageKey) : undefined);
      if (!matched) return input;
      return {
        ...input,
        source: input.source === 'upload' ? 'sourcing_candidate' : input.source,
        storageKey: input.storageKey ?? matched.storageKey,
        candidateImageId: matched.id,
      };
    });
  }

  private thumbnailGenerationHref(generationId: string): string {
    return `/product-pipeline/thumbnail-generation/edit?generationId=${encodeURIComponent(generationId)}`;
  }

  private contentWorkspaceHref(contentWorkspaceId: string): string {
    return `/product-pipeline/registered-products/${encodeURIComponent(contentWorkspaceId)}`;
  }

  private alertTarget(input: {
    contentWorkspaceId: string | null;
    fallbackTargetType: string;
    fallbackTargetId: string;
    fallbackHref: string;
  }): { targetType: string; targetId: string; href: string } {
    if (input.contentWorkspaceId) {
      return {
        targetType: 'content_workspace',
        targetId: input.contentWorkspaceId,
        href: this.contentWorkspaceHref(input.contentWorkspaceId),
      };
    }
    return {
      targetType: input.fallbackTargetType,
      targetId: input.fallbackTargetId,
      href: input.fallbackHref,
    };
  }

  private kickEnqueuedAgentRequest(input: {
    organizationId: string;
    requestId?: string;
  }): void {
    if (!input.requestId || !this.agentRunner.executeRequest) return;

    kickInlineAgentRequest({
      agentRunner: this.agentRunner,
      organizationId: input.organizationId,
      requestId: input.requestId,
      workerId: 'thumbnail-generate-inline',
      logger: this.logger,
      label: 'thumbnail_generate',
    });
  }

}

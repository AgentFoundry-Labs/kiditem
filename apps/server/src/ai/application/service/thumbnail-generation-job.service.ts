import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ThumbnailEditorAiService } from './thumbnail-editor-ai.service';
import type { ThumbnailEditorCandidate, ThumbnailEditorInputImage } from '../../domain/model/thumbnail-editor';
import { resolveWorkspaceThumbnailSource } from '../../domain/thumbnail-workspace-source';
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
import { ThumbnailGenerationLifecycleService } from './thumbnail-generation-lifecycle.service';
import { ThumbnailDirectGenerationJobService } from './thumbnail-direct-generation-job.service';
import { resolveAiDirectJobModels } from './ai-direct-job.config';
import type { ProductGenerationChildIdentity } from './product-generation-child-identity';

export interface ThumbnailEditorGenerationEnqueueInput {
  organizationId: string;
  contentWorkspaceId: string;
  productName: string;
  triggeredByUserId: string | null;
  inputs: ThumbnailEditorInputImage[];
  inputMeta: unknown;
  method: 'generate' | 'creative';
  originalUrl: string;
  directPayload: Record<string, unknown>;
}

export interface ThumbnailSalesProductGenerationEnqueueInput {
  organizationId: string;
  salesProductId: string;
  productName: string;
  contentWorkspaceId?: string | null;
  triggeredByUserId: string | null;
  inputs: ThumbnailEditorInputImage[];
  inputMeta: unknown;
  method: 'generate' | 'creative';
  originalUrl: string;
  directPayload: Record<string, unknown>;
  productGenerationIdentity?: ProductGenerationChildIdentity;
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
  directPayload: Record<string, unknown>;
}

type ThumbnailGenerationEnqueueResult = {
  generationId: string;
  status: 'pending' | 'cancelled';
};

@Injectable()
export class ThumbnailGenerationJobService {
  private readonly logger = new Logger(ThumbnailGenerationJobService.name);

  constructor(
    @Inject(THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT)
    private readonly ledger: ThumbnailGenerationLedgerRepositoryPort,
    private readonly editorAiService: ThumbnailEditorAiService,
    private readonly directGenerationJobs: ThumbnailDirectGenerationJobService,
    private readonly lifecycle: ThumbnailGenerationLifecycleService,
  ) {}

  async enqueueEditorGeneration(
    input: ThumbnailEditorGenerationEnqueueInput,
  ): Promise<ThumbnailGenerationEnqueueResult> {
    const models = resolveAiDirectJobModels('thumbnail_generate');
    const directJob = this.directGenerationJobs.prepareGenerate({ payload: input.directPayload, models });
    const opened = await this.ledger.openPendingDirectGeneration({
      subject: 'editor',
      organizationId: input.organizationId,
      contentWorkspaceId: input.contentWorkspaceId,
      originalUrl: input.originalUrl,
      method: input.method,
      inputMeta: input.inputMeta,
      editAnalysis: null,
      triggeredByUserId: input.triggeredByUserId,
      inputImages: input.inputs,
      directJob,
    });
    const generation = { id: opened.generationId };

    if (opened.status === 'created') {
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
          contentWorkspaceId: input.contentWorkspaceId,
          inputCount: input.inputs.length,
        },
      });
    }

    if (opened.releaseRequired) {
      await this.directGenerationJobs.release({
        organizationId: input.organizationId,
        jobId: opened.directJobId,
      });
    }

    return { generationId: generation.id, status: 'pending' };
  }

  async enqueueSalesProductGeneration(
    input: ThumbnailSalesProductGenerationEnqueueInput,
  ): Promise<ThumbnailGenerationEnqueueResult> {
    const models = resolveAiDirectJobModels('thumbnail_generate');
    // The caller owns the draft's images, so it also owns the `candidateImageId`
    // provenance on each input; AI records what it is given.
    const inputImages = input.inputs;
    const directJob = this.directGenerationJobs.prepareGenerate({ payload: input.directPayload, models });
    const opened = await this.ledger.openPendingDirectGeneration({
      subject: 'sales_product',
      organizationId: input.organizationId,
      salesProductId: input.salesProductId,
      productName: input.productName,
      originalUrl: input.originalUrl,
      method: input.method,
      inputMeta: input.inputMeta,
      contentWorkspaceId: input.contentWorkspaceId ?? null,
      triggeredByUserId: input.triggeredByUserId,
      inputImages,
      productGenerationIdentity: input.productGenerationIdentity,
      directJob,
    });
    const generation = { id: opened.generationId };

    if (opened.status === 'created') {
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
          salesProductId: input.salesProductId,
          contentWorkspaceId: input.contentWorkspaceId ?? null,
          inputCount: inputImages.length,
        },
      });
    }

    if (opened.releaseRequired) {
      await this.directGenerationJobs.release({
        organizationId: input.organizationId,
        jobId: opened.directJobId,
      });
    }

    return { generationId: generation.id, status: 'pending' };
  }

  async enqueueStandaloneGeneration(
    input: ThumbnailStandaloneGenerationEnqueueInput,
  ): Promise<ThumbnailGenerationEnqueueResult> {
    const models = resolveAiDirectJobModels('thumbnail_generate');
    const directJob = this.directGenerationJobs.prepareGenerate({ payload: input.directPayload, models });
    const opened = await this.ledger.openPendingDirectGeneration({
      subject: 'standalone',
      organizationId: input.organizationId,
      originalUrl: input.originalUrl,
      method: input.method,
      inputMeta: input.inputMeta,
      contentWorkspaceId: input.contentWorkspaceId ?? null,
      triggeredByUserId: input.triggeredByUserId,
      inputImages: input.inputs,
      directJob,
    });
    const generation = { id: opened.generationId };

    if (opened.status === 'created') {
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
    }

    if (opened.releaseRequired) {
      await this.directGenerationJobs.release({
        organizationId: input.organizationId,
        jobId: opened.directJobId,
      });
    }

    return { generationId: generation.id, status: 'pending' };
  }

  async scheduleEditJob(
    generationId: string,
    organizationId: string,
    purpose: 'compliance' | 'quality',
    variantKey: 'auto' | 'with-box' | 'no-box' | null,
  ): Promise<void> {
    const models = resolveAiDirectJobModels('thumbnail_reedit');
    await this.directGenerationJobs.scheduleReedit({
      organizationId,
      generationId,
      purpose,
      variantKey: variantKey ?? 'auto',
      models,
    });
  }

  async processEditJob(
    id: string,
    organizationId: string,
    purpose: 'compliance' | 'quality',
    variantKey: 'auto' | 'with-box' | 'no-box' | null,
    model: string,
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    const locked = await this.lifecycle.startAttempt({
      generationId: id,
      organizationId,
      payload: { purpose, variantKey: variantKey ?? 'auto' },
    });
    if (!locked) return;

    try {
      const existing = await this.ledger.findGenerationWithInputImages(id, organizationId);
      if (!existing) return;
      if (!existing.contentWorkspaceId) {
        throw new BadRequestException('소싱 후보 썸네일은 후보 생성 작업 경로에서만 실행할 수 있습니다');
      }
      const workspace = await this.ledger.findWorkspaceForThumbnailJob(existing.contentWorkspaceId, organizationId);
      if (!workspace) {
        throw new BadRequestException('상품 정보를 찾을 수 없습니다');
      }

      const workspaceFallback = resolveWorkspaceThumbnailSource(workspace);
      const seedRows =
        existing.inputImages.length > 0
          ? existing.inputImages
          : [
              {
                url: existing.selectedUrl ?? existing.originalUrl ?? workspaceFallback,
                role: 'product',
                label: 'Product photo',
                sortOrder: 0,
                source: 'workspace_image',
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
            signal,
          }),
        );
      }
      const editCase = inferEditCaseFromInputs(inputImages);
      const analysis: ThumbnailAnalysisContext | null = workspace.thumbnailAnalyses[0] ?? null;
      const recomposeKind =
        findRecomposeKindIn(existing.inputMeta as ThumbnailJsonValue | null | undefined) ??
        findRecomposeKindIn(existing.editAnalysis as ThumbnailJsonValue | null | undefined) ??
        extractRecomposeKind(analysis?.recompose ?? null);
      const editSuggestions = extractEditSuggestions(analysis?.complianceScores ?? null);
      const promptOverride = getRecomposePromptOverride(recomposeKind, variantKey, workspace.category, workspace.name);
      const candidates: ThumbnailEditorCandidate[] = await this.editorAiService.generateEdit(
        inputImages,
        organizationId,
        {
          model,
          signal,
          purpose,
          editCase,
          userPrompt: promptOverride ? undefined : variantInstruction(variantKey),
          productDescription: [workspace.name, workspace.category].filter(Boolean).join(' / '),
          productName: workspace.name,
          category: workspace.category,
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
      await this.lifecycle.completeLegacyEdit({
        generationId: id,
        organizationId,
        candidates,
        inputImages,
        inputMeta,
        editAnalysis: toEditAnalysis(analysis),
        payload: completionPayload,
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`편집 처리 실패 (${id}): ${message}`);
      await this.lifecycle.failRunningGeneration({
        generationId: id,
        organizationId,
        errorMessage: message,
        payload: { purpose, variantKey: variantKey ?? 'auto' },
      });
    }
  }

}

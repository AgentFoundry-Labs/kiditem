import { Inject, Injectable, Logger } from '@nestjs/common';
import { KiditemNotFoundError, KiditemPreconditionError } from '@kiditem/shared/errors';
import { ThumbnailEditorAiService } from './thumbnail-editor-ai.service';
import type { ThumbnailEditorCandidate, ThumbnailEditorInputImage } from '../../domain/model/thumbnail-editor';
import { resolveWorkspaceThumbnailSource } from '../../domain/thumbnail-workspace-source';
import { getRecomposePromptOverride } from '../../domain/prompts/thumbnail-recompose-prompts';
import {
  findRecomposeKindIn,
  inferEditCaseFromInputs,
  toInputRole,
  variantInstruction,
  type ThumbnailJsonValue,
} from '../../domain/thumbnail-generation-inputs';
import { readThumbnailJobInputs } from '../../domain/thumbnail/thumbnail-job-input-meta';
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
      triggeredByUserId: input.triggeredByUserId,
      inputImages: input.inputs,
      directJob,
    });
    const generation = { id: opened.generationId };


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
    const locked = await this.lifecycle.startAttempt({ generationId: id, organizationId });
    if (!locked) return;

    try {
      const existing = await this.ledger.findGenerationOrThrow(id, organizationId);
      const workspace = await this.ledger.findWorkspaceForThumbnailJob(existing.contentWorkspaceId, organizationId);
      if (!workspace) {
        throw new KiditemNotFoundError('CONTENT_NOT_FOUND', { details: { reason: 'workspace' } });
      }

      // 재편집은 job 의 `input_meta` 에 남은 입력 사진을 다시 읽는다. 없으면 원본 · 작업공간 사진 하나로.
      const jobInputs = readThumbnailJobInputs(existing.inputMeta);
      const seedRows = jobInputs.inputImages.length > 0
        ? jobInputs.inputImages
        : [{
            url: jobInputs.originalUrl ?? resolveWorkspaceThumbnailSource(workspace),
            role: 'product',
            label: 'Product photo',
            sortOrder: 0,
            source: 'workspace_image',
          }];
      const validSeedRows = seedRows.flatMap((row) => (row.url ? [{ ...row, url: row.url }] : []));
      if (validSeedRows.length === 0) {
        throw new KiditemPreconditionError('CONTENT_GENERATION_INPUT_MISSING', { details: { reason: 'REEDIT_SOURCE_IMAGE_MISSING' } });
      }

      const inputImages: ThumbnailEditorInputImage[] = [];
      for (const row of validSeedRows) {
        inputImages.push(
          await this.editorAiService.resolveInputImage(row.url, organizationId, {
            label: row.label ?? 'Product photo',
            role: toInputRole(row.role ?? 'product'),
            sortOrder: row.sortOrder,
            source: row.source ?? 're-edit',
            signal,
          }),
        );
      }
      const editCase = inferEditCaseFromInputs(inputImages);
      const recomposeKind =
        findRecomposeKindIn(existing.inputMeta as ThumbnailJsonValue | null | undefined) ??
        findRecomposeKindIn(jobInputs.editAnalysis as ThumbnailJsonValue | null | undefined);
      const productName = workspace.name || readProductName(existing.inputMeta);
      const promptOverride = getRecomposePromptOverride(recomposeKind, variantKey, workspace.category, productName);
      const candidates: ThumbnailEditorCandidate[] = await this.editorAiService.generateEdit(
        inputImages,
        organizationId,
        {
          model,
          signal,
          purpose,
          editCase,
          userPrompt: promptOverride ? undefined : variantInstruction(variantKey),
          productDescription: [productName, workspace.category].filter(Boolean).join(' / '),
          productName,
          category: workspace.category,
          promptOverride,
          editSuggestions: null,
          referenceMode: 'edit-image',
        },
      );

      await this.lifecycle.completeLegacyEdit({
        generationId: id,
        organizationId,
        candidates,
        inputMeta: {
          mode: 'edit',
          purpose,
          editCase,
          variantKey: variantKey ?? 'auto',
          automated: existing.method === 'auto',
          inputCount: inputImages.length,
          productName: productName || null,
        },
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`편집 처리 실패 (${id}): ${message}`);
      await this.lifecycle.failRunningGeneration({ generationId: id, organizationId, errorMessage: message });
    }
  }
}

function readProductName(inputMeta: unknown): string {
  if (!inputMeta || typeof inputMeta !== 'object' || Array.isArray(inputMeta)) return '';
  const value = (inputMeta as Record<string, unknown>).productName;
  return typeof value === 'string' ? value : '';
}

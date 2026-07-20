import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AI_OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../port/out/cross-domain/operation-alert.port';
import type { GenerateDetailPageInput } from './detail-page-requests';
import {
  IMAGE_STORAGE_PORT,
  type ImageStoragePort,
} from '../port/out/storage/image-storage.port';
import type { MulterFile } from '../../../common/types';
import {
  looksLikeSafetyLabelImage,
  moveSafetyLabelImagesToEnd,
  trimSafetyLabelWhitespace,
} from '../../domain/detail-page-image-order';
import type {
  DetailImageCount,
  DetailPageAgeGroup,
  KcCertificationStatus,
  UsageSectionMode,
} from '../../domain/prompts/detail-page/types';
import { normalizeKcCertificationNumber } from '../../domain/prompts/detail-page/types';
import type {
  DetailPageGenerationDto,
  DetailPageRawInput,
  DetailPageSourceReference,
  DetailPageTemplateId,
} from './detail-page-ai.types';
import { DetailPageQueryService } from './detail-page-query.service';
import {
  detailPageResultHref,
  detailPageOperationKey,
  toDetailPageStoredJson,
} from './detail-page-stored.helpers';
import {
  registeredWorkspaceEditorHref,
  ContentWorkspaceService,
} from './content-workspace.service';
import {
  type GenerationAlertLink,
  STANDALONE_GENERATION_ALERT,
  isParentProductGenerationAlertLink,
  productGenerationMetadata,
  readProductGenerationAlertLink,
} from './product-generation-alert-link';
import { ProductGenerationAlertService } from './product-generation-alert.service';
import {
  asPlainRecord,
  operationCancellationAudit,
} from '../../../common/operation-cancellation-audit';
import {
  DETAIL_PAGE_GENERATION_REPOSITORY_PORT,
  type DetailPageGenerationRepositoryPort,
} from '../port/out/repository/detail-page-generation.repository.port';
import { DetailPageDirectGenerationJobService } from './detail-page-direct-generation-job.service';
import { resolveAiDirectJobModels } from './ai-direct-job.config';

const DETAIL_PAGE_PROCESSING_STATUSES = [
  'PENDING',
  'PROCESSING',
  'generating',
  'pending',
  'processing',
];
const DETAIL_PAGE_TERMINAL_STATUSES = new Set([
  'READY',
  'FAILED',
  'CANCELLED',
  'completed',
  'failed',
  'cancelled',
]);
const DETAIL_PAGE_CANCELLED_MESSAGE = '사용자 요청으로 생성이 중단되었습니다.';
const DETAIL_PAGE_PARENT_CANCELLED_AFTER_ENQUEUE_MESSAGE =
  'Parent product generation was cancelled before detail request execution.';
const DETAIL_PAGE_IMAGE_REQUIRED_MESSAGE = '상세페이지 생성에는 상품 이미지가 최소 1장 필요합니다.';

@Injectable()
export class DetailPageGenerationService {
  private readonly logger = new Logger(DetailPageGenerationService.name);

  constructor(
    @Inject(DETAIL_PAGE_GENERATION_REPOSITORY_PORT)
    private readonly repository: DetailPageGenerationRepositoryPort,
    @Inject(IMAGE_STORAGE_PORT)
    private readonly imageStorage: ImageStoragePort,
    @Inject(AI_OPERATION_ALERT_PORT)
    private readonly operationAlerts: OperationAlertPort,
    private readonly query: DetailPageQueryService,
    private readonly directGenerationJobs: DetailPageDirectGenerationJobService,
    private readonly contentWorkspaces: ContentWorkspaceService,
    private readonly productGenerationAlerts: ProductGenerationAlertService,
  ) {}

  async uploadInputImage(
    file: MulterFile,
    organizationId: string,
  ): Promise<{ url: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('이미지 파일이 필요합니다.');
    }
    const ext = this.extForMime(file.mimetype);
    const fileRole = await this.detectUploadedImageRole(file.buffer);
    const buffer = fileRole === 'safety-label'
      ? await this.trimSafetyLabelImage(file.buffer)
      : file.buffer;
    const url = await this.imageStorage.save(
      `detail-page-inputs/${organizationId}/${fileRole}-${randomUUID()}.${ext}`,
      buffer,
      file.mimetype,
    );
    return { url };
  }

  async generate(
    dto: GenerateDetailPageInput,
    organizationId: string,
    triggeredByUserId: string | null,
    options: { operationAlert?: GenerationAlertLink } = {},
  ): Promise<DetailPageGenerationDto> {
    const heroImageMode = dto.heroImageMode ?? 'llm-pick';
    const templateId = dto.templateId ?? 'kids-playful';
    const generationMode = dto.generationMode ?? 'full';
    const ageGroup: DetailPageAgeGroup = dto.ageGroup ?? 'age-8-plus';
    const detailImageCount: DetailImageCount = dto.detailImageCount ?? '2';
    const usageSectionMode: UsageSectionMode = dto.usageSectionMode ?? 'include';
    const kcCertificationStatus: KcCertificationStatus = dto.kcCertificationStatus ?? 'unknown';
    const kcCertificationNumber = normalizeKcCertificationNumber(dto.kcCertificationNumber);
    const imageUrls = moveSafetyLabelImagesToEnd(dto.imageUrls ?? []);
    if (imageUrls.length === 0) {
      throw new BadRequestException(DETAIL_PAGE_IMAGE_REQUIRED_MESSAGE);
    }
    const rawInput: DetailPageRawInput = {
      rawTitle: dto.rawTitle,
      rawCategory: dto.rawCategory,
      rawDescription: dto.rawDescription,
      rawOptions: dto.rawOptions,
      imageUrls,
      heroImageMode,
      templateId,
      generationMode,
      ageGroup,
      detailImageCount,
      usageSectionMode,
      kcCertificationStatus,
      kcCertificationNumber,
    };
    const operationAlert = options.operationAlert ?? STANDALONE_GENERATION_ALERT;
    if (isParentProductGenerationAlertLink(operationAlert)) {
      rawInput.productGeneration = {
        mode: 'parent',
        ...productGenerationMetadata(operationAlert),
      };
    }
    const requestedContentWorkspace = dto.contentWorkspaceId
      ? await this.resolveContentWorkspace(organizationId, dto.contentWorkspaceId)
      : null;
    let sourceReferences = await this.normalizeSourceReferences({
      organizationId,
      sourceReferences: dto.sourceReferences ?? [],
    });
    const primarySourceCandidateId =
      requestedContentWorkspace?.sourceCandidateId ??
      sourceReferences.find((ref) => ref.sourceType === 'sourcing_candidate')
        ?.sourceCandidateId ?? null;
    if (
      requestedContentWorkspace?.sourceCandidateId &&
      !sourceReferences.some((ref) => ref.sourceCandidateId === requestedContentWorkspace.sourceCandidateId)
    ) {
      sourceReferences = [
        {
          sourceType: 'sourcing_candidate',
          sourceCandidateId: requestedContentWorkspace.sourceCandidateId,
          label: requestedContentWorkspace.displayName,
        },
        ...sourceReferences,
      ];
    }
    if (sourceReferences.length > 0) rawInput.sourceReferences = sourceReferences;
    const contentWorkspace = requestedContentWorkspace ??
      await this.contentWorkspaces.ensureForGeneration({
        organizationId,
        triggeredByUserId,
        rawTitle: dto.rawTitle,
        sourceCandidateId: primarySourceCandidateId,
      });
    const imageOnlyBase = generationMode === 'image'
      ? await this.findImageOnlyBaseGeneration({
        organizationId,
        sourceCandidateId: primarySourceCandidateId,
        contentWorkspaceId: contentWorkspace.id,
        templateId,
      })
      : null;
    if (generationMode === 'image') {
      if (!imageOnlyBase) {
        throw new BadRequestException('이미지만 생성하려면 먼저 같은 후보/템플릿의 카피 생성 결과가 필요합니다.');
      }
      rawInput.baseContentGenerationId = imageOnlyBase.id;
    }

    return this.enqueueGeneration({
      organizationId,
      triggeredByUserId,
      rawTitle: dto.rawTitle,
      templateId,
      heroImageMode,
      imageUrls,
      rawInput,
      sourceReferences,
      sourceCandidateId: primarySourceCandidateId,
      existingResult: imageOnlyBase?.result,
      contentWorkspaceId: contentWorkspace.id,
      preferContentWorkspaceAlert: Boolean(dto.contentWorkspaceId),
      operationAlert,
    });
  }

  private async resolveContentWorkspace(
    organizationId: string,
    contentWorkspaceId: string,
  ): Promise<{
    id: string;
    sourceCandidateId: string | null;
    displayName: string;
    normalizedTitle: string;
  }> {
    const row = await this.repository.findActiveContentWorkspace({
      organizationId,
      contentWorkspaceId,
    });
    if (!row) throw new NotFoundException('Content workspace not found');
    return row;
  }

  private async enqueueGeneration(input: {
    organizationId: string;
    triggeredByUserId: string | null;
    rawTitle: string;
    templateId: DetailPageTemplateId;
    heroImageMode: 'first' | 'llm-pick';
    imageUrls: string[];
    rawInput: DetailPageRawInput;
    sourceReferences: DetailPageSourceReference[];
    sourceCandidateId: string | null;
    existingResult?: unknown;
    generationGroupId?: string | null;
    contentWorkspaceId: string;
    preferContentWorkspaceAlert?: boolean;
    operationAlert: GenerationAlertLink;
  }): Promise<DetailPageGenerationDto> {
    const models = resolveAiDirectJobModels('detail_page_generate');
    const primarySourceCandidateId =
      input.sourceCandidateId ??
      input.sourceReferences.find((ref) => ref.sourceType === 'sourcing_candidate')
        ?.sourceCandidateId ?? null;
    const directPayload = {
      templateId: input.templateId,
      raw: {
        rawTitle: input.rawInput.rawTitle,
        rawCategory: input.rawInput.rawCategory,
        rawDescription: input.rawInput.rawDescription,
        rawOptions: input.rawInput.rawOptions,
        imageUrls: input.rawInput.imageUrls,
        ageGroup: input.rawInput.ageGroup,
        detailImageCount: input.rawInput.detailImageCount,
        usageSectionMode: input.rawInput.usageSectionMode,
        kcCertificationStatus: input.rawInput.kcCertificationStatus,
        kcCertificationNumber: input.rawInput.kcCertificationNumber,
      },
      heroImageMode: input.heroImageMode,
      generationMode: input.rawInput.generationMode ?? 'full',
      ...(input.existingResult !== undefined
        ? { existingResult: input.existingResult }
        : {}),
    };
    const directJob = this.directGenerationJobs.prepareGenerate({ payload: directPayload, models });

    const opened = await this.repository.openProcessingGenerationLedger({
      organizationId: input.organizationId,
      generationGroupId: input.generationGroupId,
      contentWorkspaceId: input.contentWorkspaceId,
      sourceCandidateId: primarySourceCandidateId,
      triggeredByUserId: input.triggeredByUserId,
      templateId: input.templateId,
      rawInput: input.rawInput,
      imageUrls: input.imageUrls,
      rawTitle: input.rawTitle,
      sourceReferences: input.sourceReferences,
      directJob,
    });
    const row = opened.row;

    if (isParentProductGenerationAlertLink(input.operationAlert)) {
      const childStart = await this.productGenerationAlerts.recordChildStarted({
        organizationId: input.organizationId,
        parentOperationKey: input.operationAlert.parentOperationKey,
        childKind: 'detail_page',
        childId: row.id,
      });
      if (childStart.status !== 'started') {
        await this.directGenerationJobs.cancelHeld({
          organizationId: input.organizationId,
          jobId: opened.directJobId,
          reason: 'Parent product generation is not accepting detail child jobs.',
        });
        await this.repository.markGenerationRejectedByParent({
          organizationId: input.organizationId,
          generationId: row.id,
          status: childStart.alert?.status === 'cancelled' ? 'CANCELLED' : 'FAILED',
          errorMessage:
            childStart.alert?.status === 'cancelled'
              ? 'Parent product generation was cancelled before detail child enqueue.'
              : 'Parent product generation is not accepting detail child jobs.',
        });
        return this.query.getById(row.id, input.organizationId);
      }
    } else {
      const alertTargetsContentWorkspace = input.preferContentWorkspaceAlert || !primarySourceCandidateId;
      await this.operationAlerts.start({
        organizationId: input.organizationId,
        operationKey: detailPageOperationKey(row.id),
        type: 'detail_page_generation',
        title: `상세페이지 생성: ${input.rawTitle.slice(0, 40)}`,
        sourceType: 'content_generation',
        sourceId: row.id,
        actorUserId: input.triggeredByUserId,
        targetType: alertTargetsContentWorkspace ? 'content_workspace' : 'sourcing_candidate',
        targetId: alertTargetsContentWorkspace ? input.contentWorkspaceId : primarySourceCandidateId,
        href: alertTargetsContentWorkspace
          ? registeredWorkspaceEditorHref(input.contentWorkspaceId, row.id)
          : detailPageResultHref({
            productId: null,
            sourceCandidateId: primarySourceCandidateId,
            contentGenerationId: row.id,
            templateId: input.templateId,
          }),
        metadata: {
          templateId: input.templateId,
          imageCount: input.imageUrls.length,
          sourceCandidateId: primarySourceCandidateId,
          contentWorkspaceId: input.contentWorkspaceId,
        },
      });
    }

    if (
      isParentProductGenerationAlertLink(input.operationAlert) &&
      await this.shouldCancelParentDetailRequestBeforeExecution({
        organizationId: input.organizationId,
        parentOperationKey: input.operationAlert.parentOperationKey,
        generationId: row.id,
      })
    ) {
      await this.directGenerationJobs.cancelHeld({
        organizationId: input.organizationId,
        jobId: opened.directJobId,
        reason: DETAIL_PAGE_PARENT_CANCELLED_AFTER_ENQUEUE_MESSAGE,
      });
      await this.repository.markGenerationCancelledIfProcessing({
        organizationId: input.organizationId,
        generationId: row.id,
        processingStatuses: DETAIL_PAGE_PROCESSING_STATUSES,
        errorMessage: DETAIL_PAGE_PARENT_CANCELLED_AFTER_ENQUEUE_MESSAGE,
      });
      return this.query.getById(row.id, input.organizationId);
    }

    await this.directGenerationJobs.release({
      organizationId: input.organizationId,
      jobId: opened.directJobId,
    });

    return this.query.getById(row.id, input.organizationId);
  }

  private async shouldCancelParentDetailRequestBeforeExecution(input: {
    organizationId: string;
    parentOperationKey: string;
    generationId: string;
  }): Promise<boolean> {
    const [parentAcceptsChildren, child] = await Promise.all([
      this.productGenerationAlerts.canStartChild({
        organizationId: input.organizationId,
        parentOperationKey: input.parentOperationKey,
      }),
      this.repository.findGenerationStatus({
        organizationId: input.organizationId,
        generationId: input.generationId,
      }),
    ]);
    return (
      !parentAcceptsChildren ||
      !child ||
      !DETAIL_PAGE_PROCESSING_STATUSES.includes(child.status)
    );
  }

  async rerunSameInput(
    generationId: string,
    organizationId: string,
    triggeredByUserId: string | null,
  ): Promise<DetailPageGenerationDto> {
    const base = await this.repository.findRerunBase({ generationId, organizationId });
    if (!base) throw new NotFoundException('Detail page generation not found');
    const stored = toDetailPageStoredJson({
      templateId: this.normalizeTemplateId(base.templateId),
      generationInput: base.generationInput,
      generationResult: base.generationResult,
    });
    const rawRecord = stored.rawInput && typeof stored.rawInput === 'object'
      ? stored.rawInput as Record<string, unknown>
      : {};
    const imageUrls = stored.imageUrls;
    if (imageUrls.length === 0) {
      throw new BadRequestException(DETAIL_PAGE_IMAGE_REQUIRED_MESSAGE);
    }
    const templateId: DetailPageTemplateId =
      base.templateId === 'bold-vertical' || stored.templateId === 'bold-vertical'
        ? 'bold-vertical'
        : 'kids-playful';
    const generationGroupId = await this.ensureGenerationGroup({
      organizationId,
      baseGenerationId: base.id,
      existingGroupId: base.generationGroupId,
      contentWorkspaceId: base.contentWorkspaceId,
      title: pickRawString(rawRecord, 'rawTitle') ?? base.generatedTitle ?? '상세페이지 작업',
      triggeredByUserId,
    });
    const contentWorkspaceId = base.contentWorkspaceId;
    const rawInput: DetailPageRawInput = {
      rawTitle: pickRawString(rawRecord, 'rawTitle') ?? base.generatedTitle ?? '상세페이지 작업',
      rawCategory: pickRawString(rawRecord, 'rawCategory') ?? '',
      rawDescription: pickRawString(rawRecord, 'rawDescription') ?? '',
      rawOptions: pickRawString(rawRecord, 'rawOptions') ?? '',
      imageUrls,
      heroImageMode: rawRecord.heroImageMode === 'llm-pick' ? 'llm-pick' : 'first',
      templateId,
      ageGroup: rawRecord.ageGroup === 'age-14-plus' ? 'age-14-plus' : 'age-8-plus',
      detailImageCount: pickDetailImageCount(rawRecord.detailImageCount),
      usageSectionMode: rawRecord.usageSectionMode === 'exclude' ? 'exclude' : 'include',
      kcCertificationStatus: pickKcCertificationStatus(rawRecord.kcCertificationStatus),
      kcCertificationNumber: pickRawString(rawRecord, 'kcCertificationNumber') ?? undefined,
      sourceReferences: Array.isArray(rawRecord.sourceReferences)
        ? rawRecord.sourceReferences.filter(isDetailPageSourceReference)
        : undefined,
    };
    return this.enqueueGeneration({
      organizationId,
      triggeredByUserId,
      rawTitle: rawInput.rawTitle,
      templateId,
      heroImageMode: rawInput.heroImageMode,
      imageUrls,
      rawInput,
      sourceReferences: rawInput.sourceReferences ?? [],
      sourceCandidateId: base.sourceCandidateId,
      generationGroupId,
      contentWorkspaceId,
      operationAlert: STANDALONE_GENERATION_ALERT,
    });
  }

  private async findImageOnlyBaseGeneration(input: {
    organizationId: string;
    sourceCandidateId: string | null;
    contentWorkspaceId: string | null;
    templateId: DetailPageTemplateId;
  }): Promise<{ id: string; result: unknown } | null> {
    const sourceCandidateId = input.sourceCandidateId;
    if (!sourceCandidateId && !input.contentWorkspaceId) return null;
    const rows = await this.repository.findImageOnlyBaseCandidates({
      organizationId: input.organizationId,
      sourceCandidateId,
      contentWorkspaceId: input.contentWorkspaceId,
      templateId: input.templateId,
    });
    for (const row of rows) {
      const stored = toDetailPageStoredJson({
        templateId: this.normalizeTemplateId(row.templateId),
        generationInput: row.generationInput,
        generationResult: row.generationResult,
      });
      if (this.storedGenerationMode(stored.rawInput) === 'image') continue;
      if (!stored.result || typeof stored.result !== 'object' || Object.keys(stored.result).length === 0) {
        continue;
      }
      return { id: row.id, result: stored.result };
    }
    return null;
  }

  private async ensureGenerationGroup(input: {
    organizationId: string;
    baseGenerationId: string;
    existingGroupId: string | null;
    contentWorkspaceId: string;
    title: string;
    triggeredByUserId: string | null;
  }): Promise<string> {
    return this.repository.ensureRerunGenerationGroup(input);
  }

  private async normalizeSourceReferences(input: {
    organizationId: string;
    sourceReferences: NonNullable<GenerateDetailPageInput['sourceReferences']>;
  }): Promise<DetailPageSourceReference[]> {
    const out: DetailPageSourceReference[] = [];
    for (const [index, ref] of input.sourceReferences.entries()) {
      if (ref.sourceType === 'sourcing_candidate') {
        if (!ref.sourceCandidateId) {
          throw new BadRequestException(`sourceReferences[${index}].sourceCandidateId is required`);
        }
        const candidate = await this.repository.findSourceCandidate({
          organizationId: input.organizationId,
          sourceCandidateId: ref.sourceCandidateId,
        });
        if (!candidate) throw new NotFoundException('Sourcing candidate source not found');
        out.push({
          sourceType: 'sourcing_candidate',
          sourceCandidateId: candidate.id,
          label: ref.label ?? candidate.name,
        });
        continue;
      }

      if (ref.sourceType === 'content_generation') {
        if (!ref.sourceContentGenerationId) {
          throw new BadRequestException(`sourceReferences[${index}].sourceContentGenerationId is required`);
        }
        const generation = await this.repository.findSourceContentGeneration({
          organizationId: input.organizationId,
          sourceContentGenerationId: ref.sourceContentGenerationId,
        });
        if (!generation) throw new NotFoundException('Content generation source not found');
        out.push({
          sourceType: 'content_generation',
          sourceContentGenerationId: generation.id,
          label: ref.label ?? generation.generatedTitle ?? 'Generated content',
        });
        continue;
      }

      if (ref.sourceType === 'input_asset') {
        if (!ref.contentAssetId) {
          throw new BadRequestException(`sourceReferences[${index}].contentAssetId is required`);
        }
        const asset = await this.repository.findSourceContentAsset({
          organizationId: input.organizationId,
          contentAssetId: ref.contentAssetId,
        });
        if (!asset) throw new NotFoundException('Input asset source not found');
        out.push({
          sourceType: 'input_asset',
          contentAssetId: asset.id,
          label: ref.label ?? asset.label ?? asset.role ?? 'Input asset',
        });
      }
    }
    return out;
  }

  private storedGenerationMode(rawInput: unknown): 'draft' | 'image' | 'full' {
    if (!rawInput || typeof rawInput !== 'object') return 'full';
    const value = (rawInput as Record<string, unknown>).generationMode;
    if (value === 'draft' || value === 'image') return value;
    return 'full';
  }

  async cancel(id: string, organizationId: string): Promise<DetailPageGenerationDto> {
    const result = await this.cancelForOperation({
      organizationId,
      generationId: id,
      actorUserId: null,
      reason: DETAIL_PAGE_CANCELLED_MESSAGE,
    });
    if (result.status === 'not_found') {
      throw new NotFoundException('Detail page generation not found');
    }
    return this.query.getById(id, organizationId);
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
    const row = await this.repository.findCancellableGeneration({
      organizationId: input.organizationId,
      generationId: input.generationId,
    });
    if (!row) {
      return {
        status: 'not_found',
        generationId: input.generationId,
        operationKey: null,
        preserved: false,
      };
    }

    if (DETAIL_PAGE_TERMINAL_STATUSES.has(row.status)) {
      return {
        status: 'already_terminal',
        generationId: row.id,
        operationKey: detailPageOperationKey(row.id),
        preserved: row.status === 'READY' || row.status === 'completed',
      };
    }

    await this.directGenerationJobs.cancelByGeneration({
      organizationId: input.organizationId,
      generationId: row.id,
      reason: input.reason,
    });
    const updated = await this.repository.cancelProcessingGeneration({
      organizationId: input.organizationId,
      generationId: row.id,
      processingStatuses: DETAIL_PAGE_PROCESSING_STATUSES,
      reason: input.reason,
      generationResult: {
        ...asPlainRecord(row.generationResult),
        operationCancellation: operationCancellationAudit({
          requestedByUserId: input.actorUserId,
          reason: input.reason,
          target: { targetType: 'content_generation', generationId: row.id },
          affected: { contentGenerationIds: [row.id] },
          result: 'cancelled',
        }),
      },
    });

    if (updated === 0) {
      return {
        status: 'already_terminal',
        generationId: row.id,
        operationKey: detailPageOperationKey(row.id),
        preserved: false,
      };
    }

    await this.operationAlerts.cancel(input.organizationId, detailPageOperationKey(row.id), {
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
    const parentLink = readProductGenerationAlertLink(row.generationInput);
    if (parentLink && input.notifyProductGenerationParent !== false) {
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
      operationKey: detailPageOperationKey(row.id),
      preserved: false,
    };
  }

  private normalizeTemplateId(value: string | null): DetailPageTemplateId {
    return value === 'bold-vertical' ? 'bold-vertical' : 'kids-playful';
  }

  private extForMime(mimeType: string): string {
    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'image/webp') return 'webp';
    return 'jpg';
  }

  private async detectUploadedImageRole(buffer: Buffer): Promise<'product' | 'safety-label'> {
    try {
      return await looksLikeSafetyLabelImage(buffer) ? 'safety-label' : 'product';
    } catch {
      return 'product';
    }
  }

  private async trimSafetyLabelImage(buffer: Buffer): Promise<Buffer> {
    try {
      return await trimSafetyLabelWhitespace(buffer);
    } catch (error) {
      this.logger.warn(`Failed to trim safety label image whitespace: ${error instanceof Error ? error.message : String(error)}`);
      return buffer;
    }
  }
}

function pickRawString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickDetailImageCount(value: unknown): DetailImageCount {
  if (value === '1' || value === '2' || value === '3' || value === 'auto') return value;
  return '2';
}

function pickKcCertificationStatus(value: unknown): KcCertificationStatus {
  if (value === 'none' || value === 'exists') return value;
  return 'unknown';
}

function isDetailPageSourceReference(value: unknown): value is DetailPageSourceReference {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    record.sourceType === 'sourcing_candidate' ||
    record.sourceType === 'input_asset' ||
    record.sourceType === 'content_generation'
  );
}

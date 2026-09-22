import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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
import type { ProductGenerationChildIdentity } from './product-generation-child-identity';
import { DetailPageQueryService } from './detail-page-query.service';
import {
  toDetailPageStoredJson,
} from './detail-page-stored.helpers';
import {
  ContentWorkspaceService,
} from './content-workspace.service';
import {
  DETAIL_PAGE_GENERATION_REPOSITORY_PORT,
  type DetailPageGenerationRepositoryPort,
} from '../port/out/repository/detail-page-generation.repository.port';
import { DetailPageDirectGenerationJobService } from './detail-page-direct-generation-job.service';
import { resolveAiDirectJobModels } from './ai-direct-job.config';

const DETAIL_PAGE_CANCELLED_MESSAGE = '사용자 요청으로 생성이 중단되었습니다.';
const DETAIL_PAGE_IMAGE_REQUIRED_MESSAGE = '상세페이지 생성에는 상품 이미지가 최소 1장 필요합니다.';

@Injectable()
export class DetailPageGenerationService {
  private readonly logger = new Logger(DetailPageGenerationService.name);

  constructor(
    @Inject(DETAIL_PAGE_GENERATION_REPOSITORY_PORT)
    private readonly repository: DetailPageGenerationRepositoryPort,
    @Inject(IMAGE_STORAGE_PORT)
    private readonly imageStorage: ImageStoragePort,
    private readonly query: DetailPageQueryService,
    private readonly directGenerationJobs: DetailPageDirectGenerationJobService,
    private readonly contentWorkspaces: ContentWorkspaceService,
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
    productGenerationIdentity?: ProductGenerationChildIdentity,
  ): Promise<DetailPageGenerationDto> {
    const heroImageMode = dto.heroImageMode ?? 'llm-pick';
    // 안 고르면 KIDITEM DESIGN 이다 — 화면 기본값 · 상품 생성 기본값과 같다(사장님 2026-09-20).
    const templateId = dto.templateId ?? 'bold-vertical';
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
      ...(productGenerationIdentity
        ? { productGenerationRequestHash: productGenerationIdentity.requestHash }
        : {}),
    };
    const requestedContentWorkspace = dto.contentWorkspaceId
      ? await this.resolveContentWorkspace(organizationId, dto.contentWorkspaceId)
      : null;
    const sourceReferences = await this.normalizeSourceReferences({
      organizationId,
      sourceReferences: dto.sourceReferences ?? [],
    });
    if (sourceReferences.length > 0) rawInput.sourceReferences = sourceReferences;
    const contentWorkspace = requestedContentWorkspace ??
      await this.contentWorkspaces.ensureForGeneration({
        organizationId,
        triggeredByUserId,
        rawTitle: dto.rawTitle,
        salesProductId: null,
      });
    const imageOnlyBase = generationMode === 'image'
      ? await this.findImageOnlyBaseGeneration({
        organizationId,
        contentWorkspaceId: contentWorkspace.id,
        templateId,
      })
      : null;
    if (generationMode === 'image') {
      if (!imageOnlyBase) {
        throw new BadRequestException('이미지만 생성하려면 먼저 같은 작업공간/템플릿의 카피 생성 결과가 필요합니다.');
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
      existingResult: imageOnlyBase?.result,
      contentWorkspaceId: contentWorkspace.id,
      productGenerationIdentity,
    });
  }

  private async resolveContentWorkspace(
    organizationId: string,
    contentWorkspaceId: string,
  ): Promise<{
    id: string;
    salesProductId: string | null;
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
    existingResult?: unknown;
    generationGroupId?: string | null;
    contentWorkspaceId: string;
    productGenerationIdentity?: ProductGenerationChildIdentity;
  }): Promise<DetailPageGenerationDto> {
    const models = resolveAiDirectJobModels('detail_page_generate');
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
      triggeredByUserId: input.triggeredByUserId,
      templateId: input.templateId,
      rawInput: input.rawInput,
      imageUrls: input.imageUrls,
      rawTitle: input.rawTitle,
      sourceReferences: input.sourceReferences,
      productGenerationIdentity: input.productGenerationIdentity,
      directJob,
    });
    const row = opened.row;

    if (opened.releaseRequired) {
      await this.directGenerationJobs.release({
        organizationId: input.organizationId,
        jobId: opened.directJobId,
      });
    }

    return this.query.getById(row.id, input.organizationId);
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
      generationGroupId,
      contentWorkspaceId,
    });
  }

  private async findImageOnlyBaseGeneration(input: {
    organizationId: string;
    contentWorkspaceId: string;
    templateId: DetailPageTemplateId;
  }): Promise<{ id: string; result: unknown } | null> {
    const rows = await this.repository.findImageOnlyBaseCandidates({
      organizationId: input.organizationId,
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
        // Provenance only. Sourcing rows are another owner's, so the id is
        // recorded as given and the caller supplies the human label.
        out.push({
          sourceType: 'sourcing_candidate',
          sourceCandidateId: ref.sourceCandidateId,
          label: ref.label ?? '수집 원천',
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
    const result = await this.cancelGeneration({
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
    return this.repository.cancelDirectGeneration({
      organizationId: input.organizationId,
      generationId: input.generationId,
      reason: input.reason,
    });
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

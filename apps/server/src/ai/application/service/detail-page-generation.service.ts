import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { OperationAlertService } from '../../../automation/application/service/operation-alert.service';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
} from '../../../agent-os/application/port/in/agent-runner.port';
import {
  AI_AGENT_SOURCE_TYPES,
  DETAIL_PAGE_GENERATE_AGENT_TYPE,
} from '../../domain/agent-output';
import type { GenerateDetailPageBodyDto } from '../../adapter/in/http/dto';
import {
  IMAGE_STORAGE_PORT,
  type ImageStoragePort,
} from '../port/out/image-storage.port';
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
  detailPageOperationKey,
  toDetailPageStoredJson,
} from './detail-page-stored.helpers';
import { ContentAssetService } from './content-asset.service';
import type { PersistedContentAssetRef } from './content-asset.service';
import { kickEnqueuedAgentRequest as kickInlineAgentRequest } from './agent-inline-execution';
import { GeneratedContentCandidateService } from './generated-content-candidate.service';
import {
  registeredWorkspaceEditorHref,
  RegistrationWorkspaceService,
} from './registration-workspace.service';

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
const DETAIL_PAGE_IMAGE_REQUIRED_MESSAGE = '상세페이지 생성에는 상품 이미지가 최소 1장 필요합니다.';

@Injectable()
export class DetailPageGenerationService {
  private readonly logger = new Logger(DetailPageGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(IMAGE_STORAGE_PORT)
    private readonly imageStorage: ImageStoragePort,
    private readonly operationAlerts: OperationAlertService,
    private readonly query: DetailPageQueryService,
    @Inject(AGENT_RUNNER_PORT)
    private readonly agentRunner: AgentRunnerPort,
    private readonly contentAssets: ContentAssetService,
    private readonly generatedCandidates: GeneratedContentCandidateService,
    private readonly registrationWorkspaces: RegistrationWorkspaceService,
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
    dto: GenerateDetailPageBodyDto,
    organizationId: string,
    triggeredByUserId: string | null,
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
    const requestedRegistrationWorkspace = dto.registrationWorkspaceId
      ? await this.resolveRegistrationWorkspace(organizationId, dto.registrationWorkspaceId)
      : null;
    const effectiveProductId = dto.productId ?? requestedRegistrationWorkspace?.targetMasterId ?? null;
    let sourceReferences = await this.normalizeSourceReferences({
      organizationId,
      productId: effectiveProductId,
      sourceReferences: dto.sourceReferences ?? [],
    });
    let primarySourceCandidateId =
      requestedRegistrationWorkspace?.sourceCandidateId ??
      sourceReferences.find((ref) => ref.sourceType === 'sourcing_candidate')
        ?.sourceCandidateId ?? null;
    if (
      requestedRegistrationWorkspace?.sourceCandidateId &&
      !sourceReferences.some((ref) => ref.sourceCandidateId === requestedRegistrationWorkspace.sourceCandidateId)
    ) {
      sourceReferences = [
        {
          sourceType: 'sourcing_candidate',
          sourceCandidateId: requestedRegistrationWorkspace.sourceCandidateId,
          label: requestedRegistrationWorkspace.displayName,
        },
        ...sourceReferences,
      ];
    }
    if (sourceReferences.length > 0) rawInput.sourceReferences = sourceReferences;
    const registrationWorkspace = requestedRegistrationWorkspace ??
      await this.registrationWorkspaces.ensureForGeneration({
        organizationId,
        triggeredByUserId,
        rawTitle: dto.rawTitle,
        sourceCandidateId: primarySourceCandidateId,
        targetMasterId: effectiveProductId,
      });
    const imageOnlyBase = generationMode === 'image'
      ? await this.findImageOnlyBaseGeneration({
        organizationId,
        productId: effectiveProductId,
        sourceCandidateId: primarySourceCandidateId,
        registrationWorkspaceId: registrationWorkspace.id,
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
      productId: effectiveProductId,
      rawTitle: dto.rawTitle,
      templateId,
      heroImageMode,
      imageUrls,
      rawInput,
      sourceReferences,
      sourceCandidateId: primarySourceCandidateId,
      existingResult: imageOnlyBase?.result,
      registrationWorkspaceId: registrationWorkspace.id,
    });
  }

  private async resolveRegistrationWorkspace(
    organizationId: string,
    registrationWorkspaceId: string,
  ): Promise<{
    id: string;
    sourceCandidateId: string | null;
    targetMasterId: string | null;
    displayName: string;
    normalizedTitle: string;
  }> {
    const row = await this.prisma.registrationWorkspace.findFirst({
      where: {
        id: registrationWorkspaceId,
        organizationId,
        status: 'active',
        isDeleted: false,
      },
      select: {
        id: true,
        sourceCandidateId: true,
        targetMasterId: true,
        displayName: true,
        normalizedTitle: true,
      },
    });
    if (!row) throw new NotFoundException('Registration workspace not found');
    return row;
  }

  private async enqueueGeneration(input: {
    organizationId: string;
    triggeredByUserId: string | null;
    productId: string | null;
    rawTitle: string;
    templateId: DetailPageTemplateId;
    heroImageMode: 'first' | 'llm-pick';
    imageUrls: string[];
    rawInput: DetailPageRawInput;
    sourceReferences: DetailPageSourceReference[];
    sourceCandidateId: string | null;
    existingResult?: unknown;
    generationGroupId?: string | null;
    registrationWorkspaceId: string;
  }): Promise<DetailPageGenerationDto> {
    const targetMaster = input.productId
      ? await this.prisma.masterProduct.findFirst({
        where: { id: input.productId, organizationId: input.organizationId, isDeleted: false },
        select: { id: true, name: true },
      })
      : null;
    if (input.productId && !targetMaster) throw new NotFoundException('Product not found');

    const generationGroupId = input.generationGroupId ??
      (targetMaster
        ? await this.ensureProductWorkspaceGroup({
          organizationId: input.organizationId,
          productId: targetMaster.id,
          title: targetMaster.name,
          triggeredByUserId: input.triggeredByUserId,
        })
        : await this.createGenerationGroupForInput({
          organizationId: input.organizationId,
          triggeredByUserId: input.triggeredByUserId,
          rawTitle: input.rawTitle,
          templateId: input.templateId,
        }));
    const primarySourceCandidateId =
      input.sourceCandidateId ??
      input.sourceReferences.find((ref) => ref.sourceType === 'sourcing_candidate')
        ?.sourceCandidateId ?? null;

    const row = await this.prisma.contentGeneration.create({
      data: {
        organizationId: input.organizationId,
        contentType: 'detail_page',
        generationGroupId,
        registrationWorkspaceId: input.registrationWorkspaceId,
        sourceCandidateId: primarySourceCandidateId,
        triggeredByUserId: input.triggeredByUserId,
        templateId: input.templateId,
        generationInput: input.rawInput as unknown as Prisma.InputJsonValue,
        generationResult: {
          templateId: input.templateId,
          result: {},
          imageUrls: input.imageUrls,
          processedImages: {},
        },
        generatedTitle: input.rawTitle.slice(0, 80),
        status: 'PROCESSING',
      },
      include: {
        generationGroup: {
          select: { targetMasterId: true },
        },
      },
    });

    const inputAssets = await this.contentAssets.recordDetailPageInputAssets({
      organizationId: input.organizationId,
      generationGroupId,
      createdByUserId: input.triggeredByUserId,
      imageUrls: input.imageUrls,
    });
    await this.recordGenerationSources({
      organizationId: input.organizationId,
      contentGenerationId: row.id,
      sourceReferences: input.sourceReferences,
      inputAssets,
    });

    await this.operationAlerts.start({
      organizationId: input.organizationId,
      operationKey: detailPageOperationKey(row.id),
      type: 'detail_page_generation',
      title: `상세페이지 생성: ${input.rawTitle.slice(0, 40)}`,
      sourceType: 'content_generation',
      sourceId: row.id,
      actorUserId: input.triggeredByUserId,
      targetType: 'registration_workspace',
      targetId: input.registrationWorkspaceId,
      href: registeredWorkspaceEditorHref(input.registrationWorkspaceId, row.id),
      metadata: {
        templateId: input.templateId,
        imageCount: input.imageUrls.length,
        sourceCandidateId: primarySourceCandidateId,
      },
    });

    const enqueueResult = await this.agentRunner.runByType(
      DETAIL_PAGE_GENERATE_AGENT_TYPE,
      {
        organizationId: input.organizationId,
        requestedByUserId: input.triggeredByUserId ?? undefined,
        sourceType: AI_AGENT_SOURCE_TYPES.DETAIL_PAGE_GENERATE,
        sourceResourceType: 'content_generation',
        sourceResourceId: row.id,
        reason: input.productId
          ? `detail_page_generate for product ${input.productId}`
          : primarySourceCandidateId
            ? `detail_page_generate for sourcing candidate ${primarySourceCandidateId}`
            : `detail_page_generate for registration workspace ${input.registrationWorkspaceId}`,
        payload: {
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
        },
      },
    );

    if (!enqueueResult.ok) {
      const errorMessage = enqueueResult.reason
        ? `Agent OS enqueue failed: ${enqueueResult.reason}`
        : 'Agent OS enqueue failed.';
      await this.prisma.contentGeneration.updateMany({
        where: { id: row.id, organizationId: input.organizationId },
        data: { status: 'FAILED', errorMessage },
      });
      await this.operationAlerts.fail(
        input.organizationId,
        detailPageOperationKey(row.id),
        {
          message: errorMessage,
          metadata: {
            errorCode: 'agent_enqueue_failed',
            agentReason: enqueueResult.reason ?? null,
          },
        },
      );
      throw new HttpException(errorMessage, HttpStatus.SERVICE_UNAVAILABLE);
    }

    this.kickEnqueuedAgentRequest({
      organizationId: input.organizationId,
      requestId: enqueueResult.requestId,
    });

    return this.query.getById(row.id, input.organizationId);
  }

  async rerunSameInput(
    generationId: string,
    organizationId: string,
    triggeredByUserId: string | null,
  ): Promise<DetailPageGenerationDto> {
    const base = await this.prisma.contentGeneration.findFirst({
      where: { id: generationId, organizationId },
      select: {
        id: true,
        generationGroupId: true,
        registrationWorkspaceId: true,
        sourceCandidateId: true,
        generationInput: true,
        generationResult: true,
        generationGroup: { select: { targetMasterId: true } },
        templateId: true,
        generatedTitle: true,
      },
    });
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
      productId: base.generationGroup.targetMasterId,
      title: pickRawString(rawRecord, 'rawTitle') ?? base.generatedTitle ?? '상세페이지 작업',
      triggeredByUserId,
    });
    const registrationWorkspaceId = base.registrationWorkspaceId ??
      (await this.registrationWorkspaces.ensureForGeneration({
        organizationId,
        triggeredByUserId,
        rawTitle: pickRawString(rawRecord, 'rawTitle') ?? base.generatedTitle ?? '상세페이지 작업',
        sourceCandidateId: base.sourceCandidateId,
        targetMasterId: base.generationGroup.targetMasterId,
      })).id;
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
      productId: base.generationGroup.targetMasterId,
      rawTitle: rawInput.rawTitle,
      templateId,
      heroImageMode: rawInput.heroImageMode,
      imageUrls,
      rawInput,
      sourceReferences: rawInput.sourceReferences ?? [],
      sourceCandidateId: base.sourceCandidateId,
      generationGroupId,
      registrationWorkspaceId,
    });
  }

  private async findImageOnlyBaseGeneration(input: {
    organizationId: string;
    productId: string | null;
    sourceCandidateId: string | null;
    registrationWorkspaceId: string | null;
    templateId: DetailPageTemplateId;
  }): Promise<{ id: string; result: unknown } | null> {
    const sourceCandidateId = input.sourceCandidateId;
    if (!input.productId && !sourceCandidateId && !input.registrationWorkspaceId) return null;
    const where: Prisma.ContentGenerationWhereInput = {
      organizationId: input.organizationId,
      contentType: 'detail_page',
      templateId: input.templateId,
      status: { in: ['READY', 'completed'] },
      ...(input.productId
        ? { generationGroup: { targetMasterId: input.productId } }
        : input.registrationWorkspaceId
          ? { registrationWorkspaceId: input.registrationWorkspaceId }
        : {
            OR: [
              { sourceCandidateId },
              { sources: { some: { sourceCandidateId } } },
              { detailPageArtifact: { is: { sourceCandidateId } } },
            ],
          }),
    };
    const rows = await this.prisma.contentGeneration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        generationInput: true,
        generationResult: true,
        templateId: true,
        generatedTitle: true,
      },
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

  private async createGenerationGroupForInput(input: {
    organizationId: string;
    triggeredByUserId: string | null;
    rawTitle: string;
    templateId: DetailPageTemplateId;
  }): Promise<string> {
    const group = await this.prisma.contentGenerationGroup.create({
      data: {
        organizationId: input.organizationId,
        groupType: 'input_variation',
        title: input.rawTitle.slice(0, 80),
        createdByUserId: input.triggeredByUserId,
        metadata: {
          source: 'detail_page_generation',
          templateId: input.templateId,
        },
      },
      select: { id: true },
    });
    return group.id;
  }

  private async ensureProductWorkspaceGroup(input: {
    organizationId: string;
    productId: string;
    title: string;
    triggeredByUserId: string | null;
  }): Promise<string> {
    const existing = await this.prisma.contentGenerationGroup.findFirst({
      where: {
        organizationId: input.organizationId,
        groupType: 'product_workspace',
        targetMasterId: input.productId,
      },
      select: { id: true },
    });
    if (existing) return existing.id;

    try {
      const group = await this.prisma.contentGenerationGroup.create({
        data: {
          organizationId: input.organizationId,
          groupType: 'product_workspace',
          targetMasterId: input.productId,
          title: input.title.slice(0, 80),
          createdByUserId: input.triggeredByUserId,
          metadata: { source: 'product_workspace' },
        },
        select: { id: true },
      });
      return group.id;
    } catch (error) {
      const raced = await this.prisma.contentGenerationGroup.findFirst({
        where: {
          organizationId: input.organizationId,
          groupType: 'product_workspace',
          targetMasterId: input.productId,
        },
        select: { id: true },
      });
      if (raced) return raced.id;
      throw error;
    }
  }

  private async ensureGenerationGroup(input: {
    organizationId: string;
    baseGenerationId: string;
    existingGroupId: string | null;
    productId: string | null;
    title: string;
    triggeredByUserId: string | null;
  }): Promise<string> {
    if (input.existingGroupId) return input.existingGroupId;
    const group = await this.prisma.contentGenerationGroup.create({
      data: {
        organizationId: input.organizationId,
        groupType: 'input_variation',
        targetMasterId: input.productId,
        baseContentGenerationId: input.baseGenerationId,
        title: input.title.slice(0, 80),
        createdByUserId: input.triggeredByUserId,
        metadata: { source: 'same_input_rerun' },
      },
      select: { id: true },
    });
    await this.prisma.contentGeneration.updateMany({
      where: { id: input.baseGenerationId, organizationId: input.organizationId },
      data: { generationGroupId: group.id },
    });
    return group.id;
  }

  private async normalizeSourceReferences(input: {
    organizationId: string;
    productId: string | null;
    sourceReferences: NonNullable<GenerateDetailPageBodyDto['sourceReferences']>;
  }): Promise<DetailPageSourceReference[]> {
    const out: DetailPageSourceReference[] = [];
    for (const [index, ref] of input.sourceReferences.entries()) {
      if (ref.sourceType === 'sourcing_candidate') {
        if (!ref.sourceCandidateId) {
          throw new BadRequestException(`sourceReferences[${index}].sourceCandidateId is required`);
        }
        const candidate = await this.prisma.sourcingCandidate.findFirst({
          where: {
            id: ref.sourceCandidateId,
            organizationId: input.organizationId,
            isDeleted: false,
          },
          select: { id: true, name: true, promotedMasterId: true },
        });
        if (!candidate) throw new NotFoundException('Sourcing candidate source not found');
        if (
          input.productId &&
          candidate.promotedMasterId &&
          candidate.promotedMasterId !== input.productId
        ) {
          throw new BadRequestException('source candidate is linked to a different product');
        }
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
        const generation = await this.prisma.contentGeneration.findFirst({
          where: { id: ref.sourceContentGenerationId, organizationId: input.organizationId },
          select: { id: true, generatedTitle: true },
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
        const asset = await this.prisma.contentAsset.findFirst({
          where: {
            id: ref.contentAssetId,
            organizationId: input.organizationId,
            isDeleted: false,
          },
          select: { id: true, label: true, role: true },
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

  private async recordGenerationSources(input: {
    organizationId: string;
    contentGenerationId: string;
    sourceReferences: DetailPageSourceReference[];
    inputAssets: PersistedContentAssetRef[];
  }): Promise<void> {
    const explicitRows = input.sourceReferences.map((ref, index) => ({
      organizationId: input.organizationId,
      contentGenerationId: input.contentGenerationId,
      sourceType: ref.sourceType,
      sourceCandidateId: ref.sourceCandidateId ?? null,
      sourceContentGenerationId: ref.sourceContentGenerationId ?? null,
      contentAssetId: ref.contentAssetId ?? null,
      label: ref.label ?? null,
      sortOrder: index,
      metadata: {},
    }));
    const inputAssetRows = input.inputAssets.map((asset, index) => ({
      organizationId: input.organizationId,
      contentGenerationId: input.contentGenerationId,
      sourceType: 'input_asset',
      sourceCandidateId: null,
      sourceContentGenerationId: null,
      contentAssetId: asset.id,
      label: asset.label ?? asset.role ?? 'Input asset',
      sortOrder: explicitRows.length + index,
      metadata: { assetKey: asset.assetKey },
    }));
    const rows = [...explicitRows, ...inputAssetRows];
    if (rows.length === 0) return;
    await this.prisma.contentGenerationSource.createMany({
      skipDuplicates: true,
      data: rows,
    });
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
      workerId: 'detail-page-generate-inline',
      logger: this.logger,
      label: 'detail_page_generate',
    });
  }

  private storedGenerationMode(rawInput: unknown): 'draft' | 'image' | 'full' {
    if (!rawInput || typeof rawInput !== 'object') return 'full';
    const value = (rawInput as Record<string, unknown>).generationMode;
    if (value === 'draft' || value === 'image') return value;
    return 'full';
  }

  async cancel(id: string, organizationId: string): Promise<DetailPageGenerationDto> {
    const row = await this.prisma.contentGeneration.findFirst({
      where: { id, organizationId },
    });
    if (!row) throw new NotFoundException('Detail page generation not found');

    if (DETAIL_PAGE_TERMINAL_STATUSES.has(row.status)) {
      return this.query.getById(id, organizationId);
    }

    const updated = await this.prisma.contentGeneration.updateMany({
      where: {
        id,
        organizationId,
        status: { in: DETAIL_PAGE_PROCESSING_STATUSES },
      },
      data: {
        status: 'CANCELLED',
        errorMessage: DETAIL_PAGE_CANCELLED_MESSAGE,
      },
    });

    if (updated.count > 0) {
      await this.agentRunner.cancelBySource?.({
        organizationId,
        sourceType: AI_AGENT_SOURCE_TYPES.DETAIL_PAGE_GENERATE,
        sourceResourceType: 'content_generation',
        sourceResourceId: id,
        reason: DETAIL_PAGE_CANCELLED_MESSAGE,
      });

      await this.operationAlerts.cancel(organizationId, detailPageOperationKey(id), {
        message: DETAIL_PAGE_CANCELLED_MESSAGE,
        metadata: { errorCode: 'user_cancelled' },
      });
    }

    return this.query.getById(id, organizationId);
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

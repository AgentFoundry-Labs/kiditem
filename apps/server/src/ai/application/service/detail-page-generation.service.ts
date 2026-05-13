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
import { PrismaService } from '../../../prisma/prisma.service';
import { OperationAlertService } from '../../../automation/application/service/operation-alert.service';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
} from '../../../agent-os/application/port/in/agent-runner.port';
import {
  DetailPageGenerationSchema,
  SINGLE_CALL_SYSTEM,
  buildSingleCallUser,
  type DetailPageGeneration,
} from '../../domain/prompts/detail-page/single-call';
import {
  BoldVerticalGenerationSchema,
  BOLD_VERTICAL_SYSTEM,
  buildBoldVerticalUser,
  type BoldVerticalGeneration,
} from '../../domain/prompts/bold-vertical/single-call';
import {
  AI_AGENT_SOURCE_TYPES,
  DETAIL_PAGE_GENERATE_AGENT_TYPE,
} from '../../domain/agent-output';
import type { GenerateDetailPageBodyDto } from '../../adapter/in/http/dto';
import {
  TEXT_COMPLETION_PORT,
  type TextCompletionPort,
} from '../port/out/text-completion.port';
import {
  IMAGE_STORAGE_PORT,
  type ImageStoragePort,
} from '../port/out/image-storage.port';
import type { MulterFile } from '../../../common/types';
import {
  looksLikeSafetyLabelImage,
  moveSafetyLabelImagesToEnd,
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
  DetailPageTemplateId,
  KidsPlayfulImageContext,
} from './detail-page-ai.types';
import { DetailPageGeneratedImagesService } from './detail-page-generated-images.service';
import { DetailPageQueryService } from './detail-page-query.service';
import { DetailPageResultRefinerService } from './detail-page-result-refiner.service';
import {
  detailPageOperationKey,
  detailPageResultHref,
  serializeDetailPageStoredJson,
} from './detail-page-stored.helpers';

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
    @Inject(TEXT_COMPLETION_PORT)
    private readonly textCompletion: TextCompletionPort,
    @Inject(IMAGE_STORAGE_PORT)
    private readonly imageStorage: ImageStoragePort,
    private readonly operationAlerts: OperationAlertService,
    private readonly resultRefiner: DetailPageResultRefinerService,
    private readonly generatedImages: DetailPageGeneratedImagesService,
    private readonly query: DetailPageQueryService,
    @Inject(AGENT_RUNNER_PORT)
    private readonly agentRunner: AgentRunnerPort,
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
    const url = await this.imageStorage.save(
      `detail-page-inputs/${organizationId}/${fileRole}-${randomUUID()}.${ext}`,
      file.buffer,
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
      ageGroup,
      detailImageCount,
      usageSectionMode,
      kcCertificationStatus,
      kcCertificationNumber,
    };

    if (dto.productId) {
      return this.enqueueProductBoundGeneration({
        organizationId,
        triggeredByUserId,
        productId: dto.productId,
        rawTitle: dto.rawTitle,
        templateId,
        heroImageMode,
        imageUrls,
        rawInput,
      });
    }

    const model = process.env.AI_TEXT_MODEL;
    if (!model) {
      throw new HttpException(
        'AI_TEXT_MODEL이 설정되지 않았습니다.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    const isBoldVertical = templateId === 'bold-vertical';
    const kidsImageContext = await this.resultRefiner.prepareKidsPlayfulImageContext({
      templateId,
      rawInput,
    });
    const excludedImageIndices = [
      ...kidsImageContext.packageImageIndices,
      ...kidsImageContext.safetyLabelImageIndices,
    ];
    const parsed = await this.generateParsed({
      rawInput,
      heroImageMode,
      templateId,
      model,
      isBoldVertical,
      kidsImageContext,
    });
    const productName = this.pickProductName(parsed, templateId, dto.rawTitle);
    const processedImages = await this.generatedImages.generateBestEffort({
      organizationId,
      parsed,
      templateId,
      rawInput,
      productName,
      excludedImageIndices,
    });

    return {
      id: `standalone-${randomUUID()}`,
      productId: null,
      templateId,
      productName,
      rawInput,
      result: parsed,
      imageUrls,
      processedImages,
      imageProcessingStatus: 'completed',
      imageProcessingError: null,
      createdAt: new Date().toISOString(),
    };
  }

  private async enqueueProductBoundGeneration(input: {
    organizationId: string;
    triggeredByUserId: string | null;
    productId: string;
    rawTitle: string;
    templateId: DetailPageTemplateId;
    heroImageMode: 'first' | 'llm-pick';
    imageUrls: string[];
    rawInput: DetailPageRawInput;
  }): Promise<DetailPageGenerationDto> {
    const master = await this.prisma.masterProduct.findFirst({
      where: { id: input.productId, organizationId: input.organizationId, isDeleted: false },
      select: { id: true },
    });
    if (!master) throw new NotFoundException('Product not found');

    const row = await this.prisma.contentGeneration.create({
      data: {
        organizationId: input.organizationId,
        masterId: input.productId,
        triggeredByUserId: input.triggeredByUserId,
        originalImages: input.imageUrls,
        processedImages: {},
        generatedTitle: input.rawTitle.slice(0, 80),
        detailPageHtml: serializeDetailPageStoredJson({
          templateId: input.templateId,
          result: {},
          imageUrls: input.imageUrls,
          rawInput: input.rawInput,
        }),
        status: 'PROCESSING',
      },
    });

    await this.operationAlerts.start({
      organizationId: input.organizationId,
      operationKey: detailPageOperationKey(row.id),
      type: 'detail_page_generation',
      title: `상세페이지 생성: ${input.rawTitle.slice(0, 40)}`,
      sourceType: 'content_generation',
      sourceId: row.id,
      actorUserId: input.triggeredByUserId,
      targetType: 'master',
      targetId: input.productId,
      href: detailPageResultHref({
        productId: input.productId,
        contentGenerationId: row.id,
        templateId: input.templateId,
      }),
      metadata: { templateId: input.templateId, imageCount: input.imageUrls.length },
    });

    const enqueueResult = await this.agentRunner.runByType(
      DETAIL_PAGE_GENERATE_AGENT_TYPE,
      {
        organizationId: input.organizationId,
        requestedByUserId: input.triggeredByUserId ?? undefined,
        sourceType: AI_AGENT_SOURCE_TYPES.DETAIL_PAGE_GENERATE,
        sourceResourceType: 'content_generation',
        sourceResourceId: row.id,
        reason: `detail_page_generate for product ${input.productId}`,
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

    return this.query.toDto({
      id: row.id,
      masterId: row.masterId,
      originalImages: row.originalImages,
      processedImages: {},
      generatedTitle: row.generatedTitle,
      detailPageHtml: row.detailPageHtml,
      status: 'PROCESSING',
      errorMessage: null,
      createdAt: row.createdAt,
    });
  }

  private kickEnqueuedAgentRequest(input: {
    organizationId: string;
    requestId?: string;
  }): void {
    if (!input.requestId || !this.agentRunner.executeRequest) return;

    void this.agentRunner.executeRequest({
      organizationId: input.organizationId,
      requestId: input.requestId,
      workerId: 'detail-page-generate-inline',
    }).catch((error) => {
      this.logger.warn(
        `Failed to kick detail_page_generate request ${input.requestId}: ${error}`,
      );
    });
  }

  async cancel(id: string, organizationId: string): Promise<DetailPageGenerationDto> {
    const row = await this.prisma.contentGeneration.findFirst({
      where: { id, organizationId },
    });
    if (!row) throw new NotFoundException('Detail page generation not found');

    if (DETAIL_PAGE_TERMINAL_STATUSES.has(row.status)) {
      return this.query.toDto(row);
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

    const reloaded = await this.prisma.contentGeneration.findFirst({
      where: { id, organizationId },
    });
    return this.query.toDto(reloaded ?? row);
  }

  private pickProductName(
    parsed: unknown,
    templateId: DetailPageTemplateId,
    fallback: string,
  ): string {
    if (templateId === 'bold-vertical') {
      const hookText = (parsed as { hook?: { text?: unknown } }).hook?.text;
      const hookTitleSub = (parsed as { hook?: { titleSub?: unknown } }).hook?.titleSub;
      const title = [
        typeof hookText === 'string' ? hookText.trim() : '',
        typeof hookTitleSub === 'string' ? hookTitleSub.trim() : '',
      ].filter(Boolean).join(' ');
      return title || fallback.slice(0, 50);
    }
    const headline = (parsed as { section1?: { mainHeadline?: unknown } }).section1?.mainHeadline;
    return typeof headline === 'string' && headline.trim() ? headline.trim() : fallback.slice(0, 50);
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

  private async generateParsed(input: {
    rawInput: DetailPageRawInput;
    heroImageMode: 'first' | 'llm-pick';
    templateId: DetailPageTemplateId;
    model: string;
    isBoldVertical: boolean;
    kidsImageContext?: KidsPlayfulImageContext;
  }): Promise<DetailPageGeneration | BoldVerticalGeneration> {
    const { text: rawText } = await this.textCompletion.complete({
      system: input.isBoldVertical ? BOLD_VERTICAL_SYSTEM : SINGLE_CALL_SYSTEM,
      user: input.isBoldVertical
        ? buildBoldVerticalUser({ raw: input.rawInput, heroImageMode: input.heroImageMode })
        : buildSingleCallUser({
            raw: input.rawInput,
            heroImageMode: input.heroImageMode,
            reservedPackageImageIndices: [...(input.kidsImageContext?.packageImageIndices ?? [])],
            safetyLabelImageIndices: [...(input.kidsImageContext?.safetyLabelImageIndices ?? [])],
          }),
      temperature: 0.8,
      responseMimeType: 'application/json',
      model: input.model,
    });
    const parsed = (input.isBoldVertical ? BoldVerticalGenerationSchema : DetailPageGenerationSchema)
      .parse(this.extractJson(rawText));
    if (!input.isBoldVertical) {
      return this.resultRefiner.applyKidsPlayfulImageSelectionRules(
        parsed as DetailPageGeneration,
        input.rawInput,
        input.kidsImageContext,
      );
    }
    return this.resultRefiner.refineBoldVerticalGeneration(
      parsed as BoldVerticalGeneration,
      input.rawInput,
    );
  }

  private extractJson(raw: string): unknown {
    const trimmed = raw.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]+?)\n?```$/);
    const body = fenced ? fenced[1] : trimmed;
    return JSON.parse(body);
  }
}

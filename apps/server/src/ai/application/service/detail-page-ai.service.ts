import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service';
import { OperationAlertService } from '../../../automation/application/service/operation-alert.service';
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
import type {
  GenerateDetailPageBodyDto,
  PrefillDetailPageBodyDto,
} from '../../adapter/in/http/dto';
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
import type { DetailImageCount, DetailPageAgeGroup } from '../../domain/prompts/detail-page/types';
import type { DetailPageRawInput, DetailPageTemplateId, KidsPlayfulImageContext } from './detail-page-ai.types';
import { DetailPageGeneratedImagesService } from './detail-page-generated-images.service';
import { DetailPageResultRefinerService } from './detail-page-result-refiner.service';

const DetailPagePrefillSchema = z.object({
  category: z.string().min(1).max(80),
  target: z.string().min(1).max(80),
  features: z.array(z.string().min(2).max(160)).min(3).max(6),
  options: z.array(z.string().min(1).max(60)).min(0).max(10).default([]),
  extraNotes: z.string().max(400).optional().default(''),
});

const DETAIL_PAGE_PREFILL_SYSTEM = `너는 한국 키즈/생활 상품 상세페이지 기획자다.
상품명만 보고 상세페이지 생성 폼에 바로 넣을 수 있는 초안을 만든다.

# 출력
JSON 객체 1개만 출력한다. 코드펜스나 설명 문장은 금지.

# 필드
- category: 쇼핑몰 카테고리 경로. 예: "생활용품/리빙", "완구/놀이", "문구/학용품"
- target: 핵심 구매 타겟. 예: "부모 구매자", "초등학생", "선물 구매자"
- features: 상세페이지 특징 3~5개. 각 문장은 상품명에서 합리적으로 추론 가능한 장점만 쓴다.
- options: 색상/종류/구성 옵션 후보 0~10개. 상품명에서 명확하지 않으면 과하게 만들지 않는다.
- extraNotes: 안전/사용연령/구성품처럼 생성 시 참고할 짧은 메모. 없으면 빈 문자열.
- imageUrls 가 있으면 파일명/경로 힌트를 참고하되, 확인 불가능한 인증/효능은 만들지 않는다.

# 작성 톤
- 한국어로 자연스럽게 쓴다.
- 과장된 인증/효능/의학 표현은 금지한다.
- 키즈 상품이면 보호자 구매 관점과 아이 사용 장면을 함께 고려한다.`;

export interface DetailPagePrefillDto {
  category: string;
  target: string;
  features: string[];
  options: string[];
  description: string;
  extraNotes: string;
  estimatedSeconds: number;
}

export interface DetailPageGenerationDto {
  id: string;
  productId: string | null;
  templateId: DetailPageTemplateId;
  productName: string;
  rawInput: unknown;
  result: DetailPageGeneration | BoldVerticalGeneration | unknown;
  imageUrls: string[];
  processedImages: Record<string, string>;
  imageProcessingStatus: string;
  imageProcessingError: string | null;
  createdAt: string;
}

@Injectable()
export class DetailPageAiService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TEXT_COMPLETION_PORT)
    private readonly textCompletion: TextCompletionPort,
    @Inject(IMAGE_STORAGE_PORT)
    private readonly imageStorage: ImageStoragePort,
    private readonly operationAlerts: OperationAlertService,
    private readonly resultRefiner: DetailPageResultRefinerService,
    private readonly generatedImages: DetailPageGeneratedImagesService,
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

  async prefill(
    dto: PrefillDetailPageBodyDto,
    organizationId: string,
  ): Promise<DetailPagePrefillDto> {
    if (!organizationId) {
      throw new BadRequestException('organization context is required');
    }
    const model = process.env.AI_TEXT_MODEL;
    if (!model) {
      throw new HttpException(
        'AI_TEXT_MODEL이 설정되지 않았습니다.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const imageCount = dto.imageUrls?.length ?? 0;
    const { text } = await this.textCompletion.complete({
      system: DETAIL_PAGE_PREFILL_SYSTEM,
      user: JSON.stringify({
        productName: dto.rawTitle,
        imageCount,
        imageUrls: dto.imageUrls ?? [],
      }),
      temperature: 0.45,
      responseMimeType: 'application/json',
      model,
    });
    const parsed = DetailPagePrefillSchema.parse(this.extractJson(text));
    const features = parsed.features.map((item) => item.trim()).filter(Boolean).slice(0, 5);
    const options = parsed.options.map((item) => item.trim()).filter(Boolean).slice(0, 10);
    return {
      category: parsed.category.trim(),
      target: parsed.target.trim(),
      features,
      options,
      description: features.map((feature, index) => `${index + 1}. ${feature}`).join('\n'),
      extraNotes: parsed.extraNotes.trim(),
      estimatedSeconds: imageCount >= 5 ? 45 : 30,
    };
  }

  async generate(
    dto: GenerateDetailPageBodyDto,
    organizationId: string,
    triggeredByUserId: string | null,
  ): Promise<DetailPageGenerationDto> {
    const model = process.env.AI_TEXT_MODEL;
    if (!model) {
      throw new HttpException(
        'AI_TEXT_MODEL이 설정되지 않았습니다.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (dto.productId) {
      const master = await this.prisma.masterProduct.findFirst({
        where: { id: dto.productId, organizationId, isDeleted: false },
        select: { id: true },
      });
      if (!master) throw new NotFoundException('Product not found');
    }

    const heroImageMode = dto.heroImageMode ?? 'llm-pick';
    const templateId = dto.templateId ?? 'kids-playful';
    const ageGroup: DetailPageAgeGroup = dto.ageGroup ?? 'age-8-plus';
    const detailImageCount: DetailImageCount = dto.detailImageCount ?? 'auto';
    const imageUrls = moveSafetyLabelImagesToEnd(dto.imageUrls);
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
    };

    const isBoldVertical = templateId === 'bold-vertical';
    const kidsImageContext = await this.resultRefiner.prepareKidsPlayfulImageContext({
      templateId,
      rawInput,
    });
    const excludedImageIndices = [
      ...kidsImageContext.packageImageIndices,
      ...kidsImageContext.safetyLabelImageIndices,
    ];

    if (dto.productId) {
      const row = await this.prisma.contentGeneration.create({
        data: {
          organizationId,
          masterId: dto.productId,
          triggeredByUserId,
          originalImages: imageUrls,
          processedImages: {},
          generatedTitle: dto.rawTitle.slice(0, 80),
          detailPageHtml: JSON.stringify({
            templateId,
            result: {},
            imageUrls,
            rawInput,
          }),
          status: 'PROCESSING',
        },
      });

      // Operation alert: surface the running detail-page generation in the
      // dashboard notification ledger so the user can track progress.
      const operationKey = `detail-page:${row.id}`;
      await this.operationAlerts.start({
        organizationId,
        operationKey,
        type: 'detail_page_generation',
        title: `상세페이지 생성: ${dto.rawTitle.slice(0, 40)}`,
        sourceType: 'content_generation',
        sourceId: row.id,
        actorUserId: triggeredByUserId,
        targetType: 'master',
        targetId: dto.productId,
        href: `/product-hub/${dto.productId}`,
        metadata: { templateId, imageCount: imageUrls.length },
      });

      try {
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
        const detailPageHtml = JSON.stringify({
          templateId,
          result: parsed,
          imageUrls,
          rawInput,
        });
        await this.prisma.contentGeneration.updateMany({
          where: { id: row.id, organizationId },
          data: {
            generatedTitle: productName,
            detailPageHtml,
            processedImages,
            status: 'READY',
            errorMessage: null,
          },
        });

        await this.operationAlerts.succeed(organizationId, operationKey, {
          metadata: {
            generatedTitle: productName,
            heroImageCount: Object.keys(processedImages).length,
          },
        });

        return this.toDto({
          ...row,
          generatedTitle: productName,
          detailPageHtml,
          processedImages,
          status: 'READY',
          errorMessage: null,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '상세페이지 생성 실패';
        await this.prisma.contentGeneration.updateMany({
          where: { id: row.id, organizationId },
          data: {
            status: 'FAILED',
            errorMessage,
          },
        });
        await this.operationAlerts.fail(organizationId, operationKey, {
          message: errorMessage,
          metadata: { templateId },
        });
        throw err;
      }
    }

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

  async list(
    organizationId: string,
    productId?: string,
    templateId?: string,
  ): Promise<DetailPageGenerationDto[]> {
    if (templateId && templateId !== 'kids-playful' && templateId !== 'bold-vertical') {
      throw new BadRequestException('invalid templateId');
    }
    const rows = await this.prisma.contentGeneration.findMany({
      where: {
        organizationId,
        ...(productId ? { masterId: productId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows
      .filter((row) => this.isStoredAiDetail(row.detailPageHtml))
      .map((row) => this.toDto(row))
      .filter((row) => (templateId ? row.templateId === templateId : true));
  }

  async getById(id: string, organizationId: string): Promise<DetailPageGenerationDto> {
    const row = await this.prisma.contentGeneration.findFirst({
      where: { id, organizationId },
    });
    if (!row) throw new NotFoundException('Detail page generation not found');
    return this.toDto(row);
  }

  async remove(id: string, organizationId: string): Promise<{ ok: true }> {
    const row = await this.prisma.contentGeneration.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Detail page generation not found');
    await this.prisma.contentGeneration.delete({ where: { id } });
    return { ok: true };
  }

  private toDto(row: {
    id: string;
    masterId: string;
    originalImages: unknown;
    processedImages: unknown;
    generatedTitle: string | null;
    detailPageHtml: string | null;
    status: string;
    errorMessage: string | null;
    createdAt: Date;
  }): DetailPageGenerationDto {
    const stored = this.parseStoredDetail(row.detailPageHtml);
    const imageUrls = stored.imageUrls.length > 0
      ? stored.imageUrls
      : (Array.isArray(row.originalImages) ? row.originalImages.filter((x): x is string => typeof x === 'string') : []);
    const orderedImageUrls = moveSafetyLabelImagesToEnd(imageUrls);
    const result = this.resultRefiner.suppressProductInfoWhenSafetyLabelExists(
      stored.result,
      stored.templateId,
      orderedImageUrls,
    );
    return {
      id: row.id,
      productId: row.masterId,
      templateId: stored.templateId,
      productName: row.generatedTitle ?? stored.rawTitle ?? '상세페이지',
      rawInput: stored.rawInput,
      result,
      imageUrls: orderedImageUrls,
      processedImages: this.asStringRecord(row.processedImages),
      imageProcessingStatus: this.mapStatus(row.status),
      imageProcessingError: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private parseStoredDetail(raw: string | null): {
    templateId: DetailPageTemplateId;
    result: unknown;
    imageUrls: string[];
    rawInput: unknown;
    rawTitle: string | null;
  } {
    if (!raw) {
      return { templateId: 'kids-playful', result: {}, imageUrls: [], rawInput: {}, rawTitle: null };
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const templateId = parsed.templateId === 'bold-vertical' || parsed.templateId === 'simple-vertical'
        ? 'bold-vertical'
        : 'kids-playful';
      const imageUrls = Array.isArray(parsed.imageUrls)
        ? parsed.imageUrls.filter((x): x is string => typeof x === 'string')
        : [];
      const rawInput = parsed.rawInput ?? {};
      const rawTitle = rawInput && typeof rawInput === 'object' && typeof (rawInput as { rawTitle?: unknown }).rawTitle === 'string'
        ? (rawInput as { rawTitle: string }).rawTitle
        : null;
      return {
        templateId,
        result: parsed.result ?? parsed,
        imageUrls,
        rawInput,
        rawTitle,
      };
    } catch {
      return { templateId: 'kids-playful', result: {}, imageUrls: [], rawInput: {}, rawTitle: null };
    }
  }

  private isStoredAiDetail(raw: string | null): boolean {
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return parsed.templateId === 'kids-playful' ||
        parsed.templateId === 'bold-vertical' ||
        parsed.templateId === 'simple-vertical';
    } catch {
      return false;
    }
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

  private asStringRecord(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => (
        typeof entry[1] === 'string'
      )),
    );
  }

  private mapStatus(status: string): string {
    if (status === 'READY' || status === 'completed') return 'completed';
    if (status === 'FAILED' || status === 'failed') return 'failed';
    if (status === 'PROCESSING' || status === 'generating') return 'processing';
    return status.toLowerCase();
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

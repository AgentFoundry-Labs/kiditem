import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
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
  isSafetyLabelImageUrl,
  looksLikeSafetyLabelImage,
  moveSafetyLabelImagesToEnd,
} from '../../domain/detail-page-image-order';
import { buildBoldVerticalProductTitle } from '../../domain/detail-page-product-title';
import { DetailPageHeroImageService } from './detail-page-hero-image.service';

type DetailPageTemplateId = 'kids-playful' | 'bold-vertical';
const GENERATED_HERO_BANNER_KEY = '__heroBanner';
const GENERATED_SIZE_GUIDE_IMAGE_KEY = '__sizeGuideImage';
const GENERATED_COLOR_GUIDE_IMAGE_KEY = '__colorGuideImage';
const GENERATED_USAGE_IMAGE_KEYS = ['__usageGuideImage1', '__usageGuideImage2', '__usageGuideImage3'] as const;
const GENERATED_DETAIL_IMAGE_KEYS = ['__detailImage1', '__detailImage2', '__detailImage3'] as const;
const MAX_GENERATED_USAGE_IMAGES = 1;
const MAX_GENERATED_DETAIL_IMAGES = 1;

interface KidsPlayfulImageContext {
  packageImageIndices: Set<number>;
  safetyLabelImageIndices: Set<number>;
}

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
    @Optional()
    private readonly heroImageService?: DetailPageHeroImageService,
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
    const imageUrls = moveSafetyLabelImagesToEnd(dto.imageUrls);
    const rawInput = {
      rawTitle: dto.rawTitle,
      rawCategory: dto.rawCategory,
      rawDescription: dto.rawDescription,
      rawOptions: dto.rawOptions,
      imageUrls,
      heroImageMode,
      templateId,
    };

    const isBoldVertical = templateId === 'bold-vertical';
    const kidsImageContext = await this.prepareKidsPlayfulImageContext({
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
        const processedImages = await this.generateHeroImagesBestEffort({
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
    const processedImages = await this.generateHeroImagesBestEffort({
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
    const result = this.suppressProductInfoWhenSafetyLabelExists(
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
    rawInput: {
      rawTitle: string;
      rawCategory: string;
      rawDescription: string;
      rawOptions: string;
      imageUrls: string[];
      heroImageMode: 'first' | 'llm-pick';
      templateId: DetailPageTemplateId;
    };
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
      return this.applyKidsPlayfulImageSelectionRules(
        parsed as DetailPageGeneration,
        input.rawInput,
        input.kidsImageContext,
      );
    }
    const withProductTitleHeadings = this.applyBoldVerticalProductTitleHeadings(
      parsed as BoldVerticalGeneration,
      input.rawInput.rawTitle,
    );
    const withSizeFallbacks = this.applyBoldVerticalSizeFallbacks(
      withProductTitleHeadings,
      input.rawInput,
    );
    const withColorImages = await this.refineBoldVerticalColorImages(
      withSizeFallbacks,
      input.rawInput,
    );
    const withColorSubtitle = await this.refineBoldVerticalColorSubtitle(
      withColorImages,
      input.rawInput,
    );
    const withDetailImageOrder = await this.refineBoldVerticalDetailImageOrder(
      withColorSubtitle,
      input.rawInput,
    );
    const withPackageLabel = this.applyBoldVerticalPackageLabelFallbacks(
      withDetailImageOrder,
      input.rawInput,
    );
    const detectedSafetyLabelIndices = await this.detectSafetyLabelImageIndices(
      input.rawInput.imageUrls,
    );
    const withImageSelectionRules = this.applyBoldVerticalImageSelectionRules(
      withPackageLabel,
      input.rawInput,
      detectedSafetyLabelIndices,
    );
    return this.suppressProductInfoWhenSafetyLabelExists(
      withImageSelectionRules,
      input.templateId,
      input.rawInput.imageUrls,
      detectedSafetyLabelIndices,
    ) as BoldVerticalGeneration;
  }

  private suppressProductInfoWhenSafetyLabelExists<T>(
    result: T,
    templateId: DetailPageTemplateId,
    imageUrls: string[],
    detectedSafetyLabelIndices?: Set<number>,
  ): T {
    if (templateId !== 'bold-vertical') return result;
    if (!result || typeof result !== 'object') return result;
    const explicitSafetyIndices = (result as { safetyLabelImageIndices?: unknown }).safetyLabelImageIndices;
    const hasExplicitSafety = Array.isArray(explicitSafetyIndices) && explicitSafetyIndices.length > 0;
    const hasSafetyLabel = imageUrls.some(isSafetyLabelImageUrl) ||
      (detectedSafetyLabelIndices?.size ?? 0) > 0 ||
      hasExplicitSafety;
    if (!hasSafetyLabel) return result;
    if (!Array.isArray((result as { productInfo?: unknown }).productInfo)) return result;

    return {
      ...(result as Record<string, unknown>),
      productInfo: [],
    } as T;
  }

  private async detectSafetyLabelImageIndices(imageUrls: string[]): Promise<Set<number>> {
    const result = new Set<number>();
    await Promise.all(imageUrls.map(async (url, index) => {
      if (isSafetyLabelImageUrl(url)) {
        result.add(index);
        return;
      }
      const buffer = await this.fetchImageForSafetyDetection(url);
      if (!buffer) return;
      try {
        if (await looksLikeSafetyLabelImage(buffer)) result.add(index);
      } catch {
        // Safety detection is best-effort; URL markers and LLM fields still apply.
      }
    }));
    return result;
  }

  private async fetchImageForSafetyDetection(url: string): Promise<Buffer | null> {
    if (url.startsWith('data:image/')) {
      const [, encoded] = url.split(',', 2);
      if (!encoded) return null;
      try {
        return Buffer.from(encoded, 'base64');
      } catch {
        return null;
      }
    }
    if (!/^https?:\/\//i.test(url)) return null;
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      if (hostname === 'example.com' || hostname.endsWith('.example.com')) return null;
    } catch {
      return null;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return null;
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType && !contentType.toLowerCase().startsWith('image/')) return null;
      return Buffer.from(await response.arrayBuffer());
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private findSafetyLabelImageUrlIndices(imageUrls: string[]): Set<number> {
    const result = new Set<number>();
    imageUrls.forEach((url, index) => {
      if (isSafetyLabelImageUrl(url)) result.add(index);
    });
    return result;
  }

  private async prepareKidsPlayfulImageContext(input: {
    templateId: DetailPageTemplateId;
    rawInput: {
      rawDescription?: string;
      rawOptions?: string;
      imageUrls: string[];
    };
  }): Promise<KidsPlayfulImageContext> {
    if (input.templateId !== 'kids-playful') {
      return {
        packageImageIndices: new Set<number>(),
        safetyLabelImageIndices: new Set<number>(),
      };
    }

    const packageImageIndices = await this.inferKidsPackageImageIndices(input.rawInput);
    return {
      packageImageIndices,
      safetyLabelImageIndices: this.findSafetyLabelImageUrlIndices(input.rawInput.imageUrls),
    };
  }

  private async inferKidsPackageImageIndices(rawInput: {
    rawDescription?: string;
    rawOptions?: string;
    imageUrls: string[];
  }): Promise<Set<number>> {
    const result = new Set<number>();
    if (this.packagePreference(rawInput) === 'none') return result;
    if (!this.heroImageService || rawInput.imageUrls.length === 0) return result;
    if (!this.shouldInferPackageImages(rawInput)) return result;

    try {
      const indices = await this.heroImageService.inferPackageImagePositions({
        imageUrls: rawInput.imageUrls,
      });
      for (const index of indices) {
        if (!Number.isInteger(index) || index < 0 || index >= rawInput.imageUrls.length) continue;
        result.add(index);
      }
    } catch {
      // Package classification is best-effort; prompt-level hints still help when available.
    }
    return result;
  }

  private applyKidsPlayfulImageSelectionRules(
    parsed: DetailPageGeneration,
    rawInput: { imageUrls: string[] },
    context?: KidsPlayfulImageContext,
  ): DetailPageGeneration {
    const packageImageIndices = new Set(context?.packageImageIndices ?? []);
    const safetyLabelImageIndices = new Set([
      ...(context?.safetyLabelImageIndices ?? []),
      ...this.findSafetyLabelImageUrlIndices(rawInput.imageUrls),
    ]);
    const blockedIndices = new Set<number>([
      ...packageImageIndices,
      ...safetyLabelImageIndices,
    ]);
    const usedNormal = new Set<number>();

    const isAvailable = (value: number | null | undefined): value is number => (
      Number.isInteger(value) &&
      value !== null &&
      value !== undefined &&
      value >= 0 &&
      value < rawInput.imageUrls.length &&
      !blockedIndices.has(value)
    );
    const claim = (value: number | null | undefined): number | null => {
      if (!isAvailable(value) || usedNormal.has(value)) return null;
      usedNormal.add(value);
      return value;
    };
    const claimFirstRemaining = (): number | null => {
      for (let index = 0; index < rawInput.imageUrls.length; index += 1) {
        if (!isAvailable(index) || usedNormal.has(index)) continue;
        usedNormal.add(index);
        return index;
      }
      return null;
    };

    const section1HeroImageIndex = claim(parsed.section1.heroImageIndex) ?? claimFirstRemaining();
    const section3Scenarios = parsed.section3.scenarios.map((scenario) => ({
      ...scenario,
      imageIndex: claim(scenario.imageIndex),
    }));
    const section4MoodImageIndex = claim(parsed.section4.moodImageIndex);
    const section5ImageIndex = claim(parsed.section5.imageIndex);
    const section6Cards = parsed.section6.cards.map((card) => ({
      ...card,
      imageIndex: claim(card.imageIndex),
    }));
    const section7ImageIndex = claim(parsed.section7.imageIndex);
    const section8Blocks = parsed.section8.blocks.map((block) => ({
      ...block,
      imageIndex: claim(block.imageIndex),
    }));
    const section10Cards = parsed.section10.cards.map((card) => ({
      ...card,
      imageIndex: claim(card.imageIndex),
    }));

    const galleryFirstCandidate = parsed.section11.galleryImageIndices[0];
    const gallerySecondCandidate = parsed.section11.galleryImageIndices[1];
    const galleryFirst = claim(galleryFirstCandidate) ?? claimFirstRemaining();
    const packageGallery = [...packageImageIndices].find((index) => (
      Number.isInteger(index) &&
      index >= 0 &&
      index < rawInput.imageUrls.length &&
      !safetyLabelImageIndices.has(index)
    ));
    const gallerySecond = packageGallery ?? claim(gallerySecondCandidate) ?? claimFirstRemaining();

    return {
      ...parsed,
      section1: {
        ...parsed.section1,
        heroImageIndex: section1HeroImageIndex,
      },
      section3: {
        ...parsed.section3,
        scenarios: section3Scenarios,
      },
      section4: {
        ...parsed.section4,
        moodImageIndex: section4MoodImageIndex,
      },
      section5: {
        ...parsed.section5,
        imageIndex: section5ImageIndex,
      },
      section6: {
        ...parsed.section6,
        cards: section6Cards,
      },
      section7: {
        ...parsed.section7,
        imageIndex: section7ImageIndex,
      },
      section8: {
        ...parsed.section8,
        blocks: section8Blocks,
      },
      section10: {
        ...parsed.section10,
        cards: section10Cards,
      },
      section11: {
        ...parsed.section11,
        galleryImageIndices: [galleryFirst, gallerySecond],
      },
    };
  }

  private async generateHeroImagesBestEffort(input: {
    organizationId: string;
    parsed: DetailPageGeneration | BoldVerticalGeneration;
    templateId: DetailPageTemplateId;
    rawInput: {
      rawTitle: string;
      rawCategory: string;
      rawDescription: string;
      rawOptions: string;
      imageUrls: string[];
      heroImageMode: 'first' | 'llm-pick';
      templateId: DetailPageTemplateId;
    };
    productName: string;
    excludedImageIndices?: number[];
  }): Promise<Record<string, string>> {
    if (!this.heroImageService) return {};
    const processedImages: Record<string, string> = {};
    const excludedImageIndices = new Set(input.excludedImageIndices ?? []);
    const heroSourceImageUrls = input.rawInput.imageUrls.filter((url, index) => (
      !excludedImageIndices.has(index) && !isSafetyLabelImageUrl(url)
    ));

    const generateHero = () => this.heroImageService!.generateHeroBanner({
      organizationId: input.organizationId,
      productName: input.rawInput.rawTitle,
      category: input.rawInput.rawCategory,
      description: input.rawInput.rawDescription,
      options: input.rawInput.rawOptions,
      templateId: input.templateId,
      headline: input.productName,
      subhead: this.pickHeroSubhead(input.parsed, input.templateId),
      imageUrls: heroSourceImageUrls.length > 0 ? heroSourceImageUrls : input.rawInput.imageUrls,
    });

    if (input.templateId === 'bold-vertical') {
      processedImages[GENERATED_HERO_BANNER_KEY] = await generateHero();
    } else {
      try {
        processedImages[GENERATED_HERO_BANNER_KEY] = await generateHero();
      } catch {
        // Hero image generation is best-effort for legacy templates.
      }
    }

    if (input.templateId === 'bold-vertical') {
      processedImages[GENERATED_SIZE_GUIDE_IMAGE_KEY] =
        await this.heroImageService.generateSizeGuideImage({
          organizationId: input.organizationId,
          productName: input.rawInput.rawTitle,
          category: input.rawInput.rawCategory,
          description: input.rawInput.rawDescription,
          options: input.rawInput.rawOptions,
          imageUrls: this.pickSizeGuideSourceImages(input.parsed, input.rawInput.imageUrls),
          heightLabel: (input.parsed as BoldVerticalGeneration).size?.heightLabel ?? '',
          widthLabel: (input.parsed as BoldVerticalGeneration).size?.widthLabel ?? '',
        });

      await this.generateBoldVerticalSectionImages(input, processedImages);
    }

    if (input.templateId === 'kids-playful') {
      await this.generateKidsPlayfulSectionImages(input, processedImages);
    }

    return processedImages;
  }

  private async generateBoldVerticalSectionImages(
    input: {
      organizationId: string;
      parsed: DetailPageGeneration | BoldVerticalGeneration;
      rawInput: {
        rawTitle: string;
        rawCategory: string;
        rawDescription: string;
        rawOptions: string;
        imageUrls: string[];
      };
    },
    processedImages: Record<string, string>,
  ): Promise<void> {
    if (!this.heroImageService) return;
    const parsed = input.parsed as BoldVerticalGeneration;
    const blockedIndices = new Set<number>([
      ...((parsed.packageImageIndices ?? []) as number[]),
      ...((parsed.safetyLabelImageIndices ?? []) as number[]),
    ]);
    const productImageCount = this.countProductImages(input.rawInput.imageUrls);
    const needsDerivedLayout = productImageCount <= 3;

    if ((parsed.color?.imageIndices ?? []).length === 0 && this.colorPreference(input.rawInput) !== 'none') {
      try {
        const url = await this.heroImageService.generateColorGuideImage({
          organizationId: input.organizationId,
          productName: input.rawInput.rawTitle,
          category: input.rawInput.rawCategory,
          description: input.rawInput.rawDescription,
          options: input.rawInput.rawOptions,
          imageUrls: this.pickSectionSourceImages(
            parsed.color?.imageIndices ?? [],
            input.rawInput.imageUrls,
            blockedIndices,
          ),
        });
        processedImages[GENERATED_COLOR_GUIDE_IMAGE_KEY] = url;
      } catch {
        // Color guide image is best-effort; fallback to selected/uploaded images.
      }
    }

    const usageSteps = this.normalizeUsageGuide(parsed.usage?.subtitle ?? '', input.rawInput)
      .split('\n')
      .map((step) => step.trim())
      .filter(Boolean)
      .slice(0, GENERATED_USAGE_IMAGE_KEYS.length);
    if (usageSteps.length > 0) {
      for (const [index, key] of GENERATED_USAGE_IMAGE_KEYS.slice(0, MAX_GENERATED_USAGE_IMAGES).entries()) {
        const usageStep = usageSteps[index];
        if (!usageStep) continue;
        try {
          const url = await this.heroImageService.generateUsageGuideImage({
            organizationId: input.organizationId,
            productName: input.rawInput.rawTitle,
            category: input.rawInput.rawCategory,
            description: input.rawInput.rawDescription,
            options: input.rawInput.rawOptions,
            imageUrls: this.pickSectionSourceImages(
              parsed.usage?.imageIndices ?? [],
              input.rawInput.imageUrls,
              blockedIndices,
            ),
            usageStep,
            variant: index + 1,
          });
          if (url) processedImages[key] = url;
        } catch {
          // Usage guide images are best-effort; the template still renders text steps.
        }
      }
    }

    if (needsDerivedLayout || (parsed.detailImageIndices ?? []).length < 2) {
      for (const [index, key] of GENERATED_DETAIL_IMAGE_KEYS.slice(0, MAX_GENERATED_DETAIL_IMAGES).entries()) {
        try {
          const url = await this.heroImageService.generateDetailCutImage({
            organizationId: input.organizationId,
            productName: input.rawInput.rawTitle,
            category: input.rawInput.rawCategory,
            description: input.rawInput.rawDescription,
            options: input.rawInput.rawOptions,
            imageUrls: this.pickSectionSourceImages(
              parsed.detailImageIndices ?? [],
              input.rawInput.imageUrls,
              blockedIndices,
            ),
            variant: index + 1,
          });
          if (url) processedImages[key] = url;
        } catch {
          // Detail support images are best-effort; fallback to selected/uploaded images.
        }
      }
    }
  }

  private async generateKidsPlayfulSectionImages(
    input: {
      organizationId: string;
      parsed: DetailPageGeneration | BoldVerticalGeneration;
      rawInput: {
        rawTitle: string;
        rawCategory: string;
        rawDescription: string;
        rawOptions: string;
        imageUrls: string[];
      };
      excludedImageIndices?: number[];
    },
    processedImages: Record<string, string>,
  ): Promise<void> {
    if (!this.heroImageService) return;
    const parsed = input.parsed as DetailPageGeneration;
    const excludedIndices = new Set(input.excludedImageIndices ?? []);
    const preferredIndices = this.collectKidsPlayfulNormalImageIndices(parsed);
    const fallbackIndices = input.rawInput.imageUrls
      .map((_, index) => index)
      .filter((index) => !excludedIndices.has(index));
    const sourceImages = this.pickSectionSourceImages(
      preferredIndices.length > 0 ? preferredIndices : fallbackIndices,
      input.rawInput.imageUrls,
      excludedIndices,
    );
    if (sourceImages.length === 0) return;

    for (const [index, key] of GENERATED_USAGE_IMAGE_KEYS.slice(0, MAX_GENERATED_USAGE_IMAGES).entries()) {
      const scenario = parsed.section3.scenarios[index];
      if (!scenario || scenario.imageIndex !== null || processedImages[key]) continue;
      try {
        const url = await this.heroImageService.generateUsageGuideImage({
          organizationId: input.organizationId,
          productName: input.rawInput.rawTitle,
          category: input.rawInput.rawCategory,
          description: input.rawInput.rawDescription,
          options: input.rawInput.rawOptions,
          imageUrls: sourceImages,
          usageStep: scenario.caption,
          variant: index + 1,
        });
        if (url) processedImages[key] = url;
      } catch {
        // Generated usage images are best-effort; the section can still show text.
      }
    }

    const needsDetailImages = [
      parsed.section5.imageIndex,
      ...parsed.section6.cards.map((card) => card.imageIndex),
      parsed.section7.imageIndex,
      ...parsed.section8.blocks.map((block) => block.imageIndex),
      ...parsed.section10.cards.map((card) => card.imageIndex),
    ].some((imageIndex) => imageIndex === null);
    if (!needsDetailImages) return;

    for (const [index, key] of GENERATED_DETAIL_IMAGE_KEYS.slice(0, MAX_GENERATED_DETAIL_IMAGES).entries()) {
      if (processedImages[key]) continue;
      try {
        const url = await this.heroImageService.generateDetailCutImage({
          organizationId: input.organizationId,
          productName: input.rawInput.rawTitle,
          category: input.rawInput.rawCategory,
          description: input.rawInput.rawDescription,
          options: input.rawInput.rawOptions,
          imageUrls: sourceImages,
          variant: index + 1,
        });
        if (url) processedImages[key] = url;
      } catch {
        // Generated detail images are best-effort; raw images or placeholders remain valid.
      }
    }
  }

  private collectKidsPlayfulNormalImageIndices(parsed: DetailPageGeneration): number[] {
    const values = [
      parsed.section1.heroImageIndex,
      ...parsed.section3.scenarios.map((scenario) => scenario.imageIndex),
      parsed.section4.moodImageIndex,
      parsed.section5.imageIndex,
      ...parsed.section6.cards.map((card) => card.imageIndex),
      parsed.section7.imageIndex,
      ...parsed.section8.blocks.map((block) => block.imageIndex),
      ...parsed.section10.cards.map((card) => card.imageIndex),
    ];
    return Array.from(new Set(values.filter((value): value is number => Number.isInteger(value))));
  }

  private pickSizeGuideSourceImages(
    parsed: DetailPageGeneration | BoldVerticalGeneration,
    imageUrls: string[],
  ): string[] {
    const bold = parsed as BoldVerticalGeneration;
    const sizeIndices = bold.size?.imageIndices ?? [];
    return this.pickSectionSourceImages(sizeIndices, imageUrls);
  }

  private pickSectionSourceImages(
    indices: number[],
    imageUrls: string[],
    excludedIndices: Set<number> = new Set(),
  ): string[] {
    const allowedEntries = imageUrls
      .map((url, index) => ({ url, index }))
      .filter(({ url, index }) => (
        typeof url === 'string' &&
        url.trim() !== '' &&
        !excludedIndices.has(index) &&
        !isSafetyLabelImageUrl(url)
      ));
    const picked = indices
      .filter((idx) => Number.isInteger(idx) && !excludedIndices.has(idx))
      .map((idx) => imageUrls[idx])
      .filter((url): url is string => (
        typeof url === 'string' &&
        url.trim() !== '' &&
        !isSafetyLabelImageUrl(url)
      ));
    return Array.from(new Set([...picked, ...allowedEntries.map(({ url }) => url)]));
  }

  private countProductImages(imageUrls: string[]): number {
    return imageUrls.filter((url) => url.trim() !== '' && !isSafetyLabelImageUrl(url)).length;
  }

  private applyBoldVerticalProductTitleHeadings(
    parsed: BoldVerticalGeneration,
    rawTitle: string,
  ): BoldVerticalGeneration {
    const title = buildBoldVerticalProductTitle(rawTitle);
    if (!title) return parsed;

    const productInfo = (parsed.productInfo ?? []).map((info) => (
      info.key.includes('제품명') ? { ...info, value: title.plainTitle } : info
    ));

    return {
      ...parsed,
      hook: {
        ...parsed.hook,
        subtext: title.heroSubtext ?? parsed.hook.subtext,
        text: title.first,
        titleSub: title.second,
        description: title.heroDescription ?? parsed.hook.description,
      },
      section: {
        ...parsed.section,
        name: title.first,
        title: title.second,
        subtitle: title.sectionSubtitle ?? parsed.section.subtitle,
      },
      size: {
        ...parsed.size,
        subtitle: parsed.size.subtitle || `${title.plainTitle}의 사이즈 안내 입니다.`,
      },
      productInfo,
    };
  }

  private applyBoldVerticalSizeFallbacks(
    parsed: BoldVerticalGeneration,
    rawInput: { rawDescription: string; rawOptions: string },
  ): BoldVerticalGeneration {
    const labels = this.extractSizeLabels(`${rawInput.rawOptions}\n${rawInput.rawDescription}`);
    return {
      ...parsed,
      size: {
        ...parsed.size,
        guideOverlay: true,
        heightLabel: parsed.size.heightLabel || labels.heightLabel,
        widthLabel: parsed.size.widthLabel || labels.widthLabel,
      },
    };
  }

  private async refineBoldVerticalColorSubtitle(
    parsed: BoldVerticalGeneration,
    rawInput: {
      rawTitle: string;
      rawCategory: string;
      rawDescription: string;
      rawOptions: string;
      imageUrls: string[];
    },
  ): Promise<BoldVerticalGeneration> {
    if (this.colorPreference(rawInput) === 'none') return this.applyBoldVerticalNoColor(parsed);
    if (!this.heroImageService) return parsed;
    try {
      const subtitle = await this.heroImageService.inferColorSubtitle({
        productName: rawInput.rawTitle,
        category: rawInput.rawCategory,
        description: rawInput.rawDescription,
        options: rawInput.rawOptions,
        imageUrls: this.pickSectionSourceImages(parsed.color?.imageIndices ?? [], rawInput.imageUrls),
      });
      return this.applyBoldVerticalColorSubtitle(parsed, subtitle);
    } catch {
      return parsed;
    }
  }

  private async refineBoldVerticalColorImages(
    parsed: BoldVerticalGeneration,
    rawInput: {
      rawTitle: string;
      rawCategory: string;
      rawDescription: string;
      rawOptions: string;
      imageUrls: string[];
    },
  ): Promise<BoldVerticalGeneration> {
    if (this.colorPreference(rawInput) === 'none') return this.applyBoldVerticalNoColor(parsed);
    if (!this.heroImageService) return parsed;
    try {
      const imageIndices = await this.heroImageService.inferColorImageSelection({
        productName: rawInput.rawTitle,
        category: rawInput.rawCategory,
        description: rawInput.rawDescription,
        options: rawInput.rawOptions,
        imageUrls: rawInput.imageUrls,
      });
      if (imageIndices.length === 0) return parsed;
      return {
        ...parsed,
        color: {
          ...parsed.color,
          imageIndices,
        },
      };
    } catch {
      return parsed;
    }
  }

  private applyBoldVerticalColorSubtitle(
    parsed: BoldVerticalGeneration,
    subtitle: string,
  ): BoldVerticalGeneration {
    const colorSubtitle = subtitle.trim();
    if (!colorSubtitle) return parsed;
    const productInfo = (parsed.productInfo ?? []).map((info) => (
      info.key.includes('색상') ? { ...info, value: colorSubtitle } : info
    ));
    return {
      ...parsed,
      color: {
        ...parsed.color,
        subtitle: colorSubtitle,
      },
      productInfo,
    };
  }

  private applyBoldVerticalNoColor(parsed: BoldVerticalGeneration): BoldVerticalGeneration {
    return {
      ...parsed,
      color: {
        ...parsed.color,
        subtitle: '',
        imageIndices: [],
      },
      productInfo: (parsed.productInfo ?? []).filter((info) => !info.key.includes('색상')),
    };
  }

  private async refineBoldVerticalDetailImageOrder(
    parsed: BoldVerticalGeneration,
    rawInput: { rawDescription?: string; rawOptions?: string; imageUrls: string[] },
  ): Promise<BoldVerticalGeneration> {
    if (this.packagePreference(rawInput) === 'none') {
      return {
        ...parsed,
        packageImageIndices: [],
        packageLabel: '',
      };
    }
    if (!this.heroImageService || parsed.detailImageIndices.length === 0) {
      return {
        ...parsed,
        packageImageIndices: [],
        packageLabel: '',
      };
    }

    const selected = parsed.detailImageIndices
      .map((imageIndex, detailPosition) => ({
        imageIndex,
        detailPosition,
        url: rawInput.imageUrls[imageIndex],
      }))
      .filter((item): item is { imageIndex: number; detailPosition: number; url: string } => (
        typeof item.url === 'string' && item.url.trim() !== ''
      ));
    if (selected.length === 0) {
      return {
        ...parsed,
        packageImageIndices: [],
        packageLabel: '',
      };
    }

    try {
      const packagePositions = await this.heroImageService.inferPackageImagePositions({
        imageUrls: selected.map((item) => item.url),
      });
      if (packagePositions.length === 0) {
        return {
          ...parsed,
          packageImageIndices: [],
          packageLabel: '',
        };
      }

      const packageDetailPositions = new Set(
        packagePositions
          .map((position) => selected[position]?.detailPosition)
          .filter((position): position is number => Number.isInteger(position)),
      );
      if (packageDetailPositions.size === 0) {
        return {
          ...parsed,
          packageImageIndices: [],
          packageLabel: '',
        };
      }
      const packageImageIndices = parsed.detailImageIndices
        .filter((_, position) => packageDetailPositions.has(position));

      return {
        ...parsed,
        packageImageIndices,
        detailImageIndices: parsed.detailImageIndices
          .map((imageIndex, position) => ({ imageIndex, position }))
          .sort((a, b) => {
            const aIsPackage = packageDetailPositions.has(a.position);
            const bIsPackage = packageDetailPositions.has(b.position);
            if (aIsPackage !== bIsPackage) return aIsPackage ? 1 : -1;
            return a.position - b.position;
          })
          .map((item) => item.imageIndex),
      };
    } catch {
      return {
        ...parsed,
        packageImageIndices: [],
        packageLabel: '',
      };
    }
  }

  private applyBoldVerticalPackageLabelFallbacks(
    parsed: BoldVerticalGeneration,
    rawInput: { rawTitle: string; rawDescription: string; rawOptions: string },
  ): BoldVerticalGeneration {
    if (this.packagePreference(rawInput) === 'none') {
      return {
        ...parsed,
        packageImageIndices: [],
        packageLabel: '',
      };
    }
    const packageImageIndices = parsed.packageImageIndices ?? [];
    if (packageImageIndices.length === 0) {
      return {
        ...parsed,
        packageImageIndices: [],
        packageLabel: '',
      };
    }
    if (parsed.packageLabel?.trim()) return parsed;

    const raw = `${rawInput.rawTitle}\n${rawInput.rawDescription}\n${rawInput.rawOptions}`;
    const kind = this.packageKind(rawInput);
    const count = raw.match(/(\d+)\s*(?:개입|개\s*입|pcs|PCS|ea|EA|입)/u)?.[1];
    const setCount = raw.match(/(\d+)\s*(?:종|개)\s*세트/u)?.[1];
    const plainCount = raw.match(/(?:1박스\s*수량|세트\s*수량)\s*:\s*(\d+)/u)?.[1];
    if (kind === 'box') {
      return {
        ...parsed,
        packageLabel: count || plainCount ? `1박스 ${count || plainCount}개입 구성` : '박스 구성',
      };
    }
    if (kind === 'set') {
      return {
        ...parsed,
        packageLabel: setCount
          ? `${setCount}종 세트 구성`
          : plainCount
            ? `${plainCount}개 세트 구성`
            : '세트 구성',
      };
    }
    if (count && /box|BOX|박스|패키지|포장/u.test(raw)) {
      return {
        ...parsed,
        packageLabel: `1박스 ${count}개입 구성`,
      };
    }
    if (setCount) {
      return {
        ...parsed,
        packageLabel: `${setCount}종 세트 구성`,
      };
    }
    if (/box|BOX|박스|패키지|포장/u.test(raw)) {
      return {
        ...parsed,
        packageLabel: '박스 구성',
      };
    }
    return {
      ...parsed,
      packageLabel: '세트 구성',
    };
  }

  private applyBoldVerticalImageSelectionRules(
    parsed: BoldVerticalGeneration,
    rawInput: { rawDescription: string; rawOptions: string; imageUrls: string[] },
    detectedSafetyLabelIndices: Set<number> = new Set(),
  ): BoldVerticalGeneration {
    const urlSafetyIndices = new Set(
      rawInput.imageUrls
        .map((url, index) => ({ url, index }))
        .filter(({ url }) => isSafetyLabelImageUrl(url))
        .map(({ index }) => index),
    );
    const explicitSafetyLabelImageIndices = [
      ...(parsed.safetyLabelImageIndices ?? []),
      ...Array.from(urlSafetyIndices),
      ...Array.from(detectedSafetyLabelIndices),
    ];
    const safetyLabelImageIndices = this.cleanImageIndices(
      explicitSafetyLabelImageIndices,
      rawInput.imageUrls.length,
      8,
    );
    const safetyIndices = new Set(safetyLabelImageIndices);
    const cleanIndices = (indices: number[] | undefined, max: number): number[] => {
      const seen = new Set<number>();
      const result: number[] = [];
      for (const index of indices ?? []) {
        if (!Number.isInteger(index) || index < 0 || index >= rawInput.imageUrls.length) continue;
        if (safetyIndices.has(index) || seen.has(index)) continue;
        seen.add(index);
        result.push(index);
        if (result.length >= max) break;
      }
      return result;
    };
    const packagePreference = this.packagePreference(rawInput);
    const packageImageIndices = packagePreference === 'none'
      ? []
      : cleanIndices(parsed.packageImageIndices, 3);
    const packageSet = new Set(packageImageIndices);
    const detailBase = cleanIndices(parsed.detailImageIndices, 8)
      .filter((index) => !packageSet.has(index));
    const detailImageIndices = [...detailBase, ...packageImageIndices].slice(0, 8);
    const isNoColor = this.colorPreference(rawInput) === 'none';

    return {
      ...parsed,
      keyPoints: parsed.keyPoints.map((point) => ({
        ...point,
        imageIndex: point.imageIndex !== null &&
          point.imageIndex !== undefined &&
          !safetyIndices.has(point.imageIndex) &&
          point.imageIndex < rawInput.imageUrls.length
            ? point.imageIndex
            : null,
      })),
      size: {
        ...parsed.size,
        imageIndices: cleanIndices(parsed.size.imageIndices, 1),
      },
      color: {
        ...parsed.color,
        subtitle: isNoColor ? '' : parsed.color.subtitle,
        imageIndices: isNoColor ? [] : cleanIndices(parsed.color.imageIndices, 6),
      },
      usage: {
        ...parsed.usage,
        subtitle: this.normalizeUsageGuide(parsed.usage.subtitle, rawInput),
        imageIndices: cleanIndices(parsed.usage.imageIndices, 4),
      },
      detailImageIndices,
      packageImageIndices,
      packageLabel: packageImageIndices.length > 0 ? parsed.packageLabel : '',
      safetyLabelImageIndices,
      productInfo: isNoColor
        ? (parsed.productInfo ?? []).filter((info) => !info.key.includes('색상'))
        : parsed.productInfo,
    };
  }

  private cleanImageIndices(indices: number[] | undefined, imageCount: number, max: number): number[] {
    const seen = new Set<number>();
    const result: number[] = [];
    for (const index of indices ?? []) {
      if (!Number.isInteger(index) || index < 0 || index >= imageCount) continue;
      if (seen.has(index)) continue;
      seen.add(index);
      result.push(index);
      if (result.length >= max) break;
    }
    return result;
  }

  private packagePreference(
    rawInput: { rawDescription?: string; rawOptions?: string },
  ): 'none' | 'exists' | 'auto' {
    const raw = `${rawInput.rawDescription ?? ''}\n${rawInput.rawOptions ?? ''}`;
    if (/박스\/세트\s*정보\s*:\s*없음/u.test(raw)) return 'none';
    if (/박스\/세트\s*정보\s*:\s*있음/u.test(raw)) return 'exists';
    return 'auto';
  }

  private shouldInferPackageImages(rawInput: {
    rawDescription?: string;
    rawOptions?: string;
    imageUrls: string[];
  }): boolean {
    if (this.packagePreference(rawInput) === 'exists') return true;
    const raw = `${rawInput.rawDescription ?? ''}\n${rawInput.rawOptions ?? ''}`
      .replace(/박스\/세트\s*정보\s*:\s*AI[^\n]*/gu, '')
      .replace(/박스\/세트\s*구분\s*:\s*AI[^\n]*/gu, '');
    if (/(\d+\s*(?:개입|입|pcs|p|세트)|패키지|박스|box|package|구성품|세트\s*구성)/iu.test(raw)) {
      return true;
    }
    return rawInput.imageUrls.some((url) => /(?:box|package|pkg|set|barcode|kc|label)/iu.test(url));
  }

  private colorPreference(
    rawInput: { rawDescription?: string; rawOptions?: string },
  ): 'none' | 'single' | 'multiple' | 'auto' {
    const raw = `${rawInput.rawDescription ?? ''}\n${rawInput.rawOptions ?? ''}`;
    if (/색상\s*구성\s*:\s*없음/u.test(raw)) return 'none';
    if (/색상\s*구성\s*:\s*단일\s*색상/u.test(raw)) return 'single';
    if (/색상\s*구성\s*:\s*여러\s*색상/u.test(raw)) return 'multiple';
    return 'auto';
  }

  private normalizeUsageGuide(
    value: string,
    rawInput: { rawTitle?: string; rawCategory?: string; rawDescription?: string; rawOptions?: string },
  ): string {
    const existing = value
      .split(/\n|(?:^|\s)(?=\d+[.)]\s*)/u)
      .map((line) => line.replace(/^\d+[.)]\s*/u, '').trim())
      .filter(Boolean)
      .slice(0, 3);
    if (existing.length >= 2) {
      return existing.map((line, index) => `${index + 1}. ${line}`).join('\n');
    }

    const raw = `${rawInput.rawTitle ?? ''}\n${rawInput.rawCategory ?? ''}\n${rawInput.rawDescription ?? ''}\n${rawInput.rawOptions ?? ''}`;
    const steps = [
      ...existing,
      ...this.fallbackUsageSteps(raw).filter((line) => !existing.includes(line)),
    ].slice(0, 3);
    return steps.map((line, index) => `${index + 1}. ${line}`).join('\n');
  }

  private fallbackUsageSteps(raw: string): string[] {
    if (/비눗|버블|bubble/i.test(raw)) {
      return [
        '제품을 세워 잡고 전원을 켜세요',
        '입구가 얼굴을 향하지 않게 사용하세요',
        '사용 후 물기를 닦아 보관하세요',
      ];
    }
    if (/드론|비행|촬영/i.test(raw)) {
      return [
        '배터리를 충분히 충전하세요',
        '평평한 공간에서 전원을 켜세요',
        '사용 후 전원을 끄고 보관하세요',
      ];
    }
    if (/수제|왁스|말랑|주물럭|슬라임|촉감/i.test(raw)) {
      return [
        '포장을 열고 제품 상태를 확인하세요',
        '손으로 가볍게 눌러 촉감을 즐기세요',
        '사용 후 먼지를 닦아 보관하세요',
      ];
    }
    if (/스티커|문구|펜|노트|학용/i.test(raw)) {
      return [
        '필요한 구성품을 먼저 확인하세요',
        '원하는 위치에 맞춰 사용하세요',
        '사용 후 정리해 보관하세요',
      ];
    }
    return [
      '포장을 열고 제품 상태를 확인하세요',
      '보호자 확인 후 알맞게 사용하세요',
      '사용 후 깨끗하게 정리해 보관하세요',
    ];
  }

  private packageKind(
    rawInput: { rawDescription?: string; rawOptions?: string },
  ): 'box' | 'set' | 'auto' {
    const raw = `${rawInput.rawDescription ?? ''}\n${rawInput.rawOptions ?? ''}`;
    if (/박스\/세트\s*구분\s*:\s*박스/u.test(raw)) return 'box';
    if (/박스\/세트\s*구분\s*:\s*세트/u.test(raw)) return 'set';
    return 'auto';
  }

  private extractSizeLabels(raw: string): { heightLabel: string; widthLabel: string } {
    const explicitHeight = this.extractExplicitSize(raw, ['높이', '세로', 'height', 'h']);
    const explicitWidth = this.extractExplicitSize(raw, ['가로', '너비', '폭', 'width', 'w']);
    const pair = this.extractWidthHeightPair(raw);
    const allSizes = Array.from(raw.matchAll(/(\d+(?:\.\d+)?)\s*(mm|cm|m)/gi))
      .map((match) => this.formatSizeLabel(match[1], match[2]));
    return {
      heightLabel: explicitHeight || pair?.heightLabel || allSizes[0] || '',
      widthLabel: explicitWidth || pair?.widthLabel || allSizes[1] || '',
    };
  }

  private extractWidthHeightPair(raw: string): { widthLabel: string; heightLabel: string } | null {
    const match = raw.match(
      /(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*(?:x|×|\*|X)\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?/i,
    );
    if (!match) return null;
    const firstUnit = match[2];
    const secondUnit = match[4];
    const unit = secondUnit || firstUnit;
    if (!unit) return null;
    return {
      widthLabel: this.formatSizeLabel(match[1], unit),
      heightLabel: this.formatSizeLabel(match[3], unit),
    };
  }

  private extractExplicitSize(raw: string, labels: string[]): string {
    const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(?:${escaped.join('|')})\\s*[:：]?\\s*(\\d+(?:\\.\\d+)?)\\s*(mm|cm|m)`, 'i');
    const match = raw.match(pattern);
    return match ? this.formatSizeLabel(match[1], match[2]) : '';
  }

  private formatSizeLabel(value: string, unit: string): string {
    const normalized = value.replace(/\.0+$/, '');
    return `${normalized}${unit.toLowerCase()}`;
  }

  private pickHeroSubhead(
    parsed: DetailPageGeneration | BoldVerticalGeneration,
    templateId: DetailPageTemplateId,
  ): string {
    if (templateId === 'bold-vertical') {
      const hook = (parsed as BoldVerticalGeneration).hook;
      return [hook.subtext, hook.titleSub, hook.description].filter(Boolean).join(' / ');
    }
    const section1 = (parsed as DetailPageGeneration).section1;
    return section1.subhead;
  }

  private extractJson(raw: string): unknown {
    const trimmed = raw.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]+?)\n?```$/);
    const body = fenced ? fenced[1] : trimmed;
    return JSON.parse(body);
  }
}

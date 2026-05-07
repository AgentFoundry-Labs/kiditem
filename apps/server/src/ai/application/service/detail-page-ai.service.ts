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
const GENERATED_DETAIL_IMAGE_KEYS = ['__detailImage1', '__detailImage2', '__detailImage3'] as const;

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
        href: `/products/${dto.productId}`,
        metadata: { templateId, imageCount: imageUrls.length },
      });

      try {
        const parsed = await this.generateParsed({
          rawInput,
          heroImageMode,
          templateId,
          model,
          isBoldVertical,
        });
        const productName = this.pickProductName(parsed, templateId, dto.rawTitle);
        const processedImages = await this.generateHeroImagesBestEffort({
          organizationId,
          parsed,
          templateId,
          rawInput,
          productName,
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
    });
    const productName = this.pickProductName(parsed, templateId, dto.rawTitle);
    const processedImages = await this.generateHeroImagesBestEffort({
      organizationId,
      parsed,
      templateId,
      rawInput,
      productName,
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
  }): Promise<DetailPageGeneration | BoldVerticalGeneration> {
    const { text: rawText } = await this.textCompletion.complete({
      system: input.isBoldVertical ? BOLD_VERTICAL_SYSTEM : SINGLE_CALL_SYSTEM,
      user: input.isBoldVertical
        ? buildBoldVerticalUser({ raw: input.rawInput, heroImageMode: input.heroImageMode })
        : buildSingleCallUser({ raw: input.rawInput, heroImageMode: input.heroImageMode }),
      temperature: 0.8,
      responseMimeType: 'application/json',
      model: input.model,
    });
    const parsed = (input.isBoldVertical ? BoldVerticalGenerationSchema : DetailPageGenerationSchema)
      .parse(this.extractJson(rawText));
    if (!input.isBoldVertical) return parsed;
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
    const withImageSelectionRules = this.applyBoldVerticalImageSelectionRules(
      withPackageLabel,
      input.rawInput,
    );
    return this.suppressProductInfoWhenSafetyLabelExists(
      withImageSelectionRules,
      input.templateId,
      input.rawInput.imageUrls,
    ) as BoldVerticalGeneration;
  }

  private suppressProductInfoWhenSafetyLabelExists<T>(
    result: T,
    templateId: DetailPageTemplateId,
    imageUrls: string[],
  ): T {
    if (templateId !== 'bold-vertical') return result;
    if (!imageUrls.some(isSafetyLabelImageUrl)) return result;
    if (!result || typeof result !== 'object') return result;
    if (!Array.isArray((result as { productInfo?: unknown }).productInfo)) return result;

    return {
      ...(result as Record<string, unknown>),
      productInfo: [],
    } as T;
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
  }): Promise<Record<string, string>> {
    if (!this.heroImageService) return {};
    const processedImages: Record<string, string> = {};

    const generateHero = () => this.heroImageService!.generateHeroBanner({
      organizationId: input.organizationId,
      productName: input.rawInput.rawTitle,
      category: input.rawInput.rawCategory,
      description: input.rawInput.rawDescription,
      options: input.rawInput.rawOptions,
      templateId: input.templateId,
      headline: input.productName,
      subhead: this.pickHeroSubhead(input.parsed, input.templateId),
      imageUrls: input.rawInput.imageUrls,
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
    const productImageCount = this.countProductImages(input.rawInput.imageUrls);
    const needsDerivedLayout = productImageCount <= 3;

    if ((parsed.color?.imageIndices ?? []).length === 0) {
      try {
        const url = await this.heroImageService.generateColorGuideImage({
          organizationId: input.organizationId,
          productName: input.rawInput.rawTitle,
          category: input.rawInput.rawCategory,
          description: input.rawInput.rawDescription,
          options: input.rawInput.rawOptions,
          imageUrls: this.pickSectionSourceImages(parsed.color?.imageIndices ?? [], input.rawInput.imageUrls),
        });
        processedImages[GENERATED_COLOR_GUIDE_IMAGE_KEY] = url;
      } catch {
        // Color guide image is best-effort; fallback to selected/uploaded images.
      }
    }

    if (needsDerivedLayout || (parsed.detailImageIndices ?? []).length < 2) {
      for (const [index, key] of GENERATED_DETAIL_IMAGE_KEYS.entries()) {
        try {
          const url = await this.heroImageService.generateDetailCutImage({
            organizationId: input.organizationId,
            productName: input.rawInput.rawTitle,
            category: input.rawInput.rawCategory,
            description: input.rawInput.rawDescription,
            options: input.rawInput.rawOptions,
            imageUrls: this.pickSectionSourceImages(parsed.detailImageIndices ?? [], input.rawInput.imageUrls),
            variant: index + 1,
          });
          processedImages[key] = url;
        } catch {
          // Detail support images are best-effort; fallback to selected/uploaded images.
        }
      }
    }
  }

  private pickSizeGuideSourceImages(
    parsed: DetailPageGeneration | BoldVerticalGeneration,
    imageUrls: string[],
  ): string[] {
    const sizeIndices = (parsed as BoldVerticalGeneration).size?.imageIndices ?? [];
    return this.pickSectionSourceImages(sizeIndices, imageUrls);
  }

  private pickSectionSourceImages(indices: number[], imageUrls: string[]): string[] {
    const picked = indices
      .map((idx) => imageUrls[idx])
      .filter((url): url is string => typeof url === 'string' && url.trim() !== '');
    return Array.from(new Set([...picked, ...imageUrls]))
      .filter((url) => typeof url === 'string' && url.trim() !== '');
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
  ): BoldVerticalGeneration {
    const safetyIndices = new Set(
      rawInput.imageUrls
        .map((url, index) => ({ url, index }))
        .filter(({ url }) => isSafetyLabelImageUrl(url))
        .map(({ index }) => index),
    );
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
        imageIndices: cleanIndices(parsed.color.imageIndices, 6),
      },
      usage: {
        ...parsed.usage,
        imageIndices: cleanIndices(parsed.usage.imageIndices, 4),
      },
      detailImageIndices,
      packageImageIndices,
      packageLabel: packageImageIndices.length > 0 ? parsed.packageLabel : '',
    };
  }

  private packagePreference(
    rawInput: { rawDescription?: string; rawOptions?: string },
  ): 'none' | 'exists' | 'auto' {
    const raw = `${rawInput.rawDescription ?? ''}\n${rawInput.rawOptions ?? ''}`;
    if (/박스\/세트\s*정보\s*:\s*없음/u.test(raw)) return 'none';
    if (/박스\/세트\s*정보\s*:\s*있음/u.test(raw)) return 'exists';
    return 'auto';
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

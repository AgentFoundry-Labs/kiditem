import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  DetailPageGenerationSchema,
  SINGLE_CALL_SYSTEM,
  buildSingleCallUser,
  type DetailPageGeneration,
} from '../../domain/prompts/detail-page/single-call';
import {
  SimpleVerticalGenerationSchema,
  SIMPLE_VERTICAL_SYSTEM,
  buildSimpleVerticalUser,
  type SimpleVerticalGeneration,
} from '../../domain/prompts/simple-vertical/single-call';
import type { GenerateDetailPageBodyDto } from '../../adapter/in/http/dto';
import {
  TEXT_COMPLETION_PORT,
  type TextCompletionPort,
} from '../port/out/text-completion.port';

export interface DetailPageGenerationDto {
  id: string;
  productId: string | null;
  templateId: 'kids-playful' | 'simple-vertical';
  productName: string;
  rawInput: unknown;
  result: DetailPageGeneration | SimpleVerticalGeneration | unknown;
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
  ) {}

  async generate(
    dto: GenerateDetailPageBodyDto,
    organizationId: string,
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
    const rawInput = {
      rawTitle: dto.rawTitle,
      rawCategory: dto.rawCategory,
      rawDescription: dto.rawDescription,
      rawOptions: dto.rawOptions,
      imageUrls: dto.imageUrls,
      heroImageMode,
      templateId,
    };

    const isSimpleVertical = templateId === 'simple-vertical';

    if (dto.productId) {
      const row = await this.prisma.contentGeneration.create({
        data: {
          organizationId,
          masterId: dto.productId,
          originalImages: dto.imageUrls,
          processedImages: {},
          generatedTitle: dto.rawTitle.slice(0, 80),
          detailPageHtml: JSON.stringify({
            templateId,
            result: {},
            imageUrls: dto.imageUrls,
            rawInput,
          }),
          status: 'PROCESSING',
        },
      });

      void this.completeStoredGeneration({
        rowId: row.id,
        organizationId,
        rawInput,
        heroImageMode,
        templateId,
        fallbackTitle: dto.rawTitle,
        model,
        isSimpleVertical,
      });

      return this.toDto(row);
    }

    const parsed = await this.generateParsed({
      rawInput,
      heroImageMode,
      templateId,
      model,
      isSimpleVertical,
    });
    const productName = this.pickProductName(parsed, templateId, dto.rawTitle);

    return {
      id: `standalone-${randomUUID()}`,
      productId: null,
      templateId,
      productName,
      rawInput,
      result: parsed,
      imageUrls: dto.imageUrls,
      processedImages: {},
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
    if (templateId && templateId !== 'kids-playful' && templateId !== 'simple-vertical') {
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
    return {
      id: row.id,
      productId: row.masterId,
      templateId: stored.templateId,
      productName: row.generatedTitle ?? stored.rawTitle ?? '상세페이지',
      rawInput: stored.rawInput,
      result: stored.result,
      imageUrls,
      processedImages: this.asStringRecord(row.processedImages),
      imageProcessingStatus: this.mapStatus(row.status),
      imageProcessingError: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private parseStoredDetail(raw: string | null): {
    templateId: 'kids-playful' | 'simple-vertical';
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
      const templateId = parsed.templateId === 'simple-vertical' ? 'simple-vertical' : 'kids-playful';
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
      return parsed.templateId === 'kids-playful' || parsed.templateId === 'simple-vertical';
    } catch {
      return false;
    }
  }

  private pickProductName(
    parsed: unknown,
    templateId: 'kids-playful' | 'simple-vertical',
    fallback: string,
  ): string {
    if (templateId === 'simple-vertical') {
      const hookText = (parsed as { hook?: { text?: unknown } }).hook?.text;
      return typeof hookText === 'string' && hookText.trim() ? hookText.trim() : fallback.slice(0, 50);
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

  private async completeStoredGeneration(input: {
    rowId: string;
    organizationId: string;
    rawInput: {
      rawTitle: string;
      rawCategory: string;
      rawDescription: string;
      rawOptions: string;
      imageUrls: string[];
      heroImageMode: 'first' | 'llm-pick';
      templateId: 'kids-playful' | 'simple-vertical';
    };
    heroImageMode: 'first' | 'llm-pick';
    templateId: 'kids-playful' | 'simple-vertical';
    fallbackTitle: string;
    model: string;
    isSimpleVertical: boolean;
  }): Promise<void> {
    try {
      const parsed = await this.generateParsed(input);
      const productName = this.pickProductName(parsed, input.templateId, input.fallbackTitle);
      await this.prisma.contentGeneration.updateMany({
        where: { id: input.rowId, organizationId: input.organizationId },
        data: {
          generatedTitle: productName,
          detailPageHtml: JSON.stringify({
            templateId: input.templateId,
            result: parsed,
            imageUrls: input.rawInput.imageUrls,
            rawInput: input.rawInput,
          }),
          status: 'READY',
          errorMessage: null,
        },
      });
    } catch (err) {
      await this.prisma.contentGeneration.updateMany({
        where: { id: input.rowId, organizationId: input.organizationId },
        data: {
          status: 'FAILED',
          errorMessage: err instanceof Error ? err.message : '상세페이지 생성 실패',
        },
      });
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
      templateId: 'kids-playful' | 'simple-vertical';
    };
    heroImageMode: 'first' | 'llm-pick';
    templateId: 'kids-playful' | 'simple-vertical';
    model: string;
    isSimpleVertical: boolean;
  }): Promise<DetailPageGeneration | SimpleVerticalGeneration> {
    const { text: rawText } = await this.textCompletion.complete({
      system: input.isSimpleVertical ? SIMPLE_VERTICAL_SYSTEM : SINGLE_CALL_SYSTEM,
      user: input.isSimpleVertical
        ? buildSimpleVerticalUser({ raw: input.rawInput, heroImageMode: input.heroImageMode })
        : buildSingleCallUser({ raw: input.rawInput, heroImageMode: input.heroImageMode }),
      temperature: 0.8,
      responseMimeType: 'application/json',
      model: input.model,
    });
    return (input.isSimpleVertical ? SimpleVerticalGenerationSchema : DetailPageGenerationSchema)
      .parse(this.extractJson(rawText));
  }

  private extractJson(raw: string): unknown {
    const trimmed = raw.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]+?)\n?```$/);
    const body = fenced ? fenced[1] : trimmed;
    return JSON.parse(body);
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { moveSafetyLabelImagesToEnd } from '../../domain/detail-page-image-order';
import type { DetailPageGenerationDto } from './detail-page-ai.types';
import { DetailPageResultRefinerService } from './detail-page-result-refiner.service';
import {
  normalizeStoredDetailPageRawInput,
  parseDetailPageStoredJson,
} from './detail-page-stored.helpers';

type DetailPageGenerationRow = {
  id: string;
  masterId: string;
  originalImages: unknown;
  processedImages: unknown;
  generatedTitle: string | null;
  detailPageHtml: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
};

@Injectable()
export class DetailPageQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resultRefiner: DetailPageResultRefinerService,
  ) {}

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

  toDto(row: DetailPageGenerationRow): DetailPageGenerationDto {
    const stored = parseDetailPageStoredJson(row.detailPageHtml);
    const imageUrls = stored.imageUrls.length > 0
      ? stored.imageUrls
      : (Array.isArray(row.originalImages) ? row.originalImages.filter((x): x is string => typeof x === 'string') : []);
    const orderedImageUrls = moveSafetyLabelImagesToEnd(imageUrls);
    const productName = row.generatedTitle ?? stored.rawTitle ?? '상세페이지';
    const rawInput = normalizeStoredDetailPageRawInput({
      stored,
      templateId: stored.templateId,
      productName,
      imageUrls: orderedImageUrls,
    });
    const result = this.resultRefiner.suppressProductInfoWhenSafetyLabelExists(
      stored.result,
      stored.templateId,
      orderedImageUrls,
    );
    return {
      id: row.id,
      productId: row.masterId,
      templateId: stored.templateId,
      productName,
      rawInput,
      result,
      imageUrls: orderedImageUrls,
      processedImages: this.asStringRecord(row.processedImages),
      imageProcessingStatus: this.mapStatus(row.status),
      imageProcessingError: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
    };
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
}

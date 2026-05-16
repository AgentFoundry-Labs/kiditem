import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { ThumbnailEditorInputImage } from '../../domain/model/thumbnail-editor';

interface GeneratedCandidateInput {
  organizationId: string;
  triggeredByUserId: string | null;
  title: string;
  category?: string | null;
  description?: string | null;
  platform: 'kiditem-detail-page' | 'kiditem-thumbnail';
  sourceKind: 'detail_page_generation' | 'thumbnail_generation';
  imageUrls: string[];
  rawData: Record<string, unknown>;
  imageSource: string;
}

interface SelfCollectedDetailPageCandidateInput {
  organizationId: string;
  triggeredByUserId: string | null;
  title: string;
  category: string | null;
  description: string | null;
  imageUrls: string[];
  rawData: Record<string, unknown>;
}

@Injectable()
export class GeneratedContentCandidateService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureSelfCollectedDetailPageCandidate(
    input: SelfCollectedDetailPageCandidateInput,
  ): Promise<{ id: string; name: string; category: string | null }> {
    const sourceUrl = selfCollectedDetailPageSourceUrl(input.title);
    const existing = await this.prisma.sourcingCandidate.findFirst({
      where: {
        organizationId: input.organizationId,
        sourceUrl,
        sourcePlatform: 'kiditem-detail-page',
        status: 'sourced',
        isDeleted: false,
      },
      select: { id: true, name: true, category: true },
    });
    if (existing) return existing;

    try {
      return await this.create(
        {
          organizationId: input.organizationId,
          triggeredByUserId: input.triggeredByUserId,
          title: input.title,
          category: input.category,
          description: input.description,
          platform: 'kiditem-detail-page',
          sourceKind: 'detail_page_generation',
          imageUrls: input.imageUrls,
          imageSource: 'detail-page-generation-input',
          rawData: {
            ...input.rawData,
            sourceUrl,
            sourcePlatform: 'kiditem-detail-page',
            normalizedTitle: normalizeSelfCollectedTitle(input.title),
          },
        },
        sourceUrl,
      );
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const raced = await this.prisma.sourcingCandidate.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceUrl,
          sourcePlatform: 'kiditem-detail-page',
          status: 'sourced',
          isDeleted: false,
        },
        select: { id: true, name: true, category: true },
      });
      if (!raced) throw error;
      return raced;
    }
  }

  async create(
    input: GeneratedCandidateInput,
    sourceUrl = `kiditem://generated-content/${input.sourceKind}/${randomUUID()}`,
  ): Promise<{ id: string; name: string; category: string | null }> {
    const imageUrls = uniqueUrls(input.imageUrls);
    const candidate = await this.prisma.sourcingCandidate.create({
      data: {
        organizationId: input.organizationId,
        sourceUrl,
        sourcePlatform: input.platform,
        rawData: {
          ...input.rawData,
          source: input.sourceKind,
          imageUrls,
          image_urls: imageUrls,
        } as Prisma.InputJsonValue,
        name: safeTitle(input.title),
        description: input.description ?? '',
        category: input.category ?? null,
        tags: [],
        thumbnailUrl: imageUrls[0] ?? null,
        imageUrl: imageUrls[0] ?? null,
        triggeredByUserId: input.triggeredByUserId,
        status: 'sourced',
        images: imageUrls.length > 0
          ? {
              create: imageUrls.map((url, index) => ({
                organizationId: input.organizationId,
                url,
                role: index === 0 ? 'product' : 'detail',
                sortOrder: index,
                source: input.imageSource,
                isPrimary: index === 0,
              })),
            }
          : undefined,
      },
      select: { id: true, name: true, category: true },
    });
    return candidate;
  }

  createFromThumbnailInputs(input: {
    organizationId: string;
    triggeredByUserId: string | null;
    productName: string | null;
    productDescription?: string | null;
    category?: string | null;
    mode: 'edit' | 'creative';
    inputs: ThumbnailEditorInputImage[];
    request: Record<string, unknown>;
  }): Promise<{ id: string; name: string; category: string | null }> {
    const imageUrls = input.inputs.map((image) => image.url).filter(Boolean);
    return this.create({
      organizationId: input.organizationId,
      triggeredByUserId: input.triggeredByUserId,
      title: input.productName ?? '썸네일 생성 후보',
      category: input.category ?? null,
      description: input.productDescription ?? null,
      platform: 'kiditem-thumbnail',
      sourceKind: 'thumbnail_generation',
      imageUrls,
      imageSource: 'thumbnail-editor-upload',
      rawData: {
        mode: input.mode,
        inputs: input.inputs.map((image) => ({
          url: image.url,
          storageKey: image.storageKey,
          role: image.role,
          label: image.label,
          source: image.source,
        })),
        request: input.request,
      },
    });
  }
}

function uniqueUrls(urls: string[]): string[] {
  return [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
}

function safeTitle(value: string): string {
  const trimmed = value.trim();
  return (trimmed || '생성 콘텐츠 후보').slice(0, 120);
}

function normalizeSelfCollectedTitle(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
  return normalized || '상세페이지작업';
}

function selfCollectedDetailPageSourceUrl(title: string): string {
  return `kiditem://self-collected/detail-page/${encodeURIComponent(normalizeSelfCollectedTitle(title))}`;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002';
}

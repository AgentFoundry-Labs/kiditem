import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { paginationParams } from '../../../common/pagination';
import {
  SOURCING_AGENT_GATEWAY_PORT,
  type SourcingAgentGatewayPort,
} from '../port/out/sourcing-agent.gateway.port';
import {
  SOURCING_OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../port/out/operation-alert.port';
import {
  SOURCING_CANDIDATE_REPOSITORY_PORT,
  type SourcingCandidateRepositoryPort,
} from '../port/out/sourcing-candidate.repository.port';
import type {
  CreateProductGenerationCommand,
  ReceiveExtensionDataInput,
  RegisterManualProductCommand,
} from '../port/in/sourcing.commands';
import type { ProductGenerationTask } from '../../../ai/application/port/in/product-generation-ai-trigger.port';
import { buildProductBasics } from './product-basics.presenter';
import { ProductPreparationSelectionService } from './product-preparation-selection.service';

const PLATFORM_MAP: Record<string, string> = {
  '1688': 'ALIBABA_1688',
  alibaba: 'ALIBABA',
  taobao: 'TAOBAO',
  tiktok: 'TIKTOK',
};

const MANUAL_PRODUCT_REGISTRATION_PLATFORM = 'KIDITEM_PRODUCT_REGISTRATION';
const COLLECTED_PRODUCT_INBOX_PLATFORMS = [
  'ALIBABA_1688',
  'ALIBABA',
  MANUAL_PRODUCT_REGISTRATION_PLATFORM,
] as const;

const PRODUCT_IMAGE_FIELD_KEYS = [
  'images', 'imageUrls', 'image_urls', 'mainImages', 'main_images',
  'mainImage', 'main_image', 'offerImgList',
] as const;

const DESCRIPTION_IMAGE_FIELD_KEYS = [
  'description_images', 'detail_images', 'images', 'imageUrls', 'image_urls',
] as const;

type FlatExtensionData = ReceiveExtensionDataInput;

@Injectable()
export class SourcingService {
  constructor(
    @Inject(SOURCING_CANDIDATE_REPOSITORY_PORT)
    private readonly candidates: SourcingCandidateRepositoryPort,
    @Inject(SOURCING_AGENT_GATEWAY_PORT)
    private readonly agentGateway: SourcingAgentGatewayPort,
    @Inject(SOURCING_OPERATION_ALERT_PORT)
    private readonly operationAlerts: OperationAlertPort,
    @Optional()
    private readonly preparationSelection?: ProductPreparationSelectionService,
  ) {}

  async receiveExtensionData(
    data: FlatExtensionData,
    organizationId: string,
    triggeredByUserId: string | null,
  ): Promise<{ ok: boolean; message: string; product_count: number }> {
    const pageType = data.page_type || 'detail';
    const sourceUrl = this.sourceUrlFrom(data);

    if (pageType === 'detail' && data.title && sourceUrl) {
      const price = this.extractCostCny(data);
      const incomingImages = this.extractProductImageUrls(data as Record<string, unknown>);
      const platform = PLATFORM_MAP[String(data.source_platform || '').toLowerCase()] || (data.source_platform as string) || 'unknown';

      await this.candidates.upsertSourced({
        organizationId,
        sourceUrl,
        sourcePlatform: platform,
        rawData: data as Record<string, unknown>,
        name: data.title as string,
        description: (data.description as string) || '',
        category: (data.category_name as string) || null,
        tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
        thumbnailUrl: incomingImages[0] || null,
        imageUrl: incomingImages[0] || null,
        costCny: price,
        triggeredByUserId,
        images: incomingImages.map((url, index) => ({
          url,
          role: 'product',
          label: null,
          sortOrder: index,
          source: 'sourcing-extension',
          isPrimary: index === 0,
        })),
      });
      return { ok: true, message: `received detail data from ${platform}`, product_count: 1 };
    }

    if (pageType === 'description' && sourceUrl) {
      const incomingImages = this.extractDescriptionImageUrls(data as Record<string, unknown>);
      const merged = await this.candidates.mergeDescription({
        organizationId,
        sourceUrl,
        rawData: data as Record<string, unknown>,
        description: typeof data.description_text === 'string' && data.description_text.trim()
          ? data.description_text : null,
        thumbnailUrl: null,
        imageUrl: null,
        images: incomingImages.map((url, index) => ({
          url,
          role: 'detail',
          label: null,
          sortOrder: index,
          source: 'sourcing-extension-description',
          isPrimary: false,
        })),
      });
      return {
        ok: true,
        message: `received description data from ${data.source_platform}`,
        product_count: merged ? 1 : 0,
      };
    }

    if (pageType === 'search') {
      return {
        ok: true,
        message: `received search data from ${data.source_platform}`,
        product_count: Number(data.total_found || 0),
      };
    }

    return { ok: true, message: 'received', product_count: 0 };
  }

  async registerManualProduct(
    data: RegisterManualProductCommand,
    organizationId: string,
    triggeredByUserId: string | null,
  ) {
    const title = data.title.trim();
    const imageUrls = this.uniqueNonEmptyStrings(data.imageUrls);
    if (!title) throw new BadRequestException('상품명을 입력해 주세요.');
    if (imageUrls.length === 0) throw new BadRequestException('상품 이미지를 1장 이상 추가해 주세요.');

    const thumbnailUrls = this.uniqueNonEmptyStrings(data.thumbnailUrls ?? []).slice(0, 10);
    const thumbnailUrl = typeof data.thumbnailUrl === 'string' && data.thumbnailUrl.trim()
      ? data.thumbnailUrl.trim()
      : thumbnailUrls[0] ?? imageUrls[0];
    const allThumbnailUrls = this.uniqueNonEmptyStrings([thumbnailUrl, ...thumbnailUrls]).slice(0, 10);
    const primaryImageUrl = imageUrls.includes(thumbnailUrl) ? thumbnailUrl : imageUrls[0];
    const category = typeof data.category === 'string' && data.category.trim()
      ? data.category.trim()
      : null;
    const description = typeof data.description === 'string' && data.description.trim()
      ? data.description.trim()
      : '';
    const optionNames = this.uniqueNonEmptyStrings(data.optionNames ?? []);
    const keywords = this.uniqueNonEmptyStrings(data.keywords ?? []).slice(0, 10);
    const sourceUrl = `kiditem://manual-product-registration/${randomUUID()}`;
    const candidate = await this.candidates.upsertSourced({
      organizationId,
      sourceUrl,
      sourcePlatform: MANUAL_PRODUCT_REGISTRATION_PLATFORM,
      rawData: {
        source: 'kiditem_product_registration',
        title,
        category,
        description,
        target: data.target ?? null,
        ageGroup: data.ageGroup ?? null,
        kcCertificationStatus: data.kcCertificationStatus ?? null,
        kcCertificationNumber: data.kcCertificationNumber ?? null,
        productSize: data.productSize ?? null,
        colorVariantStatus: data.colorVariantStatus ?? null,
        colorVariantNames: data.colorVariantNames ?? null,
        boxSetStatus: data.boxSetStatus ?? null,
        boxSetQuantity: data.boxSetQuantity ?? null,
        thumbnailUrl,
        thumbnailUrls: allThumbnailUrls,
        imageUrls,
        optionNames,
        keywords,
      },
      name: title,
      description,
      category,
      tags: optionNames,
      thumbnailUrl,
      imageUrl: thumbnailUrl,
      costCny: null,
      triggeredByUserId,
      images: imageUrls.map((url, index) => ({
        url,
        role: 'product',
        label: null,
        sortOrder: index,
        source: 'kiditem-product-registration',
        isPrimary: url === primaryImageUrl,
      })),
    });

    return {
      ok: true,
      message: '상품 등록 후보가 생성되었습니다.',
      product_count: 1,
      candidateId: candidate.id,
      href: `/product-pipeline/collected-products/${encodeURIComponent(candidate.id)}`,
    };
  }

  async createProductGeneration(
    data: CreateProductGenerationCommand,
    organizationId: string,
    triggeredByUserId: string | null,
  ) {
    const thumbnailUrls = this.uniqueNonEmptyStrings(data.thumbnailUrls ?? []).slice(0, 10);
    const representativeThumbnailUrl = typeof data.thumbnailUrl === 'string' && data.thumbnailUrl.trim()
      ? data.thumbnailUrl.trim()
      : thumbnailUrls[0] ?? null;
    const candidate = await this.registerManualProduct(
      data,
      organizationId,
      triggeredByUserId,
    );
    const ai = await this.agentGateway.startProductGeneration({
      organizationId,
      triggeredByUserId,
      candidateId: candidate.candidateId,
      productName: data.title.trim(),
      category: data.category ?? null,
      description: data.description ?? null,
      target: data.target ?? null,
      imageUrls: this.uniqueNonEmptyStrings(data.imageUrls),
      thumbnailUrl: representativeThumbnailUrl,
      optionNames: this.uniqueNonEmptyStrings(data.optionNames ?? []),
      templateId: data.templateId ?? 'bold-vertical',
      ageGroup: data.ageGroup ?? 'age-8-plus',
      detailImageCount: data.detailImageCount ?? '2',
      usageSectionMode: data.usageSectionMode ?? 'include',
      kcCertificationStatus: data.kcCertificationStatus ?? 'unknown',
      kcCertificationNumber: data.kcCertificationNumber ?? null,
      productSize: data.productSize ?? null,
      colorVariantStatus: data.colorVariantStatus ?? 'auto',
      colorVariantNames: data.colorVariantNames ?? null,
      boxSetStatus: data.boxSetStatus ?? 'auto',
      boxSetQuantity: data.boxSetQuantity ?? null,
    });
    return {
      ok: true,
      message: '상품 생성 작업이 시작되었습니다.',
      product_count: 1,
      candidateId: candidate.candidateId,
      href: ai.href,
      parentOperationKey: ai.parentOperationKey,
      detailGenerationId: ai.detailGenerationId,
      thumbnailGenerationId: ai.thumbnailGenerationId,
      contentWorkspaceId: ai.contentWorkspaceId,
    };
  }

  async quickProcessCandidate(
    candidateId: string,
    organizationId: string,
    triggeredByUserId: string | null,
    task: ProductGenerationTask = 'all',
  ) {
    const candidate = await this.candidates.findById(candidateId, organizationId);
    if (!candidate) throw new NotFoundException('Sourcing candidate not found');

    const rawData = this.plainRecord(candidate.rawData);
    const candidateImageUrls = candidate.images
      .filter((image) => image.role === 'product')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((image) => image.url);
    const fallbackImageUrls = [
      ...this.extractProductImageUrls(rawData),
      candidate.imageUrl ?? '',
      candidate.thumbnailUrl ?? '',
    ];
    const imageUrls = this.uniqueNonEmptyStrings(
      candidateImageUrls.length > 0 ? candidateImageUrls : fallbackImageUrls,
    );
    const rawOptionNames = this.stringArrayFromUnknown(rawData.optionNames ?? rawData.options);
    const optionNames = this.uniqueNonEmptyStrings([
      ...rawOptionNames,
      ...this.stringArrayFromUnknown(candidate.tags),
    ]);
    const target = typeof rawData.target === 'string' ? rawData.target : null;
    await this.preparationSelection?.ensureRegistrationInputFromCandidate(organizationId, candidateId);

    const ai = await this.agentGateway.startProductGeneration({
      organizationId,
      triggeredByUserId,
      candidateId,
      productName: candidate.name,
      category: candidate.category,
      description: candidate.description,
      target,
      imageUrls,
      thumbnailUrl: candidate.thumbnailUrl ?? imageUrls[0] ?? null,
      optionNames,
      templateId: 'bold-vertical',
      ageGroup: 'age-8-plus',
      detailImageCount: '2',
      usageSectionMode: 'include',
      kcCertificationStatus: 'unknown',
      kcCertificationNumber: null,
      productSize: null,
      colorVariantStatus: 'auto',
      colorVariantNames: null,
      boxSetStatus: 'auto',
      boxSetQuantity: null,
      task,
    });

    return {
      ok: true,
      message: quickProcessMessage(task),
      product_count: 1,
      candidateId: ai.candidateId,
      href: ai.href,
      parentOperationKey: ai.parentOperationKey,
      detailGenerationId: ai.detailGenerationId,
      thumbnailGenerationId: ai.thumbnailGenerationId,
      contentWorkspaceId: ai.contentWorkspaceId,
    };
  }

  async scrapeUrl(url: string, organizationId: string, triggeredByUserId: string | null) {
    const result = await this.agentGateway.scrapeUrl({ organizationId, url, triggeredByUserId });
    if (result.requestId) {
      await this.operationAlerts.start({
        organizationId,
        operationKey: `sourcing-scrape:${result.requestId}`,
        type: 'sourcing_scrape_url',
        title: '소싱 URL 스크래핑 진행 중',
        sourceType: 'agent_run_request',
        sourceId: result.requestId,
        actorUserId: triggeredByUserId,
        href: '/product-pipeline/collected-products',
        metadata: { agentType: 'sourcing', url },
      });
    }
    return { ok: true, message: '스크래핑 작업이 대기열에 등록되었습니다.', taskId: result.taskId };
  }

  async listProducts(
    query: { page?: string | number; limit?: string | number; platform?: string; sort?: string },
    organizationId: string,
  ) {
    const { page, limit } = paginationParams(query);
    const sort = query.sort === 'oldest' ? 'oldest' : query.sort === 'name_asc' ? 'name_asc' : 'newest';
    const platform = query.platform ? (PLATFORM_MAP[query.platform.toLowerCase()] || query.platform) : undefined;
    return this.candidates.listSourced({
      organizationId,
      page,
      limit,
      sort,
      platform,
      sourcePlatforms: platform ? undefined : [...COLLECTED_PRODUCT_INBOX_PLATFORMS],
    });
  }

  async getProduct(productId: string, organizationId: string) {
    const row = await this.candidates.findById(productId, organizationId);
    if (!row) throw new NotFoundException('Sourcing candidate not found');
    return {
      ...row,
      basicInfo: buildProductBasics({
        candidate: row,
        preparation: row.productPreparation,
      }),
    };
  }

  // ── helpers ──
  private extractCostCny(data: FlatExtensionData): number | null {
    if (data.price != null) {
      const p = typeof data.price === 'number' ? data.price : parseFloat(String(data.price));
      if (!isNaN(p) && p > 0) return p;
    }
    if (typeof data.priceRange === 'string' && data.priceRange.includes('-')) {
      const min = parseFloat(data.priceRange.split('-')[0]);
      if (!isNaN(min) && min > 0) return min;
    }
    const offer = data.offer as Record<string, unknown> | undefined;
    if (offer?.price != null) {
      const p = parseFloat(String(offer.price));
      if (!isNaN(p) && p > 0) return p;
    }
    if (Array.isArray(data.skuProps)) {
      const prices = (data.skuProps as Array<Record<string, unknown>>)
        .map((s) => parseFloat(String(s?.price)))
        .filter((p) => !isNaN(p) && p > 0);
      if (prices.length > 0) return Math.min(...prices);
    }
    return null;
  }

  private normalizeImageUrl(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (trimmed.startsWith('//')) return `https:${trimmed}`;
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
      return null;
    }
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      for (const key of ['url', 'src', 'imageUrl', 'image_url', 'fullPathImageURI', 'fullPathImageUrl']) {
        const normalized = this.normalizeImageUrl(obj[key]);
        if (normalized) return normalized;
      }
    }
    return null;
  }

  private collectImageUrls(values: unknown[]): string[] {
    const urls: string[] = [];
    const push = (value: unknown) => {
      if (Array.isArray(value)) { for (const item of value) push(item); return; }
      const normalized = this.normalizeImageUrl(value);
      if (normalized) urls.push(normalized);
    };
    for (const value of values) push(value);
    return [...new Set(urls)];
  }

  private uniqueNonEmptyStrings(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }

  private stringArrayFromUnknown(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
  }

  private plainRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  }

  private extractProductImageUrls(data: Record<string, unknown>): string[] {
    return this.collectImageUrls(PRODUCT_IMAGE_FIELD_KEYS.map((key) => data[key]));
  }

  private extractDescriptionImageUrls(data: Record<string, unknown>): string[] {
    return this.collectImageUrls(DESCRIPTION_IMAGE_FIELD_KEYS.map((key) => data[key]));
  }

  private sourceUrlFrom(data: FlatExtensionData): string | null {
    return typeof data.source_url === 'string' && data.source_url.trim() ? data.source_url.trim() : null;
  }
}

function quickProcessMessage(task: ProductGenerationTask): string {
  if (task === 'detail') return '상세페이지 생성 작업이 시작되었습니다.';
  if (task === 'thumbnail') return '썸네일 생성 작업이 시작되었습니다.';
  return 'AI 간편 처리 작업이 시작되었습니다.';
}

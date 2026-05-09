import { Inject, Injectable, NotFoundException, NotImplementedException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { paginationParams } from '../../../common/pagination';
import { OperationAlertService } from '../../../automation/application/service/operation-alert.service';
import {
  SOURCING_AGENT_GATEWAY_PORT,
  type SourcingAgentGatewayPort,
} from '../port/out/sourcing-agent.gateway.port';
import {
  SOURCING_PRODUCTS_CATALOG_PORT,
  type SourcingProductsCatalogPort,
} from '../port/out/products-catalog.port';
import type { ReceiveExtensionDataDto } from '../../adapter/in/http/dto/receive-extension-data.dto';

const PLATFORM_MAP: Record<string, string> = {
  '1688': 'ALIBABA_1688',
  alibaba: 'ALIBABA',
  taobao: 'TAOBAO',
  tiktok: 'TIKTOK',
};

const IMAGE_FIELD_KEYS = [
  'images',
  'imageUrls',
  'image_urls',
  'mainImages',
  'main_images',
  'mainImage',
  'main_image',
  'offerImgList',
  'description_images',
  'detail_images',
] as const;

/**
 * Service-internal flat shape — DTO 의 known field + `extra` 가 평탄화된 형태.
 * controller 에서 build 후 service 로 넘어온다.
 */
type FlatExtensionData = ReceiveExtensionDataDto & Record<string, unknown>;

@Injectable()
export class SourcingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SOURCING_PRODUCTS_CATALOG_PORT)
    private readonly productsCatalog: SourcingProductsCatalogPort,
    @Inject(SOURCING_AGENT_GATEWAY_PORT)
    private readonly agentGateway: SourcingAgentGatewayPort,
    private readonly operationAlerts: OperationAlertService,
  ) {}

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
    if (Array.isArray(data.priceRanges) && data.priceRanges.length > 0) {
      const first = (data.priceRanges as Array<Record<string, unknown>>)[0];
      const p = parseFloat(String(first?.price));
      if (!isNaN(p) && p > 0) return p;
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
      if (Array.isArray(value)) {
        for (const item of value) push(item);
        return;
      }
      const normalized = this.normalizeImageUrl(value);
      if (normalized) urls.push(normalized);
    };
    for (const value of values) push(value);
    return [...new Set(urls)];
  }

  private extractImageUrls(data: Record<string, unknown>): string[] {
    return this.collectImageUrls(IMAGE_FIELD_KEYS.map((key) => data[key]));
  }

  private rawObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  }

  private mergeRawData(existing: unknown, incoming: Record<string, unknown>): Record<string, unknown> {
    const previous = this.rawObject(existing);
    const merged = { ...previous, ...incoming };
    const images = this.collectImageUrls([
      ...IMAGE_FIELD_KEYS.map((key) => previous[key]),
      ...IMAGE_FIELD_KEYS.map((key) => incoming[key]),
    ]);
    if (images.length > 0) merged.images = images;

    const descriptionImages = this.collectImageUrls([
      previous.description_images,
      incoming.description_images,
      previous.detail_images,
      incoming.detail_images,
    ]);
    if (descriptionImages.length > 0) merged.description_images = descriptionImages;

    return merged;
  }

  private sourceUrlFrom(data: FlatExtensionData): string | null {
    return typeof data.source_url === 'string' && data.source_url.trim() ? data.source_url.trim() : null;
  }

  private async ensureImageRows(organizationId: string, masterId: string, images: string[]): Promise<void> {
    if (images.length === 0) return;
    const existingCount = await this.prisma.masterProductImage.count({
      where: { organizationId, masterId, isDeleted: false },
    });
    if (existingCount > 0) return;
    await this.prisma.masterProductImage.createMany({
      data: images.map((url, index) => ({
        organizationId,
        masterId,
        url,
        role: 'product',
        label: null,
        sortOrder: index,
        source: 'sourcing-extension',
        isPrimary: index === 0,
      })),
    });
  }

  async receiveExtensionData(
    data: FlatExtensionData,
    organizationId: string,
  ): Promise<{
    ok: boolean;
    message: string;
    product_count: number;
  }> {
    const pageType = data.page_type || 'detail';
    let productCount = pageType === 'search'
      ? Number(data.total_found || 0)
      : (data.title ? 1 : 0);
    const sourceUrl = this.sourceUrlFrom(data);

    if (pageType === 'detail' && data.title) {
      const price = this.extractCostCny(data);
      const incomingImages = this.extractImageUrls(data);
      const productData = {
        name: data.title,
        description: data.description || '',
        thumbnailUrl: incomingImages[0] || null,
        imageUrl: incomingImages[0] || null,
        costCny: price,
        category: data.category_name || null,
        tags: data.tags || [],
        sourceUrl,
        sourcePlatform: PLATFORM_MAP[String(data.source_platform || '').toLowerCase()] || data.source_platform || null,
        pipelineStep: 'draft',
      };

      const existing = sourceUrl
        ? await this.prisma.masterProduct.findFirst({
          where: { sourceUrl, organizationId, isDeleted: false },
          select: { id: true, rawData: true },
        })
        : null;

      if (existing) {
        const normalizedRawData = this.mergeRawData(existing.rawData, data);
        const images = this.extractImageUrls(normalizedRawData);
        await this.prisma.masterProduct.updateMany({
          where: { id: existing.id, organizationId, isDeleted: false },
          data: {
            ...productData,
            rawData: normalizedRawData as object,
            thumbnailUrl: images[0] || productData.thumbnailUrl,
            imageUrl: images[0] || productData.imageUrl,
          },
        });
        await this.ensureImageRows(organizationId, existing.id, images);
      } else {
        // sourcing/AGENTS.md: master_products 의 새 write 는 products 도메인의
        // MastersService (MasterCodeService 통합) 를 SOURCING_PRODUCTS_CATALOG_PORT
        // 로 우회해야 한다. cross-domain 직접 import 금지.
        const normalizedRawData = this.mergeRawData(null, data);
        const images = this.extractImageUrls(normalizedRawData);
        const created = await this.productsCatalog.createMaster(organizationId, {
          name: productData.name,
          description: productData.description,
          thumbnailUrl: images[0] ?? productData.thumbnailUrl ?? undefined,
          imageUrl: images[0] ?? productData.imageUrl ?? undefined,
          images: images.map((url, index) => ({
            url,
            role: 'product' as const,
            label: null,
            sortOrder: index,
            source: 'sourcing-extension',
            isPrimary: index === 0,
          })),
          costCny: productData.costCny ?? undefined,
          category: productData.category ?? undefined,
          tags: productData.tags,
          sourceUrl: productData.sourceUrl ?? undefined,
          sourcePlatform: productData.sourcePlatform ?? undefined,
          pipelineStep: productData.pipelineStep,
        });
        await this.prisma.masterProduct.updateMany({
          where: { id: created.id, organizationId },
          data: { rawData: normalizedRawData as object },
        });
      }
    }

    if (pageType === 'description') {
      const existing = sourceUrl
        ? await this.prisma.masterProduct.findFirst({
          where: { sourceUrl, organizationId, isDeleted: false },
          select: { id: true, rawData: true, description: true, thumbnailUrl: true, imageUrl: true },
        })
        : null;

      if (existing) {
        const normalizedRawData = this.mergeRawData(existing.rawData, data);
        const images = this.extractImageUrls(normalizedRawData);
        await this.prisma.masterProduct.updateMany({
          where: { id: existing.id, organizationId, isDeleted: false },
          data: {
            rawData: normalizedRawData as object,
            description: typeof data.description_text === 'string' && data.description_text.trim()
              ? data.description_text
              : existing.description,
            thumbnailUrl: existing.thumbnailUrl ?? images[0] ?? null,
            imageUrl: existing.imageUrl ?? images[0] ?? null,
          },
        });
        await this.ensureImageRows(organizationId, existing.id, images);
        productCount = 1;
      }
    }

    return {
      ok: true,
      message: `received ${pageType} data from ${data.source_platform}`,
      product_count: productCount,
    };
  }

  async generateDetailPage(
    _productId: string,
    _body: {
      mode?: 'draft' | 'image' | 'full';
      templateId?: string;
      seed_hook_text?: string;
      seed_hook_title_sub?: string;
      seed_hero_image?: string;
    },
    _organizationId: string,
  ): Promise<{
    ok: true;
    taskId: string;
    mode: 'draft' | 'image' | 'full';
    templateId: string;
  }> {
    throw new NotImplementedException(
      'Sourcing detail-page Agent OS generation is disabled until sourcing candidates are modeled separately from MasterProduct.',
    );
  }

  async scrapeUrl(
    url: string,
    organizationId: string,
    triggeredByUserId: string | null,
  ): Promise<{ ok: boolean; message: string; taskId: string }> {
    const result = await this.agentGateway.scrapeUrl({
      organizationId,
      url,
      triggeredByUserId,
    });

    if (result.requestId) {
      await this.operationAlerts.start({
        organizationId,
        operationKey: `sourcing-scrape:${result.requestId}`,
        type: 'sourcing_scrape_url',
        title: '소싱 URL 스크래핑 진행 중',
        sourceType: 'agent_run_request',
        sourceId: result.requestId,
        actorUserId: triggeredByUserId,
        href: '/sourcing',
        metadata: {
          agentType: 'sourcing',
          url,
        },
      });
    }

    return {
      ok: true,
      message: '스크래핑 작업이 대기열에 등록되었습니다.',
      taskId: result.taskId,
    };
  }

  async listProducts(
    query: {
      page?: string | number;
      limit?: string | number;
      platform?: string;
      sort?: string;
      inProgressOnly?: string;
    },
    organizationId: string,
  ) {
    const { page, limit, skip } = paginationParams(query);
    const orderBy = query.sort === 'oldest'
      ? { createdAt: 'asc' as const }
      : query.sort === 'name_asc'
        ? { name: 'asc' as const }
        : { createdAt: 'desc' as const };
    const where = {
      organizationId,
      isDeleted: false,
      pipelineStep: query.inProgressOnly
        ? { in: ['processing', 'images_generating'] }
        : { not: null },
      ...(query.platform && {
        sourcePlatform: PLATFORM_MAP[query.platform.toLowerCase()] || query.platform,
      }),
    };
    const [total, items] = await Promise.all([
      this.prisma.masterProduct.count({ where }),
      this.prisma.masterProduct.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
    ]);
    return { items, total, page, limit };
  }

  async getProduct(productId: string, organizationId: string) {
    const product = await this.prisma.masterProduct.findFirst({
      where: {
        id: productId,
        organizationId,
        isDeleted: false,
        pipelineStep: { not: null },
      },
      include: {
        images: {
          where: { isDeleted: false },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!product) throw new NotFoundException('Sourcing product not found');
    return product;
  }
}

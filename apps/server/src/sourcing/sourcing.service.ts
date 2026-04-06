import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentRegistryService } from '../agent-registry/agent-registry.service';
import { paginationParams } from '../common/pagination';

const PLATFORM_MAP: Record<string, string> = {
  '1688': 'ALIBABA_1688',
  alibaba: 'ALIBABA',
  taobao: 'TAOBAO',
  tiktok: 'TIKTOK',
};

@Injectable()
export class SourcingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRegistry: AgentRegistryService,
  ) {}

  private extractCostCny(data: any): number | null {
    // Direct price field
    if (data.price != null) {
      const p = typeof data.price === 'number' ? data.price : parseFloat(String(data.price));
      if (!isNaN(p) && p > 0) return p;
    }
    // Price range (e.g., "12.5-18.0" → take minimum)
    if (typeof data.priceRange === 'string' && data.priceRange.includes('-')) {
      const min = parseFloat(data.priceRange.split('-')[0]);
      if (!isNaN(min) && min > 0) return min;
    }
    // Nested offer price
    if (data.offer?.price != null) {
      const p = parseFloat(String(data.offer.price));
      if (!isNaN(p) && p > 0) return p;
    }
    // SKU prices (take minimum)
    if (Array.isArray(data.skuProps)) {
      const prices = data.skuProps
        .map((s: any) => parseFloat(String(s.price)))
        .filter((p: number) => !isNaN(p) && p > 0);
      if (prices.length > 0) return Math.min(...prices);
    }
    // Price tiers (take first tier price)
    if (Array.isArray(data.priceRanges) && data.priceRanges.length > 0) {
      const p = parseFloat(String(data.priceRanges[0].price));
      if (!isNaN(p) && p > 0) return p;
    }
    return null;
  }

  async receiveExtensionData(data: any, companyId: string): Promise<{
    ok: boolean;
    message: string;
    product_count: number;
  }> {
    const pageType = data.page_type || 'detail';
    const platform = PLATFORM_MAP[data.source_platform?.toLowerCase()] || 'OTHER';
    const productCount = pageType === 'search' ? (data.total_found || 0) : (data.title ? 1 : 0);

    if (pageType === 'detail' && data.title) {
      const price = this.extractCostCny(data);
      const images: string[] = data.images || [];
      const productData = {
        name: data.title,
        description: data.description || '',
        rawData: data as any,
        thumbnailUrl: images[0] || null,
        costCny: price,
        category: data.category_name || null,
        tags: data.tags || [],
      };

      const existing = await this.prisma.product.findFirst({
        where: { sourceUrl: data.source_url },
      });

      if (existing) {
        await this.prisma.product.update({
          where: { id: existing.id },
          data: productData,
        });
      } else {
        await this.prisma.product.create({
          data: {
            ...productData,
            companyId,
            sourceUrl: data.source_url,
            sourcePlatform: platform,
          },
        });
      }
    }

    return {
      ok: true,
      message: `received ${pageType} data from ${data.source_platform}`,
      product_count: productCount,
    };
  }

  async scrapeUrl(url: string, companyId: string): Promise<{ ok: boolean; message: string; taskId: string }> {
    const result = await this.agentRegistry.runByType('sourcing', {
      companyId,
      extra: { action: 'scrape_url', url, company_id: companyId },
    });

    return {
      ok: true,
      message: `스크래핑 작업이 대기열에 등록되었습니다.`,
      taskId: result.taskId,
    };
  }

  async listProducts(query: { page?: string; limit?: string; platform?: string }) {
    const { page, limit, skip } = paginationParams(query);
    const where = {
      status: { in: ['draft', 'processing', 'processed'] as string[] },
      ...(query.platform && {
        sourcePlatform: PLATFORM_MAP[query.platform.toLowerCase()] || query.platform,
      }),
    };
    const [total, items] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);
    return { items, total, page, limit };
  }
}

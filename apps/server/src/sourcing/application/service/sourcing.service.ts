import { Inject, Injectable, NotImplementedException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { paginationParams } from '../../../common/pagination';
import {
  SOURCING_AGENT_GATEWAY_PORT,
  type SourcingAgentGatewayPort,
} from '../port/out/sourcing-agent.gateway.port';

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
    @Inject(SOURCING_AGENT_GATEWAY_PORT)
    private readonly agentGateway: SourcingAgentGatewayPort,
  ) {}

  private extractCostCny(data: any): number | null {
    if (data.price != null) {
      const p = typeof data.price === 'number' ? data.price : parseFloat(String(data.price));
      if (!isNaN(p) && p > 0) return p;
    }
    if (typeof data.priceRange === 'string' && data.priceRange.includes('-')) {
      const min = parseFloat(data.priceRange.split('-')[0]);
      if (!isNaN(min) && min > 0) return min;
    }
    if (data.offer?.price != null) {
      const p = parseFloat(String(data.offer.price));
      if (!isNaN(p) && p > 0) return p;
    }
    if (Array.isArray(data.skuProps)) {
      const prices = data.skuProps
        .map((s: any) => parseFloat(String(s.price)))
        .filter((p: number) => !isNaN(p) && p > 0);
      if (prices.length > 0) return Math.min(...prices);
    }
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

      const existing = await this.prisma.masterProduct.findFirst({
        where: { sourceUrl: data.source_url, companyId },
      });

      if (existing) {
        await this.prisma.masterProduct.update({
          where: { id: existing.id },
          data: productData,
        });
      } else {
        // B2a 이후 MasterProduct.code required — MasterCodeService inject 필요.
        // sourcing full rewrite 는 Plan B3 (coupangProductId 정리 + sourcing ADR 동반).
        throw new NotImplementedException(
          'Sourcing extension create path requires Plan B3 — MasterCodeService integration',
        );
      }
    }

    return {
      ok: true,
      message: `received ${pageType} data from ${data.source_platform}`,
      product_count: productCount,
    };
  }

  async scrapeUrl(url: string, companyId: string): Promise<{ ok: boolean; message: string; taskId: string }> {
    const result = await this.agentGateway.scrapeUrl({ companyId, url });

    return {
      ok: true,
      message: '스크래핑 작업이 대기열에 등록되었습니다.',
      taskId: result.taskId,
    };
  }

  async listProducts(
    query: { page?: string | number; limit?: string | number; platform?: string },
    companyId: string,
  ) {
    const { page, limit, skip } = paginationParams(query);
    const where = {
      companyId,
      pipelineStep: { in: ['draft', 'processing', 'processed'] as string[] },
      ...(query.platform && {
        sourcePlatform: PLATFORM_MAP[query.platform.toLowerCase()] || query.platform,
      }),
    };
    const [total, items] = await Promise.all([
      this.prisma.masterProduct.count({ where }),
      this.prisma.masterProduct.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);
    return { items, total, page, limit };
  }
}

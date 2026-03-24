import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const PLATFORM_MAP: Record<string, string> = {
  '1688': 'ALIBABA_1688',
  alibaba: 'ALIBABA',
  taobao: 'TAOBAO',
  tiktok: 'TIKTOK',
};

@Injectable()
export class SourcingService {
  constructor(private readonly prisma: PrismaService) {}

  async receiveExtensionData(data: any, companyId: string) {
    const pageType = data.page_type || 'detail';
    const platform = PLATFORM_MAP[data.source_platform?.toLowerCase()] || 'OTHER';
    const productCount = pageType === 'search' ? (data.total_found || 0) : (data.title ? 1 : 0);

    if (pageType === 'detail' && data.title) {
      const existing = await this.prisma.product.findFirst({
        where: { sourceUrl: data.source_url },
      });

      if (existing) {
        await this.prisma.product.update({
          where: { id: existing.id },
          data: {
            name: data.title,
            description: data.description || '',
            rawData: data,
            thumbnailUrl: data.images?.[0] || null,
          },
        });
      } else {
        await this.prisma.product.create({
          data: {
            companyId,
            name: data.title,
            description: data.description || '',
            sourceUrl: data.source_url,
            sourcePlatform: platform,
            thumbnailUrl: data.images?.[0] || null,
            category: data.category_name || null,
            rawData: data,
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

  async scrapeUrl(url: string, companyId: string) {
    const task = await this.prisma.agentTask.create({
      data: {
        agentType: 'sourcing',
        input: { action: 'scrape_url', url } as any,
      },
    });

    return {
      ok: true,
      message: `스크래핑 작업이 대기열에 등록되었습니다.`,
      taskId: task.id,
    };
  }

  async listProducts(query: { limit?: string; platform?: string }) {
    const limit = parseInt(query.limit || '50');
    return this.prisma.product.findMany({
      where: {
        ...(query.platform && {
          sourcePlatform: PLATFORM_MAP[query.platform.toLowerCase()] || query.platform,
        }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

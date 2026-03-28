import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { paginationParams } from '../common/pagination';

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
      const price = data.price ? parseFloat(data.price) : null;
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

  async scrapeUrl(url: string, companyId: string) {
    const task = await this.prisma.agentTask.create({
      data: {
        agentType: 'sourcing',
        input: { action: 'scrape_url', url, company_id: companyId } as any,
      },
    });

    await this.prisma.$executeRawUnsafe(`SELECT pg_notify('new_agent_task', $1)`, task.id);

    return {
      ok: true,
      message: `스크래핑 작업이 대기열에 등록되었습니다.`,
      taskId: task.id,
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

import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  paginationParams,
  type PaginatedResponse,
} from '../common/pagination';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: {
    page?: string;
    limit?: string;
  }): Promise<PaginatedResponse<Record<string, unknown>>> {
    try {
      const { page, limit, skip } = paginationParams(query);

      const productsData = await this.prisma.product.findMany({
        where: { status: 'active' },
        include: { company: true },
      });

      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

      const [reviewAgg, recentReviewAgg, orderCounts] = await Promise.all([
        this.prisma.review.groupBy({
          by: ['productId'],
          _count: true,
          _avg: { rating: true },
        }),
        this.prisma.review.groupBy({
          by: ['productId'],
          _count: true,
          where: { createdAt: { gte: thirtyDaysAgo } },
        }),
        this.prisma.coupangOrderItem.groupBy({
          by: ['sellerProductId'],
          _count: true,
        }),
      ]);

      const reviewMap = new Map(
        reviewAgg.map((r) => [
          r.productId,
          { total: r._count, avgRating: r._avg.rating ?? 0 },
        ]),
      );
      const recentMap = new Map(
        recentReviewAgg.map((r) => [r.productId, r._count]),
      );
      const orderCountMap = new Map(
        orderCounts
          .filter((o) => o.sellerProductId !== null)
          .map((o) => [o.sellerProductId!, o._count]),
      );

      const result = productsData.map((p) => {
        const review = reviewMap.get(p.id);
        return {
          productId: p.id,
          productName: p.name,
          sku: null,
          company: p.company?.name ?? 'N/A',
          grade: p.abcGrade ?? 'C',
          totalReviews: review?.total ?? 0,
          avgRating: Math.round((review?.avgRating ?? 0) * 10) / 10,
          recentReviews: recentMap.get(p.id) ?? 0,
          orderCount: orderCountMap.get(p.coupangProductId ?? '') ?? 0,
        };
      });

      result.sort((a, b) => b.totalReviews - a.totalReviews);

      const total = result.length;
      const items = result.slice(skip, skip + limit);
      return { items, total, page, limit };
    } catch {
      throw new InternalServerErrorException('리뷰 데이터 조회 실패');
    }
  }
}

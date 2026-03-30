import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  paginationParams,
  type PaginatedResponse,
} from '../../common/pagination';

interface ReviewProductItem {
  productId: string;
  productName: string;
  sku: string | null;
  company: string;
  grade: string;
  totalReviews: number;
  avgRating: number;
  recentReviews: number;
  orderCount: number;
}

interface ReviewSummary {
  totalReviewCount: number;
  weightedAvgRating: number;
  needsAttentionCount: number;
}

export interface ReviewsResponse extends PaginatedResponse<ReviewProductItem> {
  summary: ReviewSummary;
}

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: {
    page?: string;
    limit?: string;
  }): Promise<ReviewsResponse> {
    try {
      const { page, limit, skip } = paginationParams(query);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

      const [allActiveProducts, reviewAgg, recentReviewAgg, orderCounts] =
        await Promise.all([
          this.prisma.product.findMany({
            where: { status: 'active' },
            include: { company: true },
            orderBy: { createdAt: 'desc' },
          }),
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

      const allItems: ReviewProductItem[] = allActiveProducts.map((p) => {
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

      allItems.sort(
        (a, b) =>
          b.totalReviews - a.totalReviews ||
          a.productName.localeCompare(b.productName),
      );

      const totalReviewCount = allItems.reduce(
        (sum, item) => sum + item.totalReviews,
        0,
      );
      const weightedAvgRating =
        totalReviewCount > 0
          ? allItems.reduce(
              (sum, item) => sum + item.avgRating * item.totalReviews,
              0,
            ) / totalReviewCount
          : 0;
      const needsAttentionCount = allItems.filter(
        (item) => item.totalReviews < 5 || item.avgRating < 3.0,
      ).length;

      const total = allItems.length;
      const items = allItems.slice(skip, skip + limit);

      return {
        items,
        total,
        page,
        limit,
        summary: {
          totalReviewCount,
          weightedAvgRating: Math.round(weightedAvgRating * 10) / 10,
          needsAttentionCount,
        },
      };
    } catch {
      throw new InternalServerErrorException('리뷰 데이터 조회 실패');
    }
  }
}

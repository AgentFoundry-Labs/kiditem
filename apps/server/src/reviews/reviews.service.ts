import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    try {
      const productsData = await this.prisma.product.findMany({
        where: { status: 'active' },
        include: { company: true },
      });

      const allReviews = await this.prisma.review.findMany();

      const orderCounts = await this.prisma.coupangOrderItem.groupBy({
        by: ['sellerProductId'],
        _count: true,
      });

      const orderCountMap = new Map(
        orderCounts
          .filter((o) => o.sellerProductId !== null)
          .map((o) => [o.sellerProductId!, o._count]),
      );

      const reviewsByProduct = new Map<
        string,
        Array<{ rating: number; createdAt: Date }>
      >();
      for (const r of allReviews) {
        const arr = reviewsByProduct.get(r.productId) ?? [];
        arr.push({ rating: r.rating, createdAt: r.createdAt });
        reviewsByProduct.set(r.productId, arr);
      }

      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

      const result = productsData.map((p) => {
        const productReviews = reviewsByProduct.get(p.id) ?? [];
        const totalReviews = productReviews.length;
        const avgRating =
          totalReviews > 0
            ? productReviews.reduce((s, r) => s + r.rating, 0) / totalReviews
            : 0;
        const recentReviews = productReviews.filter(
          (r) => new Date(r.createdAt) >= thirtyDaysAgo,
        ).length;

        return {
          productId: p.id,
          productName: p.name,
          sku: null,
          company: p.company?.name ?? 'N/A',
          grade: p.abcGrade ?? 'C',
          totalReviews,
          avgRating: Math.round(avgRating * 10) / 10,
          recentReviews,
          orderCount: orderCountMap.get(p.coupangProductId ?? '') ?? 0,
        };
      });

      result.sort((a, b) => b.totalReviews - a.totalReviews);
      return result;
    } catch {
      throw new InternalServerErrorException('리뷰 데이터 조회 실패');
    }
  }
}

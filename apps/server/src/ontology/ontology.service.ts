import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OntologyService {
  constructor(private readonly prisma: PrismaService) {}

  async getGraph(): Promise<{
    nodes: { id: string; type: string; label: string; productCount: number; brandCount?: number; category?: string }[];
    edges: { id: string; source: string; target: string }[];
    stats: { totalProducts: number; totalCategories: number; totalBrands: number };
  }> {
    const rows: any[] = await this.prisma.$queryRaw`
      SELECT
        COALESCE(category, '미분류') AS category,
        COALESCE(brand, '미분류') AS brand,
        COUNT(*)::int AS product_count
      FROM products
      WHERE is_deleted = false
      GROUP BY category, brand
      ORDER BY category, product_count DESC
    `;

    const categoryMap = new Map<
      string,
      { productCount: number; brandCount: number }
    >();
    const brandNodes: any[] = [];
    const edges: any[] = [];

    for (const row of rows) {
      const cat = row.category;
      const brand = row.brand;
      const count = Number(row.product_count);

      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, { productCount: 0, brandCount: 0 });
      }
      const catInfo = categoryMap.get(cat)!;
      catInfo.productCount += count;
      catInfo.brandCount += 1;

      const brandId = `brand-${cat}-${brand}`;
      const catId = `cat-${cat}`;

      brandNodes.push({
        id: brandId,
        type: 'brand',
        label: brand,
        category: cat,
        productCount: count,
      });

      edges.push({
        id: `e-${catId}-${brandId}`,
        source: catId,
        target: brandId,
      });
    }

    const categoryNodes = Array.from(categoryMap.entries()).map(
      ([cat, info]) => ({
        id: `cat-${cat}`,
        type: 'category',
        label: cat,
        productCount: info.productCount,
        brandCount: info.brandCount,
      }),
    );

    const totalProducts = categoryNodes.reduce(
      (s, n) => s + n.productCount,
      0,
    );

    return {
      nodes: [...categoryNodes, ...brandNodes],
      edges,
      stats: {
        totalProducts,
        totalCategories: categoryNodes.length,
        totalBrands: brandNodes.length,
      },
    };
  }

  async getProducts(category: string, brand?: string) {
    const where: any = { isDeleted: false, category };
    if (brand) where.brand = brand;

    return this.prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        brand: true,
        category: true,
        status: true,
        abcGrade: true,
        thumbnailUrl: true,
      },
      take: 50,
      orderBy: { name: 'asc' },
    });
  }
}

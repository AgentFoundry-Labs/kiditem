import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { ProductAbcGrade } from '@kiditem/shared/product-abc';
import type { ProductVariantAbcGradeReadPort } from '../../../application/port/in/product-variant-abc-grade-read.port';

@Injectable()
export class ProductVariantAbcGradeReadAdapter implements ProductVariantAbcGradeReadPort {
  constructor(private readonly prisma: PrismaService) {}

  async findAbcGradesByProductVariantIds(input: {
    organizationId: string;
    productVariantIds: string[];
  }): Promise<Map<string, ProductAbcGrade[]>> {
    const ids = [...new Set(input.productVariantIds)].sort();
    const grades = new Map(ids.map((id) => [id, [] as ProductAbcGrade[]]));
    if (ids.length === 0) return grades;
    const rows = await this.prisma.productVariant.findMany({
      where: {
        organizationId: input.organizationId,
        id: { in: ids },
        masterProduct: { organizationId: input.organizationId },
      },
      select: { id: true, masterProduct: { select: { abcGrade: true } } },
    });
    for (const row of rows) {
      if (row.masterProduct.abcGrade === 'A' || row.masterProduct.abcGrade === 'B' || row.masterProduct.abcGrade === 'C') {
        grades.set(row.id, [row.masterProduct.abcGrade]);
      }
    }
    return grades;
  }
}

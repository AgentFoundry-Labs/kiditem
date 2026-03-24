import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ThumbnailsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    try {
      const data = await this.prisma.thumbnail.findMany({
        include: {
          product: {
            include: { company: true },
          },
        },
      });

      return data.map((t) => ({
        id: t.id,
        productId: t.productId,
        productName: t.product?.name ?? 'N/A',
        sku: null,
        company: t.product?.company?.name ?? 'N/A',
        grade: t.product?.abcGrade ?? 'C',
        imageUrl: t.imageUrl,
        clickRate: t.ctr ? Number(t.ctr) : 0,
        prevClickRate: 0,
        status: t.status,
        strategy: t.strategy,
        changePercent: 0,
      }));
    } catch {
      throw new InternalServerErrorException('썸네일 데이터 조회 실패');
    }
  }
}

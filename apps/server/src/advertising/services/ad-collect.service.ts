import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdCollectService {
  constructor(private readonly prisma: PrismaService) {}

  async startCollection(_period: string | undefined, _companyId: string) {
    return {
      status: 'extension_required',
      message: '크롬 익스텐션의 정보 수집 버튼을 사용하세요.',
    };
  }

  async getStatus(companyId: string) {
    try {
      const [lastCampaign, lastProduct, campaignCount, productCount] = await Promise.all([
        this.prisma.adSnapshot.findFirst({
          where: { companyId, level: 'campaign' },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        this.prisma.adSnapshot.findFirst({
          where: { companyId, level: 'product' },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        this.prisma.adSnapshot.count({ where: { companyId, level: 'campaign' } }),
        this.prisma.adSnapshot.count({ where: { companyId, level: 'product' } }),
      ]);

      return {
        lastCollectedAt: lastCampaign?.createdAt ?? lastProduct?.createdAt ?? null,
        campaignSnapshotCount: campaignCount,
        productSnapshotCount: productCount,
      };
    } catch (e) {
      if (e instanceof InternalServerErrorException) throw e;
      throw new InternalServerErrorException('수집 상태 조회 실패');
    }
  }
}

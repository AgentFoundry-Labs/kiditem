import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { kstDayStart } from '../common/kst';
import { ORDER_STATUSES, RETURN_STATUSES } from '../coupang/constants';

@Injectable()
export class CoupangDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(companyId: string) {
    const todayStart = kstDayStart(new Date());
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    const [todayOrders, pendingAccept, pendingReturns] = await Promise.all([
      this.prisma.coupangOrder.aggregate({
        _sum: { totalPrice: true },
        _count: true,
        where: {
          companyId,
          orderedAt: { gte: todayStart, lt: todayEnd },
        },
      }),
      this.prisma.coupangOrder.count({
        where: { companyId, status: ORDER_STATUSES.ACCEPT },
      }),
      this.prisma.coupangReturn.count({
        where: { companyId, receiptStatus: RETURN_STATUSES.UC },
      }),
    ]);

    return {
      todayOrders: {
        count: todayOrders._count,
        revenue: todayOrders._sum.totalPrice ?? 0,
      },
      pendingAccept,
      pendingReturns,
    };
  }
}

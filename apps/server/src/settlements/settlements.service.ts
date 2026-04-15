import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSettlementDto, UpdateSettlementDto } from './dto';

@Injectable()
export class SettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, period?: string) {
    const periodFilter =
      period?.length === 7
        ? { period }
        : period?.length === 4
          ? { period: { startsWith: period } }
          : undefined;

    return this.prisma.settlement.findMany({
      where: { companyId, ...periodFilter },
      orderBy: { period: 'desc' },
    });
  }

  async create(companyId: string, dto: CreateSettlementDto) {
    return this.prisma.settlement.create({
      data: {
        companyId,
        period: dto.period,
        expectedAmount: dto.expectedAmount,
        commission: dto.commission,
        shippingFee: dto.shippingFee,
        orderCount: dto.orderCount,
        returnCount: dto.returnCount,
      },
    });
  }

  async reconcile(companyId: string, period: string) {
    const [year, month] = period.split('-').map(Number);

    // 1. ProfitLoss records for the period
    const plRecords = await this.prisma.profitLoss.findMany({
      where: { companyId, year, month },
      include: {
        product: { select: { id: true, name: true, sku: true } },
      },
    });

    // 2. Orders for the same period
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 1);
    const orders = await this.prisma.order.findMany({
      where: {
        companyId,
        orderedAt: { gte: periodStart, lt: periodEnd },
        status: { notIn: ['cancelled', 'returned'] },
      },
      select: { productId: true, totalPrice: true, quantity: true },
    });

    // 3. Aggregate orders by productId
    const orderMap = new Map<string, { total: number; count: number }>();
    for (const o of orders) {
      if (!o.productId) continue;
      const entry = orderMap.get(o.productId) ?? { total: 0, count: 0 };
      entry.total += o.totalPrice;
      entry.count += 1;
      orderMap.set(o.productId, entry);
    }

    // 4. Match PL records with order data
    let totalPlRevenue = 0;
    let totalOrderRevenue = 0;
    let matchedCount = 0;
    let mismatchCount = 0;

    const details = plRecords.map((r) => {
      const orderData = orderMap.get(r.productId) ?? { total: 0, count: 0 };
      const revenueDiff = r.revenue - orderData.total;
      const absDiff = Math.abs(revenueDiff);
      const status = absDiff <= 100 ? 'matched' : absDiff <= 1000 ? 'minor_diff' : 'mismatch';

      totalPlRevenue += r.revenue;
      totalOrderRevenue += orderData.total;
      if (status === 'matched') matchedCount++;
      else mismatchCount++;

      return {
        productId: r.productId,
        productName: r.product.name,
        sku: r.product.sku ?? '',
        plRevenue: r.revenue,
        plCommission: r.commission,
        plNetProfit: r.netProfit,
        plOrderCount: r.orderCount,
        orderTotal: orderData.total,
        orderCount: orderData.count,
        revenueDiff,
        isMatched: status === 'matched',
        status,
      };
    });

    const productCount = details.length;
    const matchRate = productCount > 0
      ? Math.round((matchedCount / productCount) * 100)
      : 0;

    return {
      success: true,
      period,
      summary: {
        totalPlRevenue,
        totalOrderRevenue,
        totalCommission: plRecords.reduce((s, r) => s + r.commission, 0),
        totalShipping: plRecords.reduce((s, r) => s + r.shippingCost, 0),
        revenueDifference: totalPlRevenue - totalOrderRevenue,
        productCount,
        orderCount: orders.length,
        matchedCount,
        mismatchCount,
        matchRate,
      },
      details,
    };
  }

  async update(id: string, dto: UpdateSettlementDto) {
    const existing = await this.prisma.settlement.findUnique({ where: { id } });
    if (!existing) {
      throw new BadRequestException('정산 내역을 찾을 수 없습니다');
    }

    return this.prisma.settlement.update({
      where: { id },
      data: {
        ...(dto.actualAmount !== undefined && { actualAmount: dto.actualAmount }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ChannelAnalysis {
  channelName: string;
  channelType: string;
  totalOrders: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  returnCount: number;
  returnRate: number;
  avgOrderValue: number;
}

export interface SalesAnalysisResult {
  period: string;
  channels: ChannelAnalysis[];
  totals: {
    totalRevenue: number;
    totalProfit: number;
    totalOrders: number;
    totalCost: number;
  };
}

@Injectable()
export class SalesAnalysisService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnalysis(period?: string): Promise<SalesAnalysisResult> {
    const now = new Date();
    let year: number;
    let month: number;

    if (period && /^\d{4}-\d{2}$/.test(period)) {
      const [y, m] = period.split('-').map(Number);
      year = y;
      month = m;
    } else {
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }

    const periodStr = `${year}-${String(month).padStart(2, '0')}`;

    const plGroups = await this.prisma.profitLoss.groupBy({
      by: ['companyId'],
      where: { year, month },
      _sum: {
        revenue: true,
        netProfit: true,
        cogs: true,
        commission: true,
        shippingCost: true,
        adCost: true,
        otherCost: true,
        orderCount: true,
        returnCount: true,
      },
    });

    const companyIds = plGroups.map((g) => g.companyId);
    const companies = await this.prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, name: true },
    });
    const companyMap = new Map(companies.map((c) => [c.id, c.name]));

    const channels: ChannelAnalysis[] = plGroups.map((g) => {
      const totalRevenue = g._sum.revenue ?? 0;
      const totalProfit = g._sum.netProfit ?? 0;
      const totalOrders = g._sum.orderCount ?? 0;
      const totalCost =
        (g._sum.cogs ?? 0) +
        (g._sum.commission ?? 0) +
        (g._sum.shippingCost ?? 0) +
        (g._sum.adCost ?? 0) +
        (g._sum.otherCost ?? 0);
      const returnCount = g._sum.returnCount ?? 0;

      return {
        channelName: companyMap.get(g.companyId) ?? 'Unknown',
        channelType: 'online',
        totalOrders,
        totalRevenue,
        totalCost,
        totalProfit,
        returnCount,
        returnRate:
          totalOrders > 0
            ? Math.round((returnCount / totalOrders) * 1000) / 10
            : 0,
        avgOrderValue:
          totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
      };
    });

    const totals = {
      totalRevenue: channels.reduce((s, c) => s + c.totalRevenue, 0),
      totalProfit: channels.reduce((s, c) => s + c.totalProfit, 0),
      totalOrders: channels.reduce((s, c) => s + c.totalOrders, 0),
      totalCost: channels.reduce((s, c) => s + c.totalCost, 0),
    };

    return { period: periodStr, channels, totals };
  }
}

import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { CoupangDashboardService } from './coupang-dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { kstDayStart } from '../common/kst';

@Controller('coupang-dashboard')
export class CoupangDashboardController {
  constructor(
    private readonly service: CoupangDashboardService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async getSummary() {
    const company = await this.prisma.company.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    if (!company) {
      throw new NotFoundException('회사 정보 없음');
    }
    return this.service.getSummary(company.id);
  }

  @Get('trend')
  async getRevenueTrend(
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
  ) {
    const company = await this.prisma.company.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    if (!company) throw new NotFoundException('회사 정보 없음');

    const defaultFrom = kstDayStart(new Date(Date.now() - 30 * 86400000));
    const defaultTo = new Date(kstDayStart(new Date()).getTime() + 86400000);

    const from = fromStr ? kstDayStart(new Date(fromStr)) : defaultFrom;
    const to = toStr
      ? new Date(kstDayStart(new Date(toStr)).getTime() + 86400000)
      : defaultTo;

    return this.service.getRevenueTrend(company.id, from, to);
  }

  @Get('ranking')
  async getProductRanking(
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
  ) {
    const company = await this.prisma.company.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    if (!company) throw new NotFoundException('회사 정보 없음');

    const defaultFrom = kstDayStart(new Date(Date.now() - 30 * 86400000));
    const defaultTo = new Date(kstDayStart(new Date()).getTime() + 86400000);

    const from = fromStr ? kstDayStart(new Date(fromStr)) : defaultFrom;
    const to = toStr
      ? new Date(kstDayStart(new Date(toStr)).getTime() + 86400000)
      : defaultTo;

    return this.service.getProductRanking(company.id, from, to);
  }
}

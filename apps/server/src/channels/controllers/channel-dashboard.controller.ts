import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { ChannelDashboardService } from '../services/channel-dashboard.service';
import { PrismaService } from '../../prisma/prisma.service';
import { kstDayStart } from '../../common/kst';
import { CoupangDateRangeQueryDto } from '../dto';

@Controller('coupang-dashboard')
export class ChannelDashboardController {
  constructor(
    private readonly service: ChannelDashboardService,
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
  async getRevenueTrend(@Query() query: CoupangDateRangeQueryDto) {
    const { from: fromStr, to: toStr } = query;
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
  async getProductRanking(@Query() query: CoupangDateRangeQueryDto) {
    const { from: fromStr, to: toStr } = query;
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

  @Get('return-summary')
  async getReturnSummary(@Query() query: CoupangDateRangeQueryDto) {
    const { from: fromStr, to: toStr } = query;
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

    return this.service.getReturnSummary(company.id, from, to);
  }

  @Get('return-reasons')
  async getReturnReasonBreakdown(@Query() query: CoupangDateRangeQueryDto) {
    const { from: fromStr, to: toStr } = query;
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

    return this.service.getReturnReasonBreakdown(company.id, from, to);
  }

  @Get('return-fault-split')
  async getReturnFaultSplit(@Query() query: CoupangDateRangeQueryDto) {
    const { from: fromStr, to: toStr } = query;
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

    return this.service.getReturnFaultSplit(company.id, from, to);
  }
}

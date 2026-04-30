import { Controller, Get, Query } from '@nestjs/common';
import { ChannelDashboardService } from '../../../application/service/channel-dashboard.service';
import { kstDayStart } from '../../../../common/kst';
import { CoupangDateRangeQueryDto } from './dto';
import { CurrentCompany } from '../../../../auth/decorators/current-company.decorator';

@Controller('coupang-dashboard')
export class ChannelDashboardController {
  constructor(private readonly service: ChannelDashboardService) {}

  private resolveDateRange(fromStr?: string, toStr?: string): { from: Date; to: Date } {
    const defaultFrom = kstDayStart(new Date(Date.now() - 30 * 86400000));
    const defaultTo = new Date(kstDayStart(new Date()).getTime() + 86400000);
    const from = fromStr ? kstDayStart(new Date(fromStr)) : defaultFrom;
    const to = toStr
      ? new Date(kstDayStart(new Date(toStr)).getTime() + 86400000)
      : defaultTo;
    return { from, to };
  }

  @Get()
  async getSummary(@CurrentCompany() companyId: string) {
    return this.service.getSummary(companyId);
  }

  @Get('trend')
  async getRevenueTrend(
    @CurrentCompany() companyId: string,
    @Query() query: CoupangDateRangeQueryDto,
  ) {
    const { from, to } = this.resolveDateRange(query.from, query.to);
    return this.service.getRevenueTrend(companyId, from, to);
  }

  @Get('ranking')
  async getProductRanking(
    @CurrentCompany() companyId: string,
    @Query() query: CoupangDateRangeQueryDto,
  ) {
    const { from, to } = this.resolveDateRange(query.from, query.to);
    return this.service.getProductRanking(companyId, from, to);
  }

  @Get('return-summary')
  async getReturnSummary(
    @CurrentCompany() companyId: string,
    @Query() query: CoupangDateRangeQueryDto,
  ) {
    const { from, to } = this.resolveDateRange(query.from, query.to);
    return this.service.getReturnSummary(companyId, from, to);
  }

  @Get('return-reasons')
  async getReturnReasonBreakdown(
    @CurrentCompany() companyId: string,
    @Query() query: CoupangDateRangeQueryDto,
  ) {
    const { from, to } = this.resolveDateRange(query.from, query.to);
    return this.service.getReturnReasonBreakdown(companyId, from, to);
  }

  @Get('return-fault-split')
  async getReturnFaultSplit(
    @CurrentCompany() companyId: string,
    @Query() query: CoupangDateRangeQueryDto,
  ) {
    const { from, to } = this.resolveDateRange(query.from, query.to);
    return this.service.getReturnFaultSplit(companyId, from, to);
  }
}

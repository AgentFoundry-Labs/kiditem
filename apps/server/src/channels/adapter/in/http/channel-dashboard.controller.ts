import { Controller, Get, Query } from '@nestjs/common';
import { ChannelDashboardService } from '../../../application/service/channel-dashboard.service';
import { kstDayStart } from '../../../../common/kst';
import { CoupangDateRangeQueryDto } from './dto';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';

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
  async getSummary(@CurrentOrganization() organizationId: string) {
    return this.service.getSummary(organizationId);
  }

  @Get('trend')
  async getRevenueTrend(
    @CurrentOrganization() organizationId: string,
    @Query() query: CoupangDateRangeQueryDto,
  ) {
    const { from, to } = this.resolveDateRange(query.from, query.to);
    return this.service.getRevenueTrend(organizationId, from, to);
  }

  @Get('ranking')
  async getProductRanking(
    @CurrentOrganization() organizationId: string,
    @Query() query: CoupangDateRangeQueryDto,
  ) {
    const { from, to } = this.resolveDateRange(query.from, query.to);
    return this.service.getProductRanking(organizationId, from, to);
  }

  @Get('return-summary')
  async getReturnSummary(
    @CurrentOrganization() organizationId: string,
    @Query() query: CoupangDateRangeQueryDto,
  ) {
    const { from, to } = this.resolveDateRange(query.from, query.to);
    return this.service.getReturnSummary(organizationId, from, to);
  }

  @Get('return-reasons')
  async getReturnReasonBreakdown(
    @CurrentOrganization() organizationId: string,
    @Query() query: CoupangDateRangeQueryDto,
  ) {
    const { from, to } = this.resolveDateRange(query.from, query.to);
    return this.service.getReturnReasonBreakdown(organizationId, from, to);
  }

  @Get('return-fault-split')
  async getReturnFaultSplit(
    @CurrentOrganization() organizationId: string,
    @Query() query: CoupangDateRangeQueryDto,
  ) {
    const { from, to } = this.resolveDateRange(query.from, query.to);
    return this.service.getReturnFaultSplit(organizationId, from, to);
  }
}

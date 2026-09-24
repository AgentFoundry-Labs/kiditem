import { Inject } from '@nestjs/common';
import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { CHANNEL_DASHBOARD_PORT, type ChannelDashboardPort } from "../../../application/port/in/listing/channel-dashboard.port";
import { addDays, kstDayStart, parseBusinessDate } from '../../../../common/kst';
import { CoupangDateRangeQueryDto } from './dto/index';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';

@Controller('coupang-dashboard')
export class ChannelDashboardController {
  constructor(@Inject(CHANNEL_DASHBOARD_PORT) private readonly service: ChannelDashboardPort) {}

  private resolveDateRange(fromStr?: string, toStr?: string): { from: Date; to: Date } {
    const todayStart = kstDayStart(new Date());
    const defaultFrom = addDays(todayStart, -30);
    const defaultTo = addDays(todayStart, 1);
    const requestedFrom = fromStr ? parseBusinessDate(fromStr) : null;
    const requestedTo = toStr ? parseBusinessDate(toStr) : null;
    if ((fromStr !== undefined && !requestedFrom) || (toStr !== undefined && !requestedTo)) {
      throw new BadRequestException('날짜는 유효한 YYYY-MM-DD 형식이어야 합니다.');
    }
    const from = requestedFrom ? kstDayStart(requestedFrom) : defaultFrom;
    const to = requestedTo ? addDays(kstDayStart(requestedTo), 1) : defaultTo;
    if (from.getTime() >= to.getTime()) {
      throw new BadRequestException('from은 to보다 이후일 수 없습니다.');
    }
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
}

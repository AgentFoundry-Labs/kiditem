import { Inject } from '@nestjs/common';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
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
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'DATE_INVALID' }, message: '날짜는 유효한 YYYY-MM-DD 형식이어야 합니다.' });
    }
    const from = requestedFrom ? kstDayStart(requestedFrom) : defaultFrom;
    const to = requestedTo ? addDays(kstDayStart(requestedTo), 1) : defaultTo;
    if (from.getTime() >= to.getTime()) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'DATE_RANGE_INVALID' }, message: '시작일은 종료일보다 늦을 수 없습니다.' });
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

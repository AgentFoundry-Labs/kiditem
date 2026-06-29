import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { DashboardContextService } from '../../../application/service/dashboard-context.service';
import {
  DashboardSalesService,
  type RocketDailySalesResult,
} from '../../../application/service/dashboard-sales.service';
import type { RocketOrderRow } from '../../../application/port/out/repository/rocket-revenue.repository.port';
import { DashboardAdService } from '../../../application/service/dashboard-ad.service';
import { DashboardInventoryService } from '../../../application/service/dashboard-inventory.service';
import { DashboardTrendService } from '../../../application/service/dashboard-trend.service';
import { DashboardQueryDto, DashboardTrendQueryDto } from './dto/dashboard-query.dto';
import type {
  DashboardSalesSummary,
  DashboardAdSummary,
  DashboardInventorySummary,
  DashboardTrendItem,
} from '@kiditem/shared/dashboard';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly contextService: DashboardContextService,
    private readonly salesService: DashboardSalesService,
    private readonly adService: DashboardAdService,
    private readonly inventoryService: DashboardInventoryService,
    private readonly trendService: DashboardTrendService,
  ) {}

  @Get('sales')
  async getSales(
    @Query() query: DashboardQueryDto,
    @CurrentOrganization() organizationId: string,
  ): Promise<DashboardSalesSummary> {
    const ctx = await this.contextService.buildForQuery(
      organizationId,
      query.range,
      query.from,
      query.to,
    );
    return this.salesService.getSummary(ctx, organizationId);
  }

  @Get('rocket-sales')
  async getRocketSales(
    @CurrentOrganization() organizationId: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ): Promise<RocketDailySalesResult> {
    const now = new Date();
    const { year: y, month: m } = parseYearMonthQuery(year, month, now);
    return this.salesService.getRocketDailySales(organizationId, y, m);
  }

  @Get('rocket-sales/orders')
  async getRocketOrders(
    @CurrentOrganization() organizationId: string,
    @Query('date') date: string,
  ): Promise<RocketOrderRow[]> {
    return this.salesService.getRocketOrders(organizationId, parseIsoDateQuery(date, 'date'));
  }

  @Get('rocket-orders')
  async getRocketOrdersList(
    @CurrentOrganization() organizationId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ): Promise<RocketOrderRow[]> {
    const pad = (n: number) => String(n).padStart(2, '0');
    const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const now = new Date();
    const toStr = parseIsoDateQuery(to || ymd(now), 'to');
    const fromStr = parseIsoDateQuery(from || ymd(new Date(now.getTime() - 30 * 24 * 3600 * 1000)), 'from');
    if (fromStr > toStr) {
      throw new BadRequestException('from은 to보다 이후일 수 없습니다.');
    }
    return this.salesService.getRocketOrdersList(organizationId, fromStr, toStr, status || undefined);
  }

  @Get('ad')
  async getAd(
    @Query() query: DashboardQueryDto,
    @CurrentOrganization() organizationId: string,
  ): Promise<DashboardAdSummary> {
    const ctx = await this.contextService.buildForQuery(
      organizationId,
      query.range,
      query.from,
      query.to,
    );
    return this.adService.getSummary(ctx, organizationId);
  }

  @Get('inventory')
  async getInventory(
    @CurrentOrganization() organizationId: string,
  ): Promise<DashboardInventorySummary> {
    // range-agnostic — snapshot only
    const ctx = this.contextService.buildSnapshot();
    return this.inventoryService.getSummary(ctx, organizationId);
  }

  @Get('trend')
  async getTrend(
    @Query() query: DashboardTrendQueryDto,
    @CurrentOrganization() organizationId: string,
  ): Promise<DashboardTrendItem[]> {
    return this.trendService.getTrend(organizationId, query.range ?? '30d');
  }
}

function parseYearMonthQuery(
  year: string | undefined,
  month: string | undefined,
  fallback: Date,
): { year: number; month: number } {
  const parsedYear = year === undefined ? fallback.getFullYear() : Number(year);
  const parsedMonth = month === undefined ? fallback.getMonth() + 1 : Number(month);
  if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
    throw new BadRequestException('year는 2000 이상 2100 이하의 정수여야 합니다.');
  }
  if (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
    throw new BadRequestException('month는 1 이상 12 이하의 정수여야 합니다.');
  }
  return { year: parsedYear, month: parsedMonth };
}

function parseIsoDateQuery(value: string | undefined, name: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException(`${name}는 YYYY-MM-DD 형식이어야 합니다.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`${name}는 유효한 날짜여야 합니다.`);
  }
  return value;
}

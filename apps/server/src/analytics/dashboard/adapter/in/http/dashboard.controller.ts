import { Controller, Get, Query } from '@nestjs/common';
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
    const y = year ? Number(year) : now.getFullYear();
    const m = month ? Number(month) : now.getMonth() + 1;
    return this.salesService.getRocketDailySales(organizationId, y, m);
  }

  @Get('rocket-sales/orders')
  async getRocketOrders(
    @CurrentOrganization() organizationId: string,
    @Query('date') date: string,
  ): Promise<RocketOrderRow[]> {
    return this.salesService.getRocketOrders(organizationId, date);
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
    const toStr = to || ymd(now);
    const fromStr = from || ymd(new Date(now.getTime() - 30 * 24 * 3600 * 1000));
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

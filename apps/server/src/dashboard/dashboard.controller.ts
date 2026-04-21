import { Controller, Get, Query } from '@nestjs/common';
import { CurrentCompany } from '../auth/decorators/current-company.decorator';
import { DashboardSalesService } from './services/dashboard-sales.service';
import { DashboardAdService } from './services/dashboard-ad.service';
import { DashboardInventoryService } from './services/dashboard-inventory.service';
import { DashboardTrendService } from './services/dashboard-trend.service';
import { buildDashboardContext } from './services/context';
import { DashboardQueryDto, DashboardTrendQueryDto } from './dto/dashboard-query.dto';
import type {
  DashboardSalesSummary,
  DashboardAdSummary,
  DashboardInventorySummary,
  DashboardTrendItem,
} from '@kiditem/shared';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly salesService: DashboardSalesService,
    private readonly adService: DashboardAdService,
    private readonly inventoryService: DashboardInventoryService,
    private readonly trendService: DashboardTrendService,
  ) {}

  @Get('sales')
  async getSales(
    @Query() query: DashboardQueryDto,
    @CurrentCompany() companyId: string,
  ): Promise<DashboardSalesSummary> {
    const ctx = buildDashboardContext(query.range, query.from, query.to);
    return this.salesService.getSummary(ctx, companyId);
  }

  @Get('ad')
  async getAd(
    @Query() query: DashboardQueryDto,
    @CurrentCompany() companyId: string,
  ): Promise<DashboardAdSummary> {
    const ctx = buildDashboardContext(query.range, query.from, query.to);
    return this.adService.getSummary(ctx, companyId);
  }

  @Get('inventory')
  async getInventory(
    @CurrentCompany() companyId: string,
  ): Promise<DashboardInventorySummary> {
    // range-agnostic — snapshot only
    const ctx = buildDashboardContext();
    return this.inventoryService.getSummary(ctx, companyId);
  }

  @Get('trend')
  async getTrend(
    @Query() query: DashboardTrendQueryDto,
    @CurrentCompany() companyId: string,
  ): Promise<DashboardTrendItem[]> {
    return this.trendService.getTrend(companyId, query.range ?? '30d');
  }
}

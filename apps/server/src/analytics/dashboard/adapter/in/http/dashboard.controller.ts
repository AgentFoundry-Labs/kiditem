import { Controller, Get, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { DashboardContextService } from '../../../application/service/dashboard-context.service';
import { DashboardSalesService } from '../../../application/service/dashboard-sales.service';
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

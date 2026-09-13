import { Controller, Get, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { buildDashboardContext } from '../../../domain/context';
import { DashboardSalesService } from '../../../application/service/dashboard-sales.service';
import { DashboardAdService } from '../../../application/service/dashboard-ad.service';
import { DashboardInventoryService } from '../../../application/service/dashboard-inventory.service';
import { DashboardTrendService } from '../../../application/service/dashboard-trend.service';
import { DashboardCollectionsService } from '../../../application/service/dashboard-collections.service';
import { DashboardQueryDto, DashboardTrendQueryDto } from './dto/dashboard-query.dto';
import type {
  DashboardCollections,
  DashboardSalesSummary,
  DashboardAdSummary,
  DashboardInventorySummary,
  DashboardTrendItem,
} from '@kiditem/shared/dashboard';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly salesService: DashboardSalesService,
    private readonly adService: DashboardAdService,
    private readonly inventoryService: DashboardInventoryService,
    private readonly trendService: DashboardTrendService,
    private readonly collectionsService: DashboardCollectionsService,
  ) {}

  /** When each collection last completed. Not a period read: no window applies. */
  @Get('collections')
  async getCollections(
    @CurrentOrganization() organizationId: string,
  ): Promise<DashboardCollections> {
    return this.collectionsService.getCollections(organizationId);
  }

  @Get('sales')
  async getSales(
    @Query() query: DashboardQueryDto,
    @CurrentOrganization() organizationId: string,
  ): Promise<DashboardSalesSummary> {
    const ctx = buildDashboardContext(query.range, query.from, query.to);
    return this.salesService.getSummary(ctx, organizationId);
  }

  @Get('ad')
  async getAd(
    @Query() query: DashboardQueryDto,
    @CurrentOrganization() organizationId: string,
  ): Promise<DashboardAdSummary> {
    const ctx = buildDashboardContext(query.range, query.from, query.to);
    return this.adService.getSummary(ctx, organizationId);
  }

  @Get('inventory')
  async getInventory(
    @CurrentOrganization() organizationId: string,
  ): Promise<DashboardInventorySummary> {
    // range-agnostic — snapshot only
    const ctx = buildDashboardContext();
    return this.inventoryService.getSummary(ctx, organizationId);
  }

  @Get('trend')
  async getTrend(
    @Query() query: DashboardTrendQueryDto,
    @CurrentOrganization() organizationId: string,
  ): Promise<DashboardTrendItem[]> {
    const ctx = buildDashboardContext(query.range, query.from, query.to);
    return this.trendService.getTrend(ctx, organizationId);
  }
}

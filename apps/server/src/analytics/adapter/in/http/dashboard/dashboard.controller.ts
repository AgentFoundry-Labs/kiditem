import { Controller, Get, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { buildDashboardContext } from '../../../../domain/dashboard/context';
import { DashboardSalesService } from '../../../../application/service/dashboard/dashboard-sales.service';
import { DashboardAdService } from '../../../../application/service/dashboard/dashboard-ad.service';
import { DashboardInventoryService } from '../../../../application/service/dashboard/dashboard-inventory.service';
import { DashboardTrendService } from '../../../../application/service/dashboard/dashboard-trend.service';
import { DashboardCollectionsService } from '../../../../application/service/dashboard/dashboard-collections.service';
import { DashboardFindingsService } from '../../../../application/service/dashboard/dashboard-findings.service';
import { DashboardQueryDto, DashboardTrendQueryDto } from './dto/dashboard-query.dto';
import type {
  DashboardCollections,
  DashboardFindings,
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
    private readonly findingsService: DashboardFindingsService,
  ) {}

  @Get('collections')
  async getCollections(
    @CurrentOrganization() organizationId: string,
  ): Promise<DashboardCollections> {
    return this.collectionsService.getCollections(organizationId);
  }

  /** What the dashboard flags: declining key products, reorder suggestions, rejected listings. */
  @Get('findings')
  async getFindings(
    @CurrentOrganization() organizationId: string,
  ): Promise<DashboardFindings> {
    // range-agnostic — each finding reads its owner's current snapshot
    const ctx = buildDashboardContext();
    return this.findingsService.getFindings(ctx, organizationId);
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

import { Controller, Get, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { DashboardSalesService } from '../../../application/service/dashboard-sales.service';
import { DashboardAdService } from '../../../application/service/dashboard-ad.service';
import { DashboardInventoryService } from '../../../application/service/dashboard-inventory.service';
import { DashboardTrendService } from '../../../application/service/dashboard-trend.service';
import { buildDashboardContext } from '../../../application/service/context';
import { DashboardQueryDto, DashboardTrendQueryDto } from './dto/dashboard-query.dto';
import { WingTrafficAggregationRepositoryAdapter } from '../../out/repository/wing-traffic-aggregation.repository.adapter';
import type {
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
    private readonly wingTrafficRepository: WingTrafficAggregationRepositoryAdapter,
  ) {}

  /**
   * Resolve the effective anchor date for the dashboard.
   *
   * If no `range`/`from`/`to` is supplied (default month view) and the
   * calendar month containing `now` has no Order, Wing/Drive, or Coupang ads
   * activity, we shift the anchor onto the latest data date for this
   * organization. That keeps the dashboard from rendering as all-zero on
   * Drive replay snapshots while leaving explicit query-string ranges
   * untouched.
   *
   * Returns `undefined` when no shift is required (current month or any
   * explicit range stays anchored at `now`).
   */
  private async resolveAnchor(
    organizationId: string,
    range: string | undefined,
    from: string | undefined,
    to: string | undefined,
  ): Promise<Date | undefined> {
    if (range && range !== 'month') return undefined;
    if (from || to) return undefined;

    const latest = await this.wingTrafficRepository.findLatestDataDate(organizationId);
    if (!latest) return undefined;

    const now = new Date();
    if (
      latest.getUTCFullYear() === now.getFullYear() &&
      latest.getUTCMonth() === now.getMonth()
    ) {
      return undefined;
    }

    // Snap to noon UTC on the latest business date so the KST/UTC month math
    // resolves into the correct calendar month regardless of host timezone.
    return new Date(
      Date.UTC(
        latest.getUTCFullYear(),
        latest.getUTCMonth(),
        latest.getUTCDate(),
        12,
        0,
        0,
      ),
    );
  }

  @Get('sales')
  async getSales(
    @Query() query: DashboardQueryDto,
    @CurrentOrganization() organizationId: string,
  ): Promise<DashboardSalesSummary> {
    const anchor = await this.resolveAnchor(organizationId, query.range, query.from, query.to);
    const ctx = buildDashboardContext(query.range, query.from, query.to, anchor);
    return this.salesService.getSummary(ctx, organizationId);
  }

  @Get('ad')
  async getAd(
    @Query() query: DashboardQueryDto,
    @CurrentOrganization() organizationId: string,
  ): Promise<DashboardAdSummary> {
    const anchor = await this.resolveAnchor(organizationId, query.range, query.from, query.to);
    const ctx = buildDashboardContext(query.range, query.from, query.to, anchor);
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
    return this.trendService.getTrend(organizationId, query.range ?? '30d');
  }
}

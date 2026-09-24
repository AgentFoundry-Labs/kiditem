import { Module } from '@nestjs/common';
import { DashboardModule } from './dashboard/dashboard.module';
import { StatisticsModule } from './statistics/statistics.module';
import { TrafficModule } from './traffic/traffic.module';
import { SupplierStatsModule } from './supplier-stats/supplier-stats.module';
import { SellpiaSalesModule } from './sellpia-sales/sellpia-sales.module';
import { SellpiaProductSalesModule } from './sellpia-product-sales/sellpia-product-sales.module';
import { AnalyticsOwnerOverviewCapabilityAdapter } from './adapter/in/agent/analytics-overview-capability.adapter';
import { AnalyticsCapabilityCompositionAdapter } from './adapter/in/agent/analytics-capability-composition.adapter';
import { ANALYTICS_AGENT_OVERVIEW_CAPABILITY_PORT } from './dashboard/application/port/in/analytics-overview-capability.port';
import { ANALYTICS_CAPABILITY_COMPOSITION_PORT } from './application/port/in/capability/analytics-capability-composition.port';

/**
 * Analytics owner root.
 *
 * Aggregates the reporting / read-model surfaces audited in Wave H1 Lane R:
 * `dashboard`, `statistics`, `traffic`, and `supplier-stats`. All four are
 * read-model capabilities — they hydrate analytics views from the canonical
 * mutation domains (orders, channels, products, suppliers) without owning
 * those mutations themselves.
 *
 * Boundary rules for code that lives under analytics:
 *
 *   - No cross-domain mutations. Reads only, with one daily-fact ingest
 *     exception: Sellpia 판매현황 ingest (`POST /api/sellpia-sales/ingest`)
 *     which writes `SellpiaSalesDailySnapshot` (몰별 일별 매출 fact, 확장 스크랩
 *     소스). It matches the channel-domain daily-fact contract; no other
 *     mutation lane exists in this owner. The traffic CSV upload lane is
 *     retired (KID-110) — Advertising's Wing collection is the only
 *     listing-day traffic publisher.
 *   - Raw SQL and report hydration code lives under
 *     `dashboard/adapter/out/repository/*.repository.adapter.ts` (the only
 *     sub-domain that needed an out-adapter lane in this wave). Statistics,
 *     traffic, and supplier-stats use Prisma directly because they have no
 *     `$queryRaw` surfaces.
 *   - Tenant predicates: every read binds `organizationId` from
 *     `@CurrentOrganization()`. Raw SQL paths bind `${organizationId}::uuid` per
 *     tenant-scope rule; ORM paths use `where: { organizationId, ... }`.
 *   - Public routes are preserved: `/api/dashboard/*`,
 *     `/api/statistics`, `/api/traffic/*`, `/api/supplier-stats`.
 */
@Module({
  imports: [
    DashboardModule,
    StatisticsModule,
    TrafficModule,
    SupplierStatsModule,
    SellpiaSalesModule,
    SellpiaProductSalesModule,
  ],
  providers: [
    AnalyticsOwnerOverviewCapabilityAdapter,
    AnalyticsCapabilityCompositionAdapter,
    { provide: ANALYTICS_AGENT_OVERVIEW_CAPABILITY_PORT, useExisting: AnalyticsOwnerOverviewCapabilityAdapter },
    { provide: ANALYTICS_CAPABILITY_COMPOSITION_PORT, useExisting: AnalyticsCapabilityCompositionAdapter },
  ],
  exports: [SellpiaProductSalesModule, ANALYTICS_AGENT_OVERVIEW_CAPABILITY_PORT, ANALYTICS_CAPABILITY_COMPOSITION_PORT],
})
export class AnalyticsModule {}

import { Module } from '@nestjs/common';
import { DashboardModule } from './dashboard/dashboard.module';
import { StatisticsModule } from './statistics/statistics.module';
import { TrafficModule } from './traffic/traffic.module';
import { SupplierStatsModule } from './supplier-stats/supplier-stats.module';

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
 *   - No cross-domain mutations. Reads only, with the single exception of
 *     traffic CSV/XLSX upload (`/api/traffic/upload`) which writes
 *     `ChannelListingDailySnapshot.traffic*` columns and the
 *     `ChannelScrapeRun` / `ChannelScrapeSnapshot` audit trail. That
 *     ingest path matches the channel-domain daily-fact contract and is
 *     the only mutation lane in this owner.
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
  ],
})
export class AnalyticsModule {}

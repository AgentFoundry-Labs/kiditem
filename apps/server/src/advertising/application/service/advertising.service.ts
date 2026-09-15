import { Inject, Injectable } from '@nestjs/common';
import { paginationParams } from '../../../common/pagination';
import { recomputeRoas } from '../../domain/util/ratio-recompute';
import { buildAdMetrics } from '../../domain/ad-metrics';
import {
  AD_BENCHMARK_REPOSITORY_PORT,
  type AdBenchmarkRepositoryPort,
} from '../port/out/repository/ad-benchmark.repository.port';
import {
  AD_LISTING_REPOSITORY_PORT,
  type AdListingRepositoryPort,
} from '../port/out/repository/ad-listing.repository.port';
import { AdConfigService } from './ad-config.service';
import type {
  AdsHubData,
  AdsHubSummary,
  AdsListItem,
  FindAllAdsResponse,
} from '@kiditem/shared/advertising';
import type { AdvertisingHubReadPort } from '../port/in/advertising-hub-read.port';

@Injectable()
export class AdvertisingService implements AdvertisingHubReadPort {
  constructor(
    @Inject(AD_BENCHMARK_REPOSITORY_PORT)
    private readonly benchmarkRepo: AdBenchmarkRepositoryPort,
    @Inject(AD_LISTING_REPOSITORY_PORT)
    private readonly listingRepo: AdListingRepositoryPort,
    private readonly adConfigService: AdConfigService,
  ) {}

  async getHubData(organizationId: string): Promise<AdsHubData> {
    await this.adConfigService.getConfig(organizationId);
    const { products, abcOfficialCutoffDate } =
      await this.buildListingItems(organizationId);
    const summary = this.computeSummary(products);
    return { products, summary, abcOfficialCutoffDate } satisfies AdsHubData;
  }

  async findAll(
    query: { page?: string | number; limit?: string | number },
    organizationId: string,
  ): Promise<FindAllAdsResponse> {
    await this.adConfigService.getConfig(organizationId);
    const { page, limit, skip } = paginationParams(query);
    const { products: all } = await this.buildListingItems(organizationId);
    const items = all.slice(skip, skip + limit);
    return {
      items,
      total: all.length,
      page,
      limit,
    } satisfies FindAllAdsResponse;
  }

  private async buildListingItems(
    organizationId: string,
  ): Promise<{ products: AdsListItem[]; abcOfficialCutoffDate: string | null }> {
    // Reuses the 30-day per-listing aggregate from the benchmark repository
    // — the hub list and the diagnosis share the exact same source rows.
    const aggregates =
      await this.benchmarkRepo.findBenchmarkAggregates(organizationId);
    // Grades and the ABC cutoff come from one snapshot, so the cutoff always
    // belongs to the publication the grades were read from.
    const { listings: listingMap, abcOfficialCutoffDate } =
      await this.listingRepo.findScopedAdListingsWithAbcCutoff(
        organizationId,
        aggregates.perListing.map((r) => r.listingId),
      );

    const products = aggregates.perListing.flatMap((row) => {
      const listing = listingMap.get(row.listingId);
      if (!listing) return [];
      const master = listing.masterProduct;
      const metrics = buildAdMetrics(row.sums);
      const grade = (master.abcGrade ?? null) as 'A' | 'B' | 'C' | null;
      return [
        {
          listingId: listing.id,
          externalId: listing.externalId,
          channelName: listing.channelName,
          masterProduct: {
            id: master.id,
            code: master.code,
            name: master.name,
          },
          option: null,
          metrics,
          grade: grade === 'A' || grade === 'B' || grade === 'C' ? grade : null,
        } satisfies AdsListItem,
      ];
    });
    return { products, abcOfficialCutoffDate };
  }

  private computeSummary(products: AdsListItem[]): AdsHubSummary {
    const totalSpend = products.reduce((s, p) => s + p.metrics.spend, 0);
    const totalRevenue = products.reduce((s, p) => s + p.metrics.revenue, 0);
    const totalRoas = recomputeRoas(totalRevenue, totalSpend);

    const gradeSpend: Record<'A' | 'B' | 'C', number> = { A: 0, B: 0, C: 0 };
    for (const p of products) {
      if (p.grade === 'A' || p.grade === 'B' || p.grade === 'C') {
        gradeSpend[p.grade] += p.metrics.spend;
      }
    }

    const gradeSpendPercent: Record<'A' | 'B' | 'C', number> = {
      A: totalSpend > 0 ? Math.round((gradeSpend.A / totalSpend) * 100) : 0,
      B: totalSpend > 0 ? Math.round((gradeSpend.B / totalSpend) * 100) : 0,
      C: totalSpend > 0 ? Math.round((gradeSpend.C / totalSpend) * 100) : 0,
    };

    return {
      totalSpend,
      totalRevenue,
      totalRoas,
      gradeSpend,
      gradeSpendPercent,
    } satisfies AdsHubSummary;
  }
}

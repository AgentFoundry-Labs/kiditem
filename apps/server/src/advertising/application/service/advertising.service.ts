import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdsHubData,
  AdsHubSummary,
  AdsListItem,
  FindAllAdsResponse,
} from '@kiditem/shared/advertising';
import { AdConfigService } from './ad-config.service';
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

const VALID_TIERS = ['1차', '2차', '3차', 'OFF'] as const;
type ValidTier = (typeof VALID_TIERS)[number];

@Injectable()
export class AdvertisingService {
  constructor(
    @Inject(AD_BENCHMARK_REPOSITORY_PORT)
    private readonly benchmarkRepo: AdBenchmarkRepositoryPort,
    @Inject(AD_LISTING_REPOSITORY_PORT)
    private readonly listingRepo: AdListingRepositoryPort,
    private readonly adConfigService: AdConfigService,
  ) {}

  async getHubData(organizationId: string): Promise<AdsHubData> {
    await this.adConfigService.getConfig(organizationId);
    const products = await this.buildListingItems(organizationId);
    const summary = this.computeSummary(products);
    return { products, summary } satisfies AdsHubData;
  }

  async findAll(
    query: { page?: string | number; limit?: string | number },
    organizationId: string,
  ): Promise<FindAllAdsResponse> {
    await this.adConfigService.getConfig(organizationId);
    const { page, limit, skip } = paginationParams(query);
    const all = await this.buildListingItems(organizationId);
    const items = all.slice(skip, skip + limit);
    return {
      items,
      total: all.length,
      page,
      limit,
    } satisfies FindAllAdsResponse;
  }

  /**
   * Change ad tier by listing id. The IDOR check routes through
   * `ChannelListing` directly; the supplied id is interpreted as a
   * `ChannelListing.id`. (No frontend URL change — the ad-ops UI already
   * passes listingId.)
   */
  async changeTier(
    id: string,
    adTier: string,
    organizationId: string,
  ): Promise<{ ok: true }> {
    if (!(VALID_TIERS as readonly string[]).includes(adTier)) {
      throw new BadRequestException('유효하지 않은 티어입니다');
    }
    const nextTier: string | null =
      (adTier as ValidTier) === 'OFF' ? null : adTier;
    const changed = await this.listingRepo.changeAdTier(
      id,
      organizationId,
      nextTier,
    );
    if (!changed) throw new NotFoundException('Ad not found');
    return { ok: true };
  }

  private async buildListingItems(
    organizationId: string,
  ): Promise<AdsListItem[]> {
    // Reuses the 30-day per-listing aggregate from the benchmark repository
    // — the hub list and the diagnosis share the exact same source rows.
    const aggregates =
      await this.benchmarkRepo.findBenchmarkAggregates(organizationId);
    if (aggregates.perListing.length === 0) return [];

    const listingMap = await this.listingRepo.findScopedAdListings(
      organizationId,
      aggregates.perListing.map((r) => r.listingId),
    );

    return aggregates.perListing.flatMap((row) => {
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
          tier: master.adTier ?? null,
          adTier: master.adTier ?? null,
        } satisfies AdsListItem,
      ];
    });
  }

  private computeSummary(products: AdsListItem[]): AdsHubSummary {
    const totalSpend = products.reduce((s, p) => s + p.metrics.spend, 0);
    const totalRevenue = products.reduce((s, p) => s + p.metrics.revenue, 0);
    const totalRoas = recomputeRoas(totalRevenue, totalSpend);

    const gradeSpend: Record<'A' | 'B' | 'C', number> = { A: 0, B: 0, C: 0 };
    const tierSpend: Record<string, number> = {};
    for (const p of products) {
      if (p.grade === 'A' || p.grade === 'B' || p.grade === 'C') {
        gradeSpend[p.grade] += p.metrics.spend;
      }
      if (p.adTier) {
        tierSpend[p.adTier] = (tierSpend[p.adTier] ?? 0) + p.metrics.spend;
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
      tierSpend,
      gradeSpendPercent,
    } satisfies AdsHubSummary;
  }
}

import { Inject, Injectable } from '@nestjs/common';
import type { AdBenchmarkData, AdMetrics } from '@kiditem/shared/advertising';
import { AdConfigService } from './ad-config.service';
import { buildAdMetrics } from '../../domain/ad-metrics';
import { scopedListingToSummary } from '../../mapper/ad-listing.mapper';
import {
  AD_BENCHMARK_REPOSITORY_PORT,
  type AdBenchmarkRepositoryPort,
} from '../port/out/ad-benchmark.repository.port';
import {
  AD_LISTING_REPOSITORY_PORT,
  type AdListingRepositoryPort,
} from '../port/out/ad-listing.repository.port';

type DiagnosisMetric = 'ctr' | 'roas' | 'cvr';

type DiagnosisResult = {
  metric: DiagnosisMetric;
  status: 'above' | 'average' | 'below';
  delta: number;
  message: string;
};

function diagnoseMetric(
  metric: DiagnosisMetric,
  ownValue: number | null,
  industryValue: number,
): DiagnosisResult {
  if (ownValue == null || industryValue <= 0) {
    return { metric, status: 'average', delta: 0, message: `${metric.toUpperCase()} 데이터 부족` };
  }
  const delta = Math.round((ownValue - industryValue) * 100) / 100;
  const deltaPercent = industryValue > 0 ? Math.round((delta / industryValue) * 100) : 0;
  let status: 'above' | 'average' | 'below';
  if (deltaPercent > 10) status = 'above';
  else if (deltaPercent < -10) status = 'below';
  else status = 'average';

  const label = metric.toUpperCase();
  const message =
    status === 'above'
      ? `${label} 업계 평균 대비 ${Math.abs(deltaPercent)}% 우위`
      : status === 'below'
        ? `${label} 업계 평균 대비 ${Math.abs(deltaPercent)}% 미달`
        : `${label} 업계 평균 수준`;

  return { metric, status, delta, message };
}

@Injectable()
export class AdBenchmarkService {
  constructor(
    @Inject(AD_BENCHMARK_REPOSITORY_PORT)
    private readonly benchmarkRepo: AdBenchmarkRepositoryPort,
    @Inject(AD_LISTING_REPOSITORY_PORT)
    private readonly listingRepo: AdListingRepositoryPort,
    private readonly adConfigService: AdConfigService,
  ) {}

  /**
   * Benchmark aggregation from `ChannelListingDailySnapshot` over the last
   * 30 inclusive KST businessDates. Ratios recompute from sums (no provider
   * per-row ratios). Industry averages come from `AdConfigService.getConfig`.
   */
  async getDiagnosis(organizationId: string): Promise<AdBenchmarkData> {
    const config = await this.adConfigService.getConfig(organizationId);
    const aggregates =
      await this.benchmarkRepo.findBenchmarkAggregates(organizationId);

    const ownMetrics = buildAdMetrics(aggregates.totals);

    const industryAverage: AdMetrics = {
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
      ctr: config.benchmark.ctr.avg,
      roas: config.benchmark.roas.avg,
      cvr: config.benchmark.cvr.avg,
    };

    const diagnosis: DiagnosisResult[] = [
      diagnoseMetric('ctr', ownMetrics.ctr, config.benchmark.ctr.avg),
      diagnoseMetric('roas', ownMetrics.roas, config.benchmark.roas.avg),
      diagnoseMetric('cvr', ownMetrics.cvr, config.benchmark.cvr.avg),
    ];

    const summaryMap = await this.listingRepo.findScopedAdListings(
      organizationId,
      aggregates.perListing.map((row) => row.listingId),
    );

    const listings = aggregates.perListing.flatMap((row) => {
      const summary = summaryMap.get(row.listingId);
      if (!summary) return [];
      return [
        {
          ...scopedListingToSummary(summary),
          metrics: buildAdMetrics(row.sums),
        },
      ];
    });

    return {
      ownMetrics,
      industryAverage,
      diagnosis,
      listings,
    } satisfies AdBenchmarkData;
  }
}

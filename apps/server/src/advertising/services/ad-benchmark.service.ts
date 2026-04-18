import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdConfigService } from './ad-config.service';
import type { AdBenchmarkData, AdMetrics } from '@kiditem/shared';
import { LISTING_SUMMARY_SELECT } from './types';

function computeMetrics(sums: {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}): AdMetrics {
  const { spend, impressions, clicks, conversions, revenue } = sums;
  return {
    spend,
    impressions,
    clicks,
    conversions,
    revenue,
    ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : null,
    roas: spend > 0 ? Math.round((revenue / spend) * 10000) / 100 : null,
    cvr: clicks > 0 ? Math.round((conversions / clicks) * 10000) / 100 : null,
  };
}

function diagnoseMetric(
  metric: 'ctr' | 'roas' | 'cvr',
  ownValue: number | null,
  industryValue: number,
): { metric: 'ctr' | 'roas' | 'cvr'; status: 'above' | 'average' | 'below'; delta: number; message: string } {
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
  const message = status === 'above'
    ? `${label} 업계 평균 대비 ${Math.abs(deltaPercent)}% 우위`
    : status === 'below'
      ? `${label} 업계 평균 대비 ${Math.abs(deltaPercent)}% 미달`
      : `${label} 업계 평균 수준`;

  return { metric, status, delta, message };
}

@Injectable()
export class AdBenchmarkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adConfigService: AdConfigService,
  ) {}

  async getDiagnosis(companyId: string): Promise<AdBenchmarkData> {
    const config = await this.adConfigService.getConfig(companyId);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [totals, perListing] = await Promise.all([
      this.prisma.ad.aggregate({
        where: { companyId, date: { gte: thirtyDaysAgo } },
        _sum: {
          spend: true,
          impressions: true,
          clicks: true,
          conversions: true,
          revenue: true,
        },
      }),
      this.prisma.ad.groupBy({
        by: ['listingId'],
        where: { companyId, date: { gte: thirtyDaysAgo } },
        _sum: {
          spend: true,
          impressions: true,
          clicks: true,
          conversions: true,
          revenue: true,
        },
      }),
    ]);

    const ownMetrics = computeMetrics({
      spend: totals._sum.spend ?? 0,
      impressions: totals._sum.impressions ?? 0,
      clicks: totals._sum.clicks ?? 0,
      conversions: totals._sum.conversions ?? 0,
      revenue: totals._sum.revenue ?? 0,
    });

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

    const diagnosis = [
      diagnoseMetric('ctr', ownMetrics.ctr, config.benchmark.ctr.avg),
      diagnoseMetric('roas', ownMetrics.roas, config.benchmark.roas.avg),
      diagnoseMetric('cvr', ownMetrics.cvr, config.benchmark.cvr.avg),
    ];

    const listingIds = perListing
      .map((r) => r.listingId)
      .filter((id): id is string => id != null);

    const summaries = listingIds.length > 0
      ? await this.prisma.channelListing.findMany({
          where: { id: { in: listingIds }, companyId, isDeleted: false },
          select: LISTING_SUMMARY_SELECT,
        })
      : [];

    const summaryMap = new Map(summaries.map((s) => [s.id, s]));

    const listings = perListing.flatMap((row) => {
      if (!row.listingId) return [];
      const summary = summaryMap.get(row.listingId);
      if (!summary) return [];
      const metrics = computeMetrics({
        spend: row._sum.spend ?? 0,
        impressions: row._sum.impressions ?? 0,
        clicks: row._sum.clicks ?? 0,
        conversions: row._sum.conversions ?? 0,
        revenue: row._sum.revenue ?? 0,
      });
      return [{
        listingId: summary.id,
        externalId: summary.externalId,
        channelName: summary.channelName,
        masterProduct: summary.master,
        option: null,
        metrics,
      }];
    });

    return {
      ownMetrics,
      industryAverage,
      diagnosis,
      listings,
    } satisfies AdBenchmarkData;
  }
}

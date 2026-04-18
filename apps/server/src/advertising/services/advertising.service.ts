import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdConfigService } from './ad-config.service';
import { paginationParams } from '../../common/pagination';
import { LISTING_SUMMARY_SELECT } from './types';
import type {
  AdMetrics,
  AdsHubData,
  AdsHubSummary,
  AdsListItem,
  FindAllAdsResponse,
} from '@kiditem/shared';

const VALID_TIERS = ['1차', '2차', '3차', 'OFF'] as const;
type ValidTier = (typeof VALID_TIERS)[number];

function toRoasValue(spend: number, revenue: number): number | null {
  return spend > 0 ? Math.round((revenue / spend) * 10000) / 100 : null;
}

function buildMetrics(sums: {
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
    ctr:
      impressions > 0
        ? Math.round((clicks / impressions) * 10000) / 100
        : null,
    roas: toRoasValue(spend, revenue),
    cvr:
      clicks > 0 ? Math.round((conversions / clicks) * 10000) / 100 : null,
  };
}

@Injectable()
export class AdvertisingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adConfigService: AdConfigService,
  ) {}

  async getHubData(companyId: string): Promise<AdsHubData> {
    await this.adConfigService.getConfig(companyId);
    const products = await this.buildListingItems(companyId);
    const summary = this.computeSummary(products);
    return { products, summary } satisfies AdsHubData;
  }

  async findAll(
    query: { page?: string | number; limit?: string | number },
    companyId: string,
  ): Promise<FindAllAdsResponse> {
    await this.adConfigService.getConfig(companyId);
    const { page, limit, skip } = paginationParams(query);
    const all = await this.buildListingItems(companyId);
    const items = all.slice(skip, skip + limit);
    return {
      items,
      total: all.length,
      page,
      limit,
    } satisfies FindAllAdsResponse;
  }

  async changeTier(
    id: string,
    adTier: string,
    companyId: string,
  ): Promise<{ ok: true }> {
    if (!(VALID_TIERS as readonly string[]).includes(adTier)) {
      throw new BadRequestException('유효하지 않은 티어입니다');
    }
    const ad = await this.prisma.ad.findFirst({
      where: { id, companyId },
      include: { listing: { select: { masterId: true } } },
    });
    if (!ad?.listing) throw new NotFoundException('Ad not found');

    const nextTier: string | null =
      (adTier as ValidTier) === 'OFF' ? null : adTier;

    await this.prisma.masterProduct.update({
      where: { id: ad.listing.masterId },
      data: { adTier: nextTier },
    });

    return { ok: true };
  }

  private async buildListingItems(companyId: string): Promise<AdsListItem[]> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const perListing = await this.prisma.ad.groupBy({
      by: ['listingId'],
      where: { companyId, date: { gte: thirtyDaysAgo } },
      _sum: {
        spend: true,
        impressions: true,
        clicks: true,
        conversions: true,
        revenue: true,
      },
    });

    if (perListing.length === 0) return [];

    const listingIds = perListing
      .map((r) => r.listingId)
      .filter((id): id is string => id != null);

    if (listingIds.length === 0) return [];

    const listings = await this.prisma.channelListing.findMany({
      where: { id: { in: listingIds }, companyId, isDeleted: false },
      select: {
        ...LISTING_SUMMARY_SELECT,
        master: {
          select: {
            id: true,
            code: true,
            name: true,
            abcGrade: true,
            adTier: true,
          },
        },
      },
    });

    const listingMap = new Map(listings.map((l) => [l.id, l]));

    return perListing.flatMap((row) => {
      if (!row.listingId) return [];
      const listing = listingMap.get(row.listingId);
      if (!listing) return [];

      const metrics = buildMetrics({
        spend: row._sum.spend ?? 0,
        impressions: row._sum.impressions ?? 0,
        clicks: row._sum.clicks ?? 0,
        conversions: row._sum.conversions ?? 0,
        revenue: row._sum.revenue ?? 0,
      });

      const grade = (listing.master.abcGrade ?? null) as
        | 'A'
        | 'B'
        | 'C'
        | null;

      return [
        {
          listingId: listing.id,
          externalId: listing.externalId,
          channelName: listing.channelName,
          masterProduct: {
            id: listing.master.id,
            code: listing.master.code,
            name: listing.master.name,
          },
          option: null,
          metrics,
          grade: grade === 'A' || grade === 'B' || grade === 'C' ? grade : null,
          tier: listing.master.adTier ?? null,
          adTier: listing.master.adTier ?? null,
        } satisfies AdsListItem,
      ];
    });
  }

  private computeSummary(products: AdsListItem[]): AdsHubSummary {
    const totalSpend = products.reduce((s, p) => s + p.metrics.spend, 0);
    const totalRevenue = products.reduce((s, p) => s + p.metrics.revenue, 0);
    const totalRoas = toRoasValue(totalSpend, totalRevenue);

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

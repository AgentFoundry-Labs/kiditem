import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdConfigService } from './ad-config.service';
import { paginationParams } from '../../common/pagination';
import { kstInclusiveDaysStart } from '../../common/kst';
import { LISTING_SUMMARY_SELECT } from './types';
import {
  recomputeRoas,
  recomputeCtr,
  recomputeCvr,
} from '../util/ratio-recompute';
import type {
  AdMetrics,
  AdsHubData,
  AdsHubSummary,
  AdsListItem,
  FindAllAdsResponse,
} from '@kiditem/shared';

const VALID_TIERS = ['1차', '2차', '3차', 'OFF'] as const;
type ValidTier = (typeof VALID_TIERS)[number];

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
    ctr: recomputeCtr(clicks, impressions),
    roas: recomputeRoas(revenue, spend),
    cvr: recomputeCvr(conversions, clicks),
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

  /**
   * Change ad tier by listing id. The IDOR check routes through
   * `ChannelListing` directly; the supplied id is interpreted as a
   * `ChannelListing.id`. (No frontend URL change — the ad-ops UI already
   * passes listingId.)
   */
  async changeTier(
    id: string,
    adTier: string,
    companyId: string,
  ): Promise<{ ok: true }> {
    if (!(VALID_TIERS as readonly string[]).includes(adTier)) {
      throw new BadRequestException('유효하지 않은 티어입니다');
    }
    const listing = await this.prisma.channelListing.findFirst({
      where: { id, companyId, isDeleted: false },
      select: { masterId: true },
    });
    if (!listing) throw new NotFoundException('Ad not found');

    const nextTier: string | null =
      (adTier as ValidTier) === 'OFF' ? null : adTier;

    await this.prisma.masterProduct.update({
      where: { id: listing.masterId },
      data: { adTier: nextTier },
    });

    return { ok: true };
  }

  private async buildListingItems(companyId: string): Promise<AdsListItem[]> {
    // Inclusive KST window: 30 businessDates = today + 29 prior dates.
    const thirtyDaysAgo = kstInclusiveDaysStart(30);

    // Listing-level ad metrics aggregate from
    // `ChannelListingDailySnapshot` over the last 30 businessDates.
    const perListing = await this.prisma.channelListingDailySnapshot.groupBy({
      by: ['listingId'],
      where: { companyId, businessDate: { gte: thirtyDaysAgo } },
      _sum: {
        adSpend: true,
        adImpressions: true,
        adClicks: true,
        adConversions: true,
        adRevenue: true,
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
        spend: row._sum.adSpend ?? 0,
        impressions: row._sum.adImpressions ?? 0,
        clicks: row._sum.adClicks ?? 0,
        conversions: row._sum.adConversions ?? 0,
        revenue: row._sum.adRevenue ?? 0,
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

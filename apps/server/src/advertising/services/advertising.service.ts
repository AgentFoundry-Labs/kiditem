import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdConfigService } from './ad-config.service';
import { paginationParams } from '../../common/pagination';
import { kstInclusiveDaysStart } from '../../common/kst';
import { recomputeRoas } from '../util/ratio-recompute';
import { buildAdMetrics } from '../domain/ad-metrics';
import { findScopedAdListings } from '../adapter/out/prisma/ad-listing.query';
import type {
  AdsHubData,
  AdsHubSummary,
  AdsListItem,
  FindAllAdsResponse,
} from '@kiditem/shared/advertising';

const VALID_TIERS = ['1차', '2차', '3차', 'OFF'] as const;
type ValidTier = (typeof VALID_TIERS)[number];

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

    const updated = await this.prisma.masterProduct.updateMany({
      where: { id: listing.masterId, companyId },
      data: { adTier: nextTier },
    });
    if (updated.count !== 1) throw new NotFoundException('Ad not found');

    return { ok: true };
  }

  private async buildListingItems(companyId: string): Promise<AdsListItem[]> {
    const thirtyDaysAgo = kstInclusiveDaysStart(30);

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

    const listingMap = await findScopedAdListings(
      this.prisma,
      companyId,
      perListing.map((r) => r.listingId),
    );

    return perListing.flatMap((row) => {
      if (!row.listingId) return [];
      const listing = listingMap.get(row.listingId);
      if (!listing) return [];
      const master = listing.masterProduct;

      const metrics = buildAdMetrics({
        spend: row._sum.adSpend ?? 0,
        impressions: row._sum.adImpressions ?? 0,
        clicks: row._sum.adClicks ?? 0,
        conversions: row._sum.adConversions ?? 0,
        revenue: row._sum.adRevenue ?? 0,
      });

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

import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ExtensionSyncDto } from '../dto';
import type { NormalizedCampaignKpi } from './types';

export interface ListingMap {
  externalOptionIdMap: Map<string, { listingId: string; optionId: string }>;
  externalIdMap: Map<string, { listingId: string }>;
}

export interface ListingMatch {
  listingId: string | null;
  optionId: string | null;
}

@Injectable()
export class AdSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async sync(payload: ExtensionSyncDto, companyId: string) {
    const map = await this.buildListingMap(companyId);

    switch (payload.type) {
      case 'ad_campaign':
        return this.handleAdCampaign(payload, companyId, map);
      case 'raw_scrape':
        return this.handleRawScrape(payload, companyId, map);
      case 'traffic':
        return this.handleTraffic(payload, companyId, map);
      case 'coupang_ads_daily':
        return this.handleCoupangAdsDaily(payload, companyId);
      default:
        throw new BadRequestException(
          `알 수 없는 type: ${(payload as { type?: string }).type ?? 'undefined'}`,
        );
    }
  }

  async getExtensionStatus(companyId: string) {
    const [listingCount, snapshotCount, wingKpiSnapshot, itemWinnerStats] =
      await Promise.all([
        this.prisma.channelListing.count({
          where: { companyId, isDeleted: false },
        }),
        this.prisma.adSnapshot.count({ where: { companyId } }),
        this.prisma.adSnapshot.findFirst({
          where: { companyId, source: 'wing', pageType: 'itemwinner_kpi' },
          orderBy: { capturedAt: 'desc' },
          select: { rawJson: true, capturedAt: true },
        }),
        this.prisma.itemWinner.groupBy({
          by: ['isWinner'],
          where: { companyId },
          _count: true,
        }),
      ]);

    let wingKpis: Record<string, string> = {};
    if (wingKpiSnapshot?.rawJson) {
      const raw = wingKpiSnapshot.rawJson as Record<string, unknown>;
      if (raw.kpis && typeof raw.kpis === 'object') {
        wingKpis = raw.kpis as Record<string, string>;
      }
    }

    if (Object.keys(wingKpis).length === 0) {
      const total = itemWinnerStats.reduce((s, g) => s + g._count, 0);
      const winners = itemWinnerStats.find((g) => g.isWinner)?._count || 0;
      const nonWinners = itemWinnerStats.find((g) => !g.isWinner)?._count || 0;
      if (total > 0) {
        wingKpis = {
          '아이템위너 상품': String(winners),
          '노출제한 상품': '0',
          '아이템위너 아닌 상품': String(nonWinners),
          '쿠팡 상위 20% 인기 상품': '0',
          '판매자 자동가격조정 상품': '0',
        };
      }
    }

    return {
      connected: true,
      listingCount,
      snapshotCount,
      itemWinnerCount: itemWinnerStats.reduce((s, g) => s + g._count, 0),
      wing: { kpis: wingKpis, lastSync: wingKpiSnapshot?.capturedAt ?? null },
    };
  }

  async buildListingMap(companyId: string): Promise<ListingMap> {
    const [options, listings] = await Promise.all([
      this.prisma.channelListingOption.findMany({
        where: {
          companyId,
          isActive: true,
          listing: { channel: 'coupang', isDeleted: false },
        },
        select: { externalOptionId: true, listingId: true, optionId: true },
      }),
      this.prisma.channelListing.findMany({
        where: { companyId, isDeleted: false, channel: 'coupang' },
        select: { id: true, externalId: true },
      }),
    ]);

    const externalOptionIdMap = new Map<
      string,
      { listingId: string; optionId: string }
    >();
    for (const opt of options) {
      if (opt.externalOptionId && opt.optionId) {
        externalOptionIdMap.set(opt.externalOptionId, {
          listingId: opt.listingId,
          optionId: opt.optionId,
        });
      }
    }

    const externalIdMap = new Map<string, { listingId: string }>();
    for (const l of listings) {
      externalIdMap.set(l.externalId, { listingId: l.id });
    }

    return { externalOptionIdMap, externalIdMap };
  }

  matchListingFromRow(
    row: Record<string, unknown>,
    map: ListingMap,
  ): ListingMatch {
    const providerOptionId = this.pickStringField(row, [
      'vendorItemId',
      'vendor_item_id',
      'itemId',
    ]);
    if (providerOptionId) {
      const hit = map.externalOptionIdMap.get(providerOptionId);
      if (hit) return hit;
    }

    const externalId = this.pickStringField(row, [
      'externalId',
      'external_id',
      'productId',
      'coupangProductId',
    ]);
    if (externalId) {
      const hit = map.externalIdMap.get(externalId);
      if (hit) return { listingId: hit.listingId, optionId: null };
    }

    return { listingId: null, optionId: null };
  }

  private async handleAdCampaign(
    payload: ExtensionSyncDto,
    companyId: string,
    map: ListingMap,
  ) {
    const campaignName = payload.campaignName || '_전체';
    const period = String(payload.period || '7d');
    const today = new Date(new Date().toISOString().slice(0, 10));
    const kpis = payload.kpis || {};
    const normalizedRows = payload.normalizedRows ?? [];
    const capturedAt = payload.timestamp
      ? new Date(payload.timestamp)
      : new Date();

    const totalKpi: NormalizedCampaignKpi = {
      adSpend: Math.round(
        this.getKpiNumber(kpis, ['전체 집행 광고비', '집행 광고비', '광고비']),
      ),
      adRevenue: Math.round(
        this.getKpiNumber(kpis, ['광고 전환 매출', '전환 매출']),
      ),
      totalRevenue: Math.round(this.getKpiNumber(kpis, ['전체 매출'])),
      impressions: Math.round(this.getKpiNumber(kpis, ['노출수', '노출'])),
      clicks: Math.round(this.getKpiNumber(kpis, ['클릭수', '클릭'])),
      ctr: this.getKpiNumber(kpis, ['클릭률', 'ctr']),
      conversions: Math.round(
        this.getKpiNumber(kpis, ['광고 전환 판매수', '전환 판매수', '전환수']),
      ),
      orders: Math.round(
        this.getKpiNumber(kpis, ['광고 전환 주문수', '전환 주문수', '주문수']),
      ),
      roas: this.getKpiNumber(kpis, ['광고 수익률', '광고수익률', 'roas']),
      conversionRate: this.getKpiNumber(kpis, ['전환율']),
    };

    const existingTotal = await this.prisma.adSnapshot.findFirst({
      where: {
        companyId,
        level: 'campaign',
        campaignName,
        date: today,
        period,
      },
      select: { id: true },
    });
    if (existingTotal) {
      await this.prisma.adSnapshot.update({
        where: { id: existingTotal.id },
        data: { ...totalKpi, collectedAt: capturedAt },
      });
    } else {
      await this.prisma.adSnapshot.create({
        data: {
          companyId,
          level: 'campaign',
          source: 'advertising',
          pageType: 'campaign',
          campaignName,
          date: today,
          period,
          ...totalKpi,
          collectedAt: capturedAt,
        },
      });
    }

    let productCount = 0;
    let campaignSnapshotCount = 0;
    let snapshotCount = 0;
    let adCount = 0;

    for (const row of normalizedRows) {
      if (!row.campaignName && !row.productName && !row.keyword) continue;
      if (row._kpiOnly) continue;

      const match = this.matchListingFromRow(row, map);
      const rowCampaignName = this.cleanString(row.campaignName) || campaignName;
      const rowStatus = this.cleanString(row.status);
      const rowOnOff = this.cleanString(row.onOff);
      const rowRoas = this.toNumber(row.roas || row.adEfficiencyTarget);
      const rowCtr = this.toNumber(row.ctr);
      const rowSpend = Math.round(this.toNumber(row.runningAdSpend ?? row.spend));
      const rowRevenue = Math.round(this.toNumber(row.revenue));
      const rowDailyBudget = Math.round(this.toNumber(row.dailyBudget));
      const rowTodaySpend = Math.round(this.toNumber(row.todaySpend));
      const rowImpressions = Math.round(this.toNumber(row.impressions));
      const rowClicks = Math.round(this.toNumber(row.clicks));
      const rowConversions = Math.round(this.toNumber(row.conversions));
      const rowOrders = Math.round(this.toNumber(row.orders));
      const rowConversionRate =
        rowClicks > 0
          ? Math.round((rowConversions / Math.max(rowClicks, 1)) * 10000) / 100
          : this.toNumber(row.conversionRate);

      if (
        row.pageType === 'campaign' &&
        rowCampaignName &&
        rowCampaignName !== '_전체'
      ) {
        const existing = await this.prisma.adSnapshot.findFirst({
          where: {
            companyId,
            level: 'campaign',
            campaignName: rowCampaignName,
            date: today,
            period,
          },
          select: { id: true },
        });
        const campaignData = {
          onOff: rowOnOff,
          status: rowStatus,
          adSpend: rowSpend,
          adRevenue: rowRevenue,
          impressions: rowImpressions,
          clicks: rowClicks,
          ctr: rowCtr,
          conversions: rowConversions,
          orders: rowOrders,
          roas: rowRoas,
          conversionRate: rowConversionRate,
          budget: rowDailyBudget,
          todaySpend: rowTodaySpend,
          collectedAt: capturedAt,
        };
        if (existing) {
          await this.prisma.adSnapshot.update({
            where: { id: existing.id },
            data: campaignData,
          });
        } else {
          await this.prisma.adSnapshot.create({
            data: {
              companyId,
              level: 'campaign',
              source: 'advertising',
              pageType: 'campaign',
              campaignName: rowCampaignName,
              date: today,
              period,
              listingId: match.listingId,
              optionId: match.optionId,
              ...campaignData,
            },
          });
        }
        campaignSnapshotCount++;
      }

      const externalId = String(
        row.externalId ||
          [
            row.pageType || 'campaign',
            rowCampaignName || '',
            row.keyword || '',
            row.productName || '',
          ].join('::'),
      );
      await this.prisma.adSnapshot.create({
        data: {
          companyId,
          listingId: match.listingId,
          optionId: match.optionId,
          source: 'advertising',
          pageType: this.cleanString(row.pageType) || 'campaign',
          externalId,
          campaignName: rowCampaignName,
          keyword: this.cleanString(row.keyword),
          productName: this.cleanString(row.productName),
          status: rowStatus,
          currentBid: this.toNumberOrNull(row.currentBid),
          dailyBudget: this.toNumberOrNull(row.dailyBudget),
          impressions: rowImpressions,
          clicks: rowClicks,
          conversions: rowConversions,
          spend: rowSpend,
          revenue: rowRevenue,
          roas: Number.isFinite(rowRoas) ? rowRoas : 0,
          ctr: Number.isFinite(rowCtr) ? rowCtr : 0,
          rawJson: row,
          capturedAt,
        },
      });
      snapshotCount++;

      if (match.listingId) {
        try {
          await this.prisma.adSnapshot.create({
            data: {
              companyId,
              listingId: match.listingId,
              optionId: match.optionId,
              level: 'product',
              source: 'advertising',
              pageType: 'product',
              campaignName: rowCampaignName,
              period,
              date: today,
              productName: row.productName || '',
              vendorItemId: this.cleanString(row.itemId) || '',
              onOff: rowOnOff || '',
              status: rowStatus || '',
              keyword: row.keyword || '',
              adSpend: rowSpend,
              adRevenue: rowRevenue,
              impressions: rowImpressions,
              clicks: rowClicks,
              ctr: rowCtr || 0,
              adConversions: rowConversions,
              conversionRate: rowConversionRate || 0,
            },
          });
          productCount++;
        } catch {
          /* 중복 등 무시 */
        }

        try {
          await this.prisma.ad.create({
            data: {
              companyId,
              listingId: match.listingId,
              optionId: match.optionId,
              platform: 'coupang',
              campaignName: rowCampaignName,
              dailyBudget: rowDailyBudget > 0 ? rowDailyBudget : null,
              spend: rowSpend,
              impressions: rowImpressions,
              clicks: rowClicks,
              conversions: rowConversions,
              revenue: rowRevenue,
              roas: Number.isFinite(rowRoas) ? rowRoas : 0,
              date: today,
            },
          });
          adCount++;
        } catch {
          /* 멱등 — unique conflict 는 skip */
        }
      }
    }

    return {
      success: true,
      type: 'ad_campaign',
      campaignName,
      period,
      kpiCount: Object.keys(kpis).length,
      campaignSnapshotCount,
      snapshotCount,
      productCount,
      adCount,
    };
  }

  private async handleRawScrape(
    payload: ExtensionSyncDto,
    companyId: string,
    map: ListingMap,
  ) {
    const source = payload.source || 'unknown';
    const rows = payload.data ?? [];
    let upserted = 0;

    if (source === 'wing') {
      for (const row of rows) {
        const productName = row.productName || '';
        if (!productName || productName.length < 3) continue;

        const match = this.matchListingFromRow(row, map);
        if (!match.listingId) continue;

        await this.prisma.itemWinner.create({
          data: {
            companyId,
            listingId: match.listingId,
            productName,
            isWinner: row.isWinner === true || row.isWinner === 'true',
            myPrice: Math.round(Number(row.myPrice) || 0),
            winnerPrice: row.winnerPrice
              ? Math.round(Number(row.winnerPrice))
              : null,
          },
        });
        upserted++;
      }

      const kpis = payload.kpis || {};
      if (Object.keys(kpis).length > 0) {
        await this.prisma.adSnapshot.create({
          data: {
            companyId,
            source: 'wing',
            pageType: 'itemwinner_kpi',
            impressions: 0,
            clicks: 0,
            conversions: 0,
            spend: 0,
            revenue: 0,
            rawJson: {
              kpis,
              rowCount: rows.length,
              timestamp: payload.timestamp,
            },
            capturedAt: payload.timestamp
              ? new Date(payload.timestamp)
              : new Date(),
          },
        });
      }
    }

    const normalizedRows = payload.normalizedRows ?? [];
    let snapshotCount = 0;
    if (source === 'advertising' && normalizedRows.length > 0) {
      for (const row of normalizedRows) {
        const match = this.matchListingFromRow(row, map);
        const roas = this.toNumber(row.roas);
        const ctr = this.toNumber(row.ctr);

        const pageType = this.cleanString(row.pageType) || 'campaign';
        const rawExternalId = String(
          row.externalId ||
            [
              pageType,
              row.campaignName || '',
              row.keyword || '',
              row.productName || '',
            ].join('::'),
        );
        await this.prisma.adSnapshot.create({
          data: {
            companyId,
            listingId: match.listingId,
            optionId: match.optionId,
            source: 'advertising',
            pageType,
            externalId: rawExternalId,
            campaignName: this.cleanString(row.campaignName),
            keyword: this.cleanString(row.keyword),
            productName: this.cleanString(row.productName),
            status: this.cleanString(row.status),
            currentBid: this.toNumberOrNull(row.currentBid),
            dailyBudget: this.toNumberOrNull(row.dailyBudget),
            impressions: Math.round(this.toNumber(row.impressions)),
            clicks: Math.round(this.toNumber(row.clicks)),
            conversions: Math.round(this.toNumber(row.conversions)),
            spend: Math.round(this.toNumber(row.spend)),
            revenue: Math.round(this.toNumber(row.revenue)),
            roas: Number.isFinite(roas) ? roas : 0,
            ctr: Number.isFinite(ctr) ? ctr : 0,
            rawJson: row,
            capturedAt: payload.timestamp
              ? new Date(payload.timestamp)
              : new Date(),
          },
        });
        snapshotCount++;
      }
    }

    return {
      success: true,
      type: 'raw_scrape',
      source,
      rowCount: rows.length,
      kpiCount: Object.keys(payload.kpis || {}).length,
      upserted,
      snapshotCount,
    };
  }

  private async handleTraffic(
    payload: ExtensionSyncDto,
    companyId: string,
    map: ListingMap,
  ) {
    const period = Number(payload.period) || 14;
    const dateStr = payload.startDate
      ? payload.startDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const today = new Date(dateStr);
    const data = payload.data ?? [];
    let upserted = 0;
    let skipped = 0;

    type TrafficUpsertRow = {
      listingId: string;
      companyId: string;
      date: Date;
      periodDays: number;
      visitors: number;
      views: number;
      cartAdds: number;
      orders: number;
      salesQty: number;
      revenue: number;
      conversionRate: number;
    };

    const toUpsert: TrafficUpsertRow[] = [];
    for (const item of data) {
      const match = this.matchListingFromRow(item, map);
      if (!match.listingId) {
        skipped++;
        continue;
      }
      toUpsert.push({
        listingId: match.listingId,
        companyId,
        date: today,
        periodDays: period,
        visitors: item.visitors || 0,
        views: item.views || 0,
        cartAdds: item.cartAdds || 0,
        orders: item.orders || 0,
        salesQty: item.salesQty || 0,
        revenue: Math.round(item.revenue || 0),
        conversionRate:
          item.visitors > 0
            ? Math.round((item.orders / item.visitors) * 10000) / 100
            : 0,
      });
    }

    if (toUpsert.length > 0) {
      await this.prisma.$transaction(
        toUpsert.map((d) =>
          this.prisma.trafficStats.upsert({
            where: {
              listingId_date_periodDays: {
                listingId: d.listingId,
                date: d.date,
                periodDays: d.periodDays,
              },
            },
            update: {
              visitors: d.visitors,
              views: d.views,
              cartAdds: d.cartAdds,
              orders: d.orders,
              salesQty: d.salesQty,
              revenue: d.revenue,
              conversionRate: d.conversionRate,
            },
            create: d,
          }),
        ),
      );
      upserted = toUpsert.length;
    }

    const kpis = payload.kpis || {};
    const adSummary = payload.adSummary || null;
    const summary = payload.summary || null;
    const hasWingSignal =
      Object.keys(kpis).length > 0 || adSummary !== null || summary !== null;

    let wingSnapshotSaved = false;
    if (hasWingSignal) {
      await this.prisma.adSnapshot.create({
        data: {
          companyId,
          source: 'wing',
          pageType: 'dashboard_kpi',
          impressions: 0,
          clicks: 0,
          conversions: 0,
          spend: 0,
          revenue: 0,
          rawJson: {
            kpis,
            adSummary,
            summary,
            period,
            startDate: payload.startDate,
            endDate: payload.endDate,
            rowCount: data.length,
            timestamp: payload.timestamp,
          },
          capturedAt: payload.timestamp
            ? new Date(payload.timestamp)
            : new Date(),
        },
      });
      wingSnapshotSaved = true;
    }

    if (upserted > 0) {
      this.eventEmitter.emit('products.classify-grades');
    }

    return {
      success: true,
      type: 'traffic',
      upserted,
      skipped: skipped + (data.length - toUpsert.length - skipped),
      wingSnapshotSaved,
    };
  }

  private async handleCoupangAdsDaily(
    payload: ExtensionSyncDto,
    companyId: string,
  ) {
    const rows = payload.data ?? [];
    let upserted = 0;

    for (const row of rows) {
      if (!row.date) continue;
      const date = new Date(row.date);
      const adSpend = Math.round(Number(row.adSpend) || 0);
      const adRevenue = Math.round(Number(row.adRevenue) || 0);
      const impressions = Math.round(Number(row.impressions) || 0);
      const clicks = Math.round(Number(row.clicks) || 0);
      const conversions = Math.round(Number(row.conversions) || 0);
      const orders = Math.round(Number(row.orders) || 0);
      const roas = Number(row.roas) || 0;
      const ctr = Number(row.ctr) || 0;
      const conversionRate = Number(row.conversionRate) || 0;

      const existing = await this.prisma.adSnapshot.findFirst({
        where: {
          companyId,
          source: 'coupang_ads',
          pageType: 'dashboard_daily',
          date,
        },
        select: { id: true },
      });

      if (existing) {
        await this.prisma.adSnapshot.update({
          where: { id: existing.id },
          data: {
            adSpend,
            adRevenue,
            impressions,
            clicks,
            conversions,
            orders,
            roas,
            ctr,
            conversionRate,
          },
        });
      } else {
        await this.prisma.adSnapshot.create({
          data: {
            companyId,
            source: 'coupang_ads',
            pageType: 'dashboard_daily',
            level: 'campaign',
            period: '1d',
            date,
            adSpend,
            adRevenue,
            impressions,
            clicks,
            conversions,
            orders,
            spend: adSpend,
            revenue: adRevenue,
            roas,
            ctr,
            conversionRate,
          },
        });
      }
      upserted++;
    }

    return { success: true, type: 'coupang_ads_daily', upserted };
  }

  async getScrapeTargets(companyId: string) {
    return this.prisma.scrapeTarget.findMany({
      where: { companyId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createScrapeTarget(
    url: string,
    label: string | undefined,
    category: string | undefined,
    companyId: string,
  ) {
    return this.prisma.scrapeTarget.create({
      data: {
        companyId,
        url,
        label: label || url,
        category: category || 'advertising',
      },
    });
  }

  async markScraped(id: string, companyId: string) {
    const target = await this.prisma.scrapeTarget.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Scrape target not found');
    return this.prisma.scrapeTarget.update({
      where: { id },
      data: { lastScrapedAt: new Date() },
    });
  }

  async deleteScrapeTarget(id: string, companyId: string) {
    const target = await this.prisma.scrapeTarget.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Scrape target not found');
    return this.prisma.scrapeTarget.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private pickStringField(
    row: Record<string, unknown>,
    keys: string[],
  ): string | null {
    for (const key of keys) {
      const v = row[key];
      if (typeof v === 'string' && v.trim().length > 0) return v.trim();
      if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    }
    return null;
  }

  private getKpiNumber(kpis: Record<string, unknown>, matchers: string[]): number {
    const normalizedMatchers = matchers.map((m) =>
      String(m || '').replace(/\s+/g, '').toLowerCase(),
    );

    for (const [label, rawValue] of Object.entries(kpis || {})) {
      const normalizedLabel = String(label || '')
        .replace(/\s+/g, '')
        .toLowerCase();
      if (!normalizedMatchers.some((m) => normalizedLabel.includes(m))) continue;

      const value =
        typeof rawValue === 'object' && rawValue !== null && 'value' in rawValue
          ? (rawValue as { value?: unknown }).value
          : rawValue;

      return this.toNumber(value);
    }

    return 0;
  }

  private cleanString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value !== 'string') return 0;
    const normalized = value.replace(/[^\d.-]/g, '');
    return normalized ? Number(normalized) || 0 : 0;
  }

  private toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const num = this.toNumber(value);
    return Number.isFinite(num) ? Math.round(num) : null;
  }
}

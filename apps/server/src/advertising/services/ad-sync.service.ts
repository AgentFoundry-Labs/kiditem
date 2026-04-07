import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ExtensionSyncDto } from '../dto';

@Injectable()
export class AdSyncService {
  constructor(private readonly prisma: PrismaService) {}

  private async getDefaultCompanyId(): Promise<string> {
    const company = await this.prisma.company.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    if (!company) throw new InternalServerErrorException('회사 정보를 찾을 수 없습니다');
    return company.id;
  }

  /**
   * 익스텐션에서 수집한 데이터를 DB에 저장
   */
  async sync(payload: ExtensionSyncDto) {
    const companyId = await this.getDefaultCompanyId();
    const productMap = await this.buildProductMap(companyId);

    switch (payload.type) {
      case 'ad_campaign':
        return this.handleAdCampaign(payload, companyId, productMap);
      case 'raw_scrape':
        return this.handleRawScrape(payload, companyId, productMap);
      case 'traffic':
        return this.handleTraffic(payload, companyId, productMap);
      default:
        return { success: false, error: `알 수 없는 type: ${payload.type}` };
    }
  }

  /**
   * 익스텐션 연결 상태
   */
  async getExtensionStatus(companyId?: string) {
    const cid = companyId || await this.getDefaultCompanyId();
    const [productCount, snapshotCount, itemWinnerCount, wingKpiSnapshot] = await Promise.all([
      this.prisma.product.count({ where: { companyId: cid, isDeleted: false } }),
      this.prisma.adSnapshot.count({ where: { companyId: cid } }),
      this.prisma.itemWinner.count({ where: { companyId: cid } }),
      this.prisma.adSnapshot.findFirst({
        where: { companyId: cid, source: 'wing', pageType: 'dashboard_kpi' },
        orderBy: { capturedAt: 'desc' },
        select: { rawJson: true, capturedAt: true },
      }),
    ]);

    const wingKpis = wingKpiSnapshot?.rawJson
      ? (wingKpiSnapshot.rawJson as Record<string, unknown>).adSummary as Record<string, string> ?? {}
      : {};

    return {
      connected: true,
      productCount,
      snapshotCount,
      itemWinnerCount,
      wing: { kpis: wingKpis, lastSync: wingKpiSnapshot?.capturedAt ?? null },
    };
  }

  /**
   * coupangProductId → product.id 매핑
   */
  private async buildProductMap(companyId: string): Promise<Map<string, string>> {
    const products = await this.prisma.product.findMany({
      where: { companyId, coupangProductId: { not: null }, isDeleted: false },
      select: { id: true, coupangProductId: true },
    });
    return new Map(products.map((p) => [p.coupangProductId!, p.id]));
  }

  /**
   * ad_campaign → AdCampaignSnapshot upsert + AdProductSnapshot + AdSnapshot
   */
  private async handleAdCampaign(
    payload: ExtensionSyncDto,
    companyId: string,
    productMap: Map<string, string>,
  ) {
    const campaignName = payload.campaignName || '_전체';
    const period = payload.period || '7d';
    const today = new Date(new Date().toISOString().slice(0, 10));
    const kpis = payload.kpis || {};
    const normalizedRows: any[] = payload.normalizedRows || [];
    const capturedAt = payload.timestamp ? new Date(payload.timestamp) : new Date();

    // 전체 KPI 스냅샷 저장
    const totalKpi = {
      adSpend: Math.round(this.getKpiNumber(kpis, ['전체 집행 광고비', '집행 광고비', '광고비'])),
      adRevenue: Math.round(this.getKpiNumber(kpis, ['광고 전환 매출', '전환 매출'])),
      totalRevenue: Math.round(this.getKpiNumber(kpis, ['전체 매출'])),
      impressions: Math.round(this.getKpiNumber(kpis, ['노출수', '노출'])),
      clicks: Math.round(this.getKpiNumber(kpis, ['클릭수', '클릭'])),
      ctr: this.getKpiNumber(kpis, ['클릭률', 'ctr']),
      conversions: Math.round(this.getKpiNumber(kpis, ['광고 전환 판매수', '전환 판매수', '전환수'])),
      orders: Math.round(this.getKpiNumber(kpis, ['광고 전환 주문수', '전환 주문수', '주문수'])),
      roas: this.getKpiNumber(kpis, ['광고 수익률', '광고수익률', 'roas']),
      conversionRate: this.getKpiNumber(kpis, ['전환율']),
    };

    await this.prisma.adCampaignSnapshot.upsert({
      where: {
        companyId_campaignName_date_period: {
          companyId, campaignName, date: today, period,
        },
      },
      update: { ...totalKpi, collectedAt: capturedAt },
      create: {
        companyId, campaignName, date: today, period,
        ...totalKpi, collectedAt: capturedAt,
      },
    });

    // 캠페인/키워드 행 스냅샷 저장
    let productCount = 0;
    let campaignSnapshotCount = 0;
    let snapshotCount = 0;

    for (const row of normalizedRows) {
      if (!row.campaignName && !row.productName && !row.keyword) continue;
      if (row._kpiOnly) continue;

      const matchedProductId = await this.matchProductIdFromRow(companyId, productMap, row);
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

      // 캠페인 행이면 AdCampaignSnapshot upsert
      if (row.pageType === 'campaign' && rowCampaignName && rowCampaignName !== '_전체') {
        await this.prisma.adCampaignSnapshot.upsert({
          where: {
            companyId_campaignName_date_period: {
              companyId, campaignName: rowCampaignName, date: today, period,
            },
          },
          update: {
            onOff: rowOnOff, status: rowStatus,
            adSpend: rowSpend, adRevenue: rowRevenue,
            impressions: rowImpressions, clicks: rowClicks, ctr: rowCtr,
            conversions: rowConversions, orders: rowOrders,
            roas: rowRoas, conversionRate: rowConversionRate,
            budget: rowDailyBudget, todaySpend: rowTodaySpend,
            collectedAt: capturedAt,
          },
          create: {
            companyId, campaignName: rowCampaignName, date: today, period,
            onOff: rowOnOff, status: rowStatus,
            adSpend: rowSpend, adRevenue: rowRevenue,
            impressions: rowImpressions, clicks: rowClicks, ctr: rowCtr,
            conversions: rowConversions, orders: rowOrders,
            roas: rowRoas, conversionRate: rowConversionRate,
            budget: rowDailyBudget, todaySpend: rowTodaySpend,
            collectedAt: capturedAt,
          },
        });
        campaignSnapshotCount++;
      }

      // AdSnapshot 생성
      const externalId = String(
        row.externalId ||
        [row.pageType || 'campaign', rowCampaignName || '', row.keyword || '', row.productName || ''].join('::'),
      );
      await this.prisma.adSnapshot.create({
        data: {
          companyId,
          productId: matchedProductId,
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

      // AdProductSnapshot 생성 (중복은 무시)
      try {
        await this.prisma.adProductSnapshot.create({
          data: {
            companyId,
            campaignName: rowCampaignName,
            period, date: today,
            productName: row.productName || '',
            vendorItemId: this.cleanString(row.itemId) || '',
            onOff: rowOnOff || '', status: rowStatus || '',
            keyword: row.keyword || '',
            adSpend: rowSpend, adRevenue: rowRevenue,
            impressions: rowImpressions, clicks: rowClicks,
            ctr: rowCtr || 0, adConversions: rowConversions,
            conversionRate: rowConversionRate || 0,
          },
        });
        productCount++;
      } catch { /* 중복 등 무시 */ }
    }

    return {
      success: true,
      type: 'ad_campaign',
      campaignName, period,
      kpiCount: Object.keys(kpis).length,
      campaignSnapshotCount,
      snapshotCount,
      productCount,
    };
  }

  /**
   * raw_scrape source="wing" → ItemWinner upsert
   */
  private async handleRawScrape(
    payload: ExtensionSyncDto,
    companyId: string,
    productMap: Map<string, string>,
  ) {
    const source = payload.source || 'unknown';
    const rows: any[] = payload.data || [];
    let upserted = 0;

    // Wing 아이템위너 데이터 저장
    if (source === 'wing') {
      for (const row of rows) {
        const productName = row.productName || '';
        if (!productName || productName.length < 3) continue;

        // coupangProductId로 매칭, 없으면 상품명
        let productId: string | null = null;
        if (row.vendorItemId) {
          productId = productMap.get(String(row.vendorItemId)) || null;
        }
        if (!productId) {
          const found = await this.prisma.product.findFirst({
            where: {
              companyId,
              name: { contains: productName.substring(0, 12) },
              isDeleted: false,
            },
            select: { id: true },
          });
          if (found) productId = found.id;
        }
        if (!productId) continue;

        await this.prisma.itemWinner.create({
          data: {
            companyId,
            productId,
            productName,
            isWinner: row.isWinner === true || row.isWinner === 'true',
            myPrice: Math.round(Number(row.myPrice) || 0),
            winnerPrice: row.winnerPrice ? Math.round(Number(row.winnerPrice)) : null,
          },
        });
        upserted++;
      }

      // Wing KPI 카드 데이터 저장 (adSummary용)
      const kpis = payload.kpis || {};
      if (Object.keys(kpis).length > 0) {
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
            rawJson: { adSummary: kpis, timestamp: payload.timestamp },
            capturedAt: payload.timestamp ? new Date(payload.timestamp) : new Date(),
          },
        });
      }
    }

    // 광고센터 normalizedRows가 있으면 AdSnapshot 저장
    const normalizedRows: any[] = payload.normalizedRows || [];
    let snapshotCount = 0;
    if (source === 'advertising' && normalizedRows.length > 0) {
      for (const row of normalizedRows) {
        const matchedProductId = await this.matchProductIdFromRow(companyId, productMap, row);
        const roas = this.toNumber(row.roas);
        const ctr = this.toNumber(row.ctr);

        const pageType = this.cleanString(row.pageType) || 'campaign';
        const rawExternalId = String(
          row.externalId ||
          [pageType, row.campaignName || '', row.keyword || '', row.productName || ''].join('::'),
        );
        await this.prisma.adSnapshot.create({
          data: {
            companyId,
            productId: matchedProductId,
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
            capturedAt: payload.timestamp ? new Date(payload.timestamp) : new Date(),
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

  /**
   * traffic → TrafficStats upsert
   */
  private async handleTraffic(
    payload: ExtensionSyncDto,
    companyId: string,
    productMap: Map<string, string>,
  ) {
    const period = Number(payload.period) || 14;
    const today = new Date(new Date().toISOString().slice(0, 10));
    const data: any[] = payload.data || [];
    let upserted = 0;

    const toUpsert: any[] = [];
    for (const item of data) {
      const productId = productMap.get(String(item.productId || item.vendorItemId));
      if (!productId) continue;
      toUpsert.push({
        productId,
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
              productId_date_periodDays: {
                productId: d.productId,
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

    return {
      success: true,
      type: 'traffic',
      upserted,
      skipped: data.length - upserted,
    };
  }

  // === Scrape Targets ===

  async getScrapeTargets(companyId?: string) {
    const cid = companyId || await this.getDefaultCompanyId();
    return this.prisma.scrapeTarget.findMany({
      where: { companyId: cid, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createScrapeTarget(url: string, label?: string, category?: string) {
    const companyId = await this.getDefaultCompanyId();
    return this.prisma.scrapeTarget.create({
      data: {
        companyId,
        url,
        label: label || url,
        category: category || 'advertising',
      },
    });
  }

  async markScraped(id: string) {
    return this.prisma.scrapeTarget.update({
      where: { id },
      data: { lastScrapedAt: new Date() },
    });
  }

  async deleteScrapeTarget(id: string) {
    return this.prisma.scrapeTarget.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // === Helper methods ===

  private async matchProductIdFromRow(
    companyId: string,
    productMap: Map<string, string>,
    row: Record<string, unknown>,
  ): Promise<string | null> {
    const explicitId = row.productId || row.coupangId || row.vendorItemId;
    if (explicitId) {
      const matched = productMap.get(String(explicitId));
      if (matched) return matched;
    }

    const hints = [row.productName, row.campaignName, row.keyword]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 2)
      .map((value) => value.trim());

    for (const hint of hints) {
      const found = await this.prisma.product.findFirst({
        where: {
          companyId,
          name: { contains: hint.substring(0, 18) },
          isDeleted: false,
        },
        select: { id: true },
      });
      if (found) return found.id;
    }

    return null;
  }

  private getKpiNumber(kpis: Record<string, unknown>, matchers: string[]): number {
    const normalizedMatchers = matchers.map((m) =>
      String(m || '').replace(/\s+/g, '').toLowerCase(),
    );

    for (const [label, rawValue] of Object.entries(kpis || {})) {
      const normalizedLabel = String(label || '').replace(/\s+/g, '').toLowerCase();
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

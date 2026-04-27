import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as XLSX from 'xlsx';
import { existsSync } from 'node:fs';
import { basename } from 'node:path';

const SEEDED_BY = 'scripts/seed-channel-market-data';

type Args = {
  limit: number;
  days: number;
  wingFile: string;
  resetSeed: boolean;
};

type ListingRow = {
  id: string;
  externalId: string;
  channel: string;
  channelName: string | null;
  channelPrice: number | null;
  masterId: string;
  master: {
    id: string;
    name: string;
    abcGrade: string | null;
    adTier: string | null;
  };
};

type WingRow = {
  externalId: string;
  productName: string | null;
  status: string | null;
  price: number | null;
  stockQty: number | null;
  matched: boolean;
};

function parseArgs(): Args {
  const args = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args.set(key, value ?? 'true');
  }

  return {
    limit: Number(args.get('limit') ?? 80),
    days: Number(args.get('days') ?? 14),
    wingFile: args.get('wing-file') ?? 'wing-inventory-matched 2.xlsx',
    resetSeed: args.get('reset-seed') !== 'false',
  };
}

function normalizeCell(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s === '-' || s === '0000-00-00') return null;
  return s;
}

function digits(value: unknown): string | null {
  const raw = normalizeCell(value);
  if (!raw) return null;
  const n = raw.replace(/\.0$/, '').replace(/[^0-9]/g, '');
  return n || null;
}

function money(value: unknown): number | null {
  const raw = normalizeCell(value);
  if (!raw) return null;
  const n = Number(raw.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function loadWingRows(file: string): Map<string, WingRow> {
  const rows = new Map<string, WingRow>();
  if (!existsSync(file)) {
    console.warn(`[seed] wing file not found: ${file} — DB listing values only`);
    return rows;
  }

  const workbook = XLSX.readFile(file, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
  });

  for (const row of jsonRows) {
    const externalId = digits(row['등록상품ID']);
    if (!externalId) continue;
    rows.set(externalId, {
      externalId,
      productName:
        normalizeCell(row['등록상품명']) ??
        normalizeCell(row['CPQ상품명']) ??
        normalizeCell(row['KL상품명']),
      status: normalizeCell(row['판매/승인상태']),
      price: money(row['판매가']) ?? money(row['KL판매가']),
      stockQty: money(row['재고수량']) ?? money(row['재고(KL)']),
      matched: normalizeCell(row['매칭상태']) === 'O',
    });
  }

  console.log(`[seed] loaded ${rows.size} Wing rows from ${basename(file)}`);
  return rows;
}

function kstBusinessDate(offsetFromToday: number): Date {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  kstNow.setUTCDate(kstNow.getUTCDate() - offsetFromToday);
  const yyyy = kstNow.getUTCFullYear();
  const mm = String(kstNow.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kstNow.getUTCDate()).padStart(2, '0');
  return new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
}

function businessDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function deterministicHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function gradeForIndex(index: number): 'A' | 'B' | 'C' {
  if (index % 10 < 3) return 'A';
  if (index % 10 < 7) return 'B';
  return 'C';
}

function adTierForGrade(grade: 'A' | 'B' | 'C', index: number): string | null {
  if (grade === 'A') return index % 2 === 0 ? '1차' : '2차';
  if (grade === 'B') return index % 3 === 0 ? '2차' : null;
  return index % 4 === 0 ? '3차' : null;
}

function roasFor(grade: 'A' | 'B' | 'C', index: number, day: number): number {
  const wave = ((index + day) % 5) * 12;
  if (grade === 'A') return 420 + wave;
  if (grade === 'B') return 140 + wave;
  return index % 3 === 0 ? 0 : 35 + wave;
}

function statusFromWing(row: WingRow | undefined): string {
  const raw = row?.status ?? '판매중';
  if (raw.includes('중지') || raw.includes('품절')) return 'paused';
  return 'active';
}

async function resetSeededRows(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(
    `DELETE FROM channel_account_daily_kpi_snapshots WHERE normalized_json->>'seededBy' = $1`,
    SEEDED_BY,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM channel_ad_target_daily_snapshots WHERE meta_json->>'seededBy' = $1`,
    SEEDED_BY,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM channel_listing_daily_snapshots WHERE meta_json->>'seededBy' = $1`,
    SEEDED_BY,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM channel_scrape_snapshots WHERE normalized_json->>'seededBy' = $1`,
    SEEDED_BY,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM channel_scrape_runs WHERE meta_json->>'seededBy' = $1`,
    SEEDED_BY,
  );
}

async function main() {
  const args = parseArgs();
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }
  if (args.limit <= 0 || args.days <= 0) {
    throw new Error('--limit and --days must be positive numbers');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const company = await prisma.company.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    });
    if (!company) throw new Error('No active company found');

    const wingRows = loadWingRows(args.wingFile);
    if (args.resetSeed) {
      await resetSeededRows(prisma);
      console.log('[seed] removed previous seeded market-data rows');
    }

    const listings = (await prisma.channelListing.findMany({
      where: { companyId: company.id, channel: 'coupang', isDeleted: false },
      orderBy: [{ channelName: 'asc' }, { externalId: 'asc' }],
      select: {
        id: true,
        externalId: true,
        channel: true,
        channelName: true,
        channelPrice: true,
        masterId: true,
        master: {
          select: { id: true, name: true, abcGrade: true, adTier: true },
        },
      },
    })) as ListingRow[];

    const matched = listings.filter((l) => wingRows.get(l.externalId)?.matched);
    const unmatched = listings.filter((l) => !wingRows.get(l.externalId)?.matched);
    const selected = [...matched, ...unmatched].slice(0, args.limit);
    if (selected.length === 0) {
      throw new Error('No Coupang channel listings found. Run product/channel import first.');
    }

    const run = await prisma.channelScrapeRun.create({
      data: {
        companyId: company.id,
        channel: 'coupang',
        source: 'seed',
        pageType: 'ad_ops_seed',
        businessDate: kstBusinessDate(0),
        periodStart: kstBusinessDate(args.days - 1),
        periodEnd: kstBusinessDate(0),
        status: 'running',
        parserVersion: 'seed-v1',
        metaJson: {
          seededBy: SEEDED_BY,
          wingFile: existsSync(args.wingFile) ? basename(args.wingFile) : null,
          purpose: 'local ad-ops UI smoke data for daily-fact schema',
        },
      },
    });

    let listingDailyCount = 0;
    let targetDailyCount = 0;
    let rawCount = 0;
    const accountDaily = new Map<
      string,
      {
        adSpend: number;
        adRevenue: number;
        impressions: number;
        clicks: number;
        conversions: number;
        orders: number;
        visitors: number;
        views: number;
      }
    >();

    for (const [index, listing] of selected.entries()) {
      const grade = listing.master.abcGrade === 'A' || listing.master.abcGrade === 'B' || listing.master.abcGrade === 'C'
        ? listing.master.abcGrade
        : gradeForIndex(index);
      const adTier = listing.master.adTier ?? adTierForGrade(grade, index);
      await prisma.masterProduct.update({
        where: { id: listing.masterId },
        data: {
          abcGrade: grade,
          adTier,
        },
      });

      const wing = wingRows.get(listing.externalId);
      const price = wing?.price ?? listing.channelPrice ?? 3000 + (index % 20) * 250;
      const productName = wing?.productName ?? listing.channelName ?? listing.master.name;
      const status = statusFromWing(wing);
      const hash = deterministicHash(`${listing.externalId}:${listing.id}`);
      const isOfferWinner = index % 5 !== 0;
      const winnerGap = isOfferWinner ? 0 : 80 + (hash % 420);
      const winnerPrice = isOfferWinner ? price : Math.max(100, price - winnerGap);

      for (let day = args.days - 1; day >= 0; day -= 1) {
        const businessDate = kstBusinessDate(day);
        const businessDateKey = businessDateString(businessDate);
        const freshness = args.days - day;
        const spend = Math.max(700, Math.round((price * (8 + (hash % 9))) / 10) + freshness * 37);
        const roas = roasFor(grade, index, day);
        const adRevenue = Math.round((spend * roas) / 100);
        const impressions = 900 + (hash % 2500) + freshness * 33;
        const clicks = Math.max(1, Math.round(impressions * (0.0025 + ((index % 5) + 1) * 0.0008)));
        const conversions = roas === 0 ? 0 : Math.max(1, Math.round(clicks * (0.015 + (index % 4) * 0.006)));
        const orders = conversions;
        const visitors = clicks * (3 + (index % 4));
        const views = visitors * 2 + (hash % 120);
        const cartAdds = Math.max(0, Math.round(visitors * 0.07));
        const trafficRevenue = Math.max(adRevenue, orders * price);
        const observedAt = new Date(
          Date.parse(`${businessDateKey}T${String(10 + (index % 9)).padStart(2, '0')}:15:00.000+09:00`),
        );

        const raw = await prisma.channelScrapeSnapshot.create({
          data: {
            companyId: company.id,
            scrapeRunId: run.id,
            channel: 'coupang',
            source: 'seed',
            pageType: 'ad_ops_seed',
            businessDate,
            observedAt,
            externalId: listing.externalId,
            listingId: listing.id,
            matchStatus: 'matched',
            matchReason: wing?.matched ? 'wing-inventory-matched externalId' : 'existing channel listing',
            rowHash: `${listing.externalId}:${businessDateKey}:${hash}`,
            rawJson: {
              seededBy: SEEDED_BY,
              externalId: listing.externalId,
              productName,
              wing,
              metrics: { spend, adRevenue, impressions, clicks, conversions, orders },
            },
            normalizedJson: {
              seededBy: SEEDED_BY,
              listingId: listing.id,
              businessDate: businessDateKey,
            },
          },
          select: { id: true },
        });
        rawCount += 1;

        await prisma.channelListingDailySnapshot.upsert({
          where: {
            companyId_listingId_businessDate: {
              companyId: company.id,
              listingId: listing.id,
              businessDate,
            },
          },
          create: {
            companyId: company.id,
            listingId: listing.id,
            channel: 'coupang',
            externalId: listing.externalId,
            businessDate,
            productName,
            status,
            exposureStatus: status === 'active' ? 'active' : 'restricted',
            saleStatus: status,
            channelPrice: price,
            reviewCount: 5 + (hash % 80),
            avgRating: 3.8 + ((hash % 12) / 10),
            isOfferWinner,
            myPrice: price,
            winnerPrice,
            winnerGapPrice: winnerGap,
            productRank: 1 + (hash % 120),
            categoryRank: 1 + (hash % 40),
            adSpend: spend,
            adRevenue,
            adImpressions: impressions,
            adClicks: clicks,
            adConversions: conversions,
            adOrders: orders,
            adDirectOrders1d: Math.round(orders * 0.7),
            adIndirectOrders1d: orders - Math.round(orders * 0.7),
            adDirectQty1d: Math.round(orders * 0.7),
            adIndirectQty1d: orders - Math.round(orders * 0.7),
            adDirectRevenue1d: Math.round(adRevenue * 0.7),
            adIndirectRevenue1d: adRevenue - Math.round(adRevenue * 0.7),
            adTotalOrders14d: orders,
            adDirectOrders14d: Math.round(orders * 0.7),
            adIndirectOrders14d: orders - Math.round(orders * 0.7),
            adTotalQty14d: orders,
            adDirectQty14d: Math.round(orders * 0.7),
            adIndirectQty14d: orders - Math.round(orders * 0.7),
            adTotalRevenue14d: adRevenue,
            adDirectRevenue14d: Math.round(adRevenue * 0.7),
            adIndirectRevenue14d: adRevenue - Math.round(adRevenue * 0.7),
            trafficVisitors: visitors,
            trafficViews: views,
            trafficCartAdds: cartAdds,
            trafficOrders: orders,
            trafficSalesQty: orders,
            trafficRevenue,
            sampleCount: 1,
            firstObservedAt: observedAt,
            lastObservedAt: observedAt,
            rawSnapshotId: raw.id,
            metaJson: {
              seededBy: SEEDED_BY,
              grade,
              adTier,
              source: 'seed.listing_daily',
            },
          },
          update: {
            productName,
            status,
            exposureStatus: status === 'active' ? 'active' : 'restricted',
            saleStatus: status,
            channelPrice: price,
            isOfferWinner,
            myPrice: price,
            winnerPrice,
            winnerGapPrice: winnerGap,
            adSpend: spend,
            adRevenue,
            adImpressions: impressions,
            adClicks: clicks,
            adConversions: conversions,
            adOrders: orders,
            trafficVisitors: visitors,
            trafficViews: views,
            trafficCartAdds: cartAdds,
            trafficOrders: orders,
            trafficSalesQty: orders,
            trafficRevenue,
            sampleCount: 1,
            lastObservedAt: observedAt,
            rawSnapshotId: raw.id,
            metaJson: {
              seededBy: SEEDED_BY,
              grade,
              adTier,
              source: 'seed.listing_daily',
            },
          },
        });
        listingDailyCount += 1;

        const targetKey = `campaign:${listing.externalId}`;
        const campaignName = `${grade}등급_${listing.master.name.slice(0, 24)} 캠페인`;
        await prisma.channelAdTargetDailySnapshot.upsert({
          where: {
            companyId_channel_businessDate_targetType_targetKey: {
              companyId: company.id,
              channel: 'coupang',
              businessDate,
              targetType: 'campaign',
              targetKey,
            },
          },
          create: {
            companyId: company.id,
            channel: 'coupang',
            businessDate,
            listingId: listing.id,
            externalId: listing.externalId,
            targetType: 'campaign',
            targetKey,
            campaignId: `seed-${listing.externalId}`,
            campaignName,
            status: status === 'active' ? 'ON' : 'OFF',
            onOff: status === 'active' ? 'ON' : 'OFF',
            currentBid: 250 + (hash % 700),
            dailyBudget: Math.max(3000, spend * 2),
            spend,
            revenue: adRevenue,
            impressions,
            clicks,
            conversions,
            orders,
            adSpend: spend,
            adRevenue,
            rawSnapshotId: raw.id,
            metaJson: {
              seededBy: SEEDED_BY,
              source: 'seed.ad_target_daily',
              productName,
            },
          },
          update: {
            listingId: listing.id,
            campaignName,
            status: status === 'active' ? 'ON' : 'OFF',
            onOff: status === 'active' ? 'ON' : 'OFF',
            currentBid: 250 + (hash % 700),
            dailyBudget: Math.max(3000, spend * 2),
            spend,
            revenue: adRevenue,
            impressions,
            clicks,
            conversions,
            orders,
            adSpend: spend,
            adRevenue,
            rawSnapshotId: raw.id,
            metaJson: {
              seededBy: SEEDED_BY,
              source: 'seed.ad_target_daily',
              productName,
            },
          },
        });
        targetDailyCount += 1;

        const dayAgg = accountDaily.get(businessDateKey) ?? {
          adSpend: 0,
          adRevenue: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          orders: 0,
          visitors: 0,
          views: 0,
        };
        dayAgg.adSpend += spend;
        dayAgg.adRevenue += adRevenue;
        dayAgg.impressions += impressions;
        dayAgg.clicks += clicks;
        dayAgg.conversions += conversions;
        dayAgg.orders += orders;
        dayAgg.visitors += visitors;
        dayAgg.views += views;
        accountDaily.set(businessDateKey, dayAgg);
      }
    }

    const monthStart = new Date();
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const yyyy = kst.getUTCFullYear();
    const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
    const startDate = `${yyyy}-${mm}-01`;
    monthStart.setUTCFullYear(yyyy, Number(mm) - 1, 1);
    monthStart.setUTCHours(0, 0, 0, 0);

    for (const [dateKey, sums] of accountDaily.entries()) {
      const businessDate = new Date(`${dateKey}T00:00:00.000Z`);
      const roas = sums.adSpend > 0 ? Math.round((sums.adRevenue / sums.adSpend) * 10000) / 100 : 0;
      await prisma.channelAccountDailyKpiSnapshot.upsert({
        where: {
          companyId_channel_source_businessDate_kpiType: {
            companyId: company.id,
            channel: 'coupang',
            source: 'wing',
            businessDate,
            kpiType: 'wing_dashboard',
          },
        },
        create: {
          companyId: company.id,
          channel: 'coupang',
          source: 'wing',
          kpiType: 'wing_dashboard',
          businessDate,
          periodStart: monthStart,
          periodEnd: businessDate,
          normalizedJson: {
            seededBy: SEEDED_BY,
            startDate,
            endDate: dateKey,
            adSummary: {
              adGmv: sums.adRevenue,
              adSpend: sums.adSpend,
              impressions: sums.impressions,
              clicks: sums.clicks,
              conversions: sums.conversions,
              orders: sums.orders,
              roas,
            },
            kpis: {
              광고비: `${sums.adSpend.toLocaleString('ko-KR')}원`,
              광고매출: `${sums.adRevenue.toLocaleString('ko-KR')}원`,
              ROAS: `${roas}%`,
              클릭수: `${sums.clicks.toLocaleString('ko-KR')}`,
              방문자수: `${sums.visitors.toLocaleString('ko-KR')}`,
              조회수: `${sums.views.toLocaleString('ko-KR')}`,
            },
          },
          rawJson: { seededBy: SEEDED_BY, sums },
        },
        update: {
          periodStart: monthStart,
          periodEnd: businessDate,
          normalizedJson: {
            seededBy: SEEDED_BY,
            startDate,
            endDate: dateKey,
            adSummary: {
              adGmv: sums.adRevenue,
              adSpend: sums.adSpend,
              impressions: sums.impressions,
              clicks: sums.clicks,
              conversions: sums.conversions,
              orders: sums.orders,
              roas,
            },
            kpis: {
              광고비: `${sums.adSpend.toLocaleString('ko-KR')}원`,
              광고매출: `${sums.adRevenue.toLocaleString('ko-KR')}원`,
              ROAS: `${roas}%`,
              클릭수: `${sums.clicks.toLocaleString('ko-KR')}`,
              방문자수: `${sums.visitors.toLocaleString('ko-KR')}`,
              조회수: `${sums.views.toLocaleString('ko-KR')}`,
            },
          },
          rawJson: { seededBy: SEEDED_BY, sums },
          sampleCount: 1,
        },
      });
    }

    const latestDate = kstBusinessDate(0);
    const winnerCount = selected.filter((_, i) => i % 5 !== 0).length;
    const nonWinnerCount = selected.length - winnerCount;
    await prisma.channelAccountDailyKpiSnapshot.upsert({
      where: {
        companyId_channel_source_businessDate_kpiType: {
          companyId: company.id,
          channel: 'coupang',
          source: 'wing',
          businessDate: latestDate,
          kpiType: 'wing_itemwinner_kpi',
        },
      },
      create: {
        companyId: company.id,
        channel: 'coupang',
        source: 'wing',
        kpiType: 'wing_itemwinner_kpi',
        businessDate: latestDate,
        normalizedJson: {
          seededBy: SEEDED_BY,
          kpis: {
            '아이템위너 보유': `${winnerCount}`,
            '아이템위너 미보유': `${nonWinnerCount}`,
            '노출제한 의심': `${Math.ceil(nonWinnerCount / 3)}`,
            '관측 listing': `${selected.length}`,
          },
        },
        rawJson: { seededBy: SEEDED_BY },
      },
      update: {
        normalizedJson: {
          seededBy: SEEDED_BY,
          kpis: {
            '아이템위너 보유': `${winnerCount}`,
            '아이템위너 미보유': `${nonWinnerCount}`,
            '노출제한 의심': `${Math.ceil(nonWinnerCount / 3)}`,
            '관측 listing': `${selected.length}`,
          },
        },
        rawJson: { seededBy: SEEDED_BY },
        sampleCount: 1,
      },
    });

    await prisma.channelScrapeRun.update({
      where: { id: run.id },
      data: {
        status: 'complete',
        rowCount: rawCount,
        matchedCount: rawCount,
        unmatchedCount: 0,
        errorCount: 0,
        finishedAt: new Date(),
      },
    });

    console.log(
      `[seed] company=${company.name} listings=${selected.length} days=${args.days} raw=${rawCount} listingDaily=${listingDailyCount} adTargetDaily=${targetDailyCount} accountKpi=${accountDaily.size + 1}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[seed] failed:', error);
  process.exitCode = 1;
});

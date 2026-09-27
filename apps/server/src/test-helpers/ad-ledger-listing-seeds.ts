import type { PrismaClient } from '@prisma/client';
import { AD_REPORT_KIND } from '@kiditem/shared/advertising-operations';
import { seedAdReportRun } from './ad-ledger-seeds';

/**
 * 리스팅 하루의 광고 성과를 새 광고 원장(KID-371)에 심는다 — PG 스펙 공용(KID-372). 리스팅의 채널 계정에 그날을 덮는 성공한
 * `advertising.ad_report` 실행이 없으면 하루짜리 실행을 만들어 그날을 측정한 날로 만든다(계정이 여럿이면 모두 덮어야 측정한 날).
 * 같은 (리스팅 옵션, 캠페인, 날)을 두 번 심으면 값을 더한다. 옛 `finance-seeds.seedAd`(옛 원장)를 대신한다.
 */
export async function seedAdListingDay(
  prisma: PrismaClient,
  opts: {
    organizationId: string;
    listingId: string;
    /** 달력일 `YYYY-MM-DD`. */
    date: string;
    spend: number;
    /** 비우면 `spend`와 같다. */
    billedSpend?: number;
    revenue?: number;
    impressions?: number;
    clicks?: number;
    /** 보고서 주문수 = 전환. */
    orders?: number;
    campaignId?: string;
    adGroupId?: string;
    /** 비우면 리스팅마다 하나(`VI-<listingId>`). */
    vendorItemId?: string;
  },
): Promise<{ operationId: string; channelAccountId: string }> {
  const listing = await prisma.channelListing.findFirstOrThrow({
    where: { id: opts.listingId, organizationId: opts.organizationId },
    select: { channelAccountId: true },
  });
  const channelAccountId = listing.channelAccountId;
  const operationId = await measuredRunCovering(prisma, opts.organizationId, channelAccountId, opts.date);
  const date = new Date(`${opts.date}T00:00:00.000Z`);
  const campaignId = opts.campaignId ?? 'C1';
  const adGroupId = opts.adGroupId ?? '';
  const vendorItemId = opts.vendorItemId ?? `VI-${opts.listingId}`;
  const metrics = {
    spend: opts.spend,
    billedSpend: opts.billedSpend ?? opts.spend,
    revenue: opts.revenue ?? 0,
    impressions: opts.impressions ?? 0,
    clicks: opts.clicks ?? 0,
    orders: opts.orders ?? 0,
    units: opts.orders ?? 0,
  };
  await prisma.channelAdProductDailySnapshot.upsert({
    where: {
      organizationId_channelAccountId_date_campaignId_adGroupId_vendorItemId: {
        organizationId: opts.organizationId, channelAccountId, date, campaignId, adGroupId, vendorItemId,
      },
    },
    create: {
      organizationId: opts.organizationId, channelAccountId, date, campaignId, adGroupId, vendorItemId,
      listingId: opts.listingId, operationId, ...metrics,
    },
    update: Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, { increment: value }])),
  });
  return { operationId, channelAccountId };
}

async function measuredRunCovering(
  prisma: PrismaClient,
  organizationId: string,
  channelAccountId: string,
  date: string,
): Promise<string> {
  const day = new Date(`${date}T00:00:00.000Z`);
  const existing = await prisma.operation.findFirst({
    where: {
      organizationId,
      kind: AD_REPORT_KIND,
      status: 'succeeded',
      windowStart: { lte: day },
      windowEnd: { gte: day },
      plan: { path: ['channelAccountId'], equals: channelAccountId },
    },
    select: { id: true },
  });
  if (existing) return existing.id;
  return (await seedAdReportRun(prisma, { organizationId, channelAccountId, start: date, end: date })).id;
}

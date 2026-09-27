import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { AD_REPORT_KIND } from '@kiditem/shared/advertising-operations';

/**
 * 새 광고 원장(KID-371) 시드 — PG 스펙 공용(KID-372). 측정 근거는 성공한 `advertising.ad_report` 실행의 확정 창이고,
 * 값은 상품 사실 표·정산 표 행이다. 옛 `seedAd`/`seedCompletedAdSweepRun`(옛 원장)은 KID-373에서 사라진다.
 */
const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

/** 활성 쿠팡 채널 계정 한 줄. `status`를 바꾸면 측정 기준에서 빠진다. */
export async function seedCoupangAdAccount(
  prisma: PrismaClient,
  input: { organizationId: string; externalAccountId: string; status?: string; vendorId?: string | null },
): Promise<{ id: string }> {
  return prisma.channelAccount.create({
    data: {
      organizationId: input.organizationId,
      channel: 'coupang',
      name: input.externalAccountId,
      externalAccountId: input.externalAccountId,
      isPrimary: false,
      status: input.status ?? 'active',
    },
    select: { id: true },
  });
}

/** 확정 창 `[start, end]`(달력일)을 남긴 광고 보고서 실행 한 줄. 기본 `succeeded`. */
export async function seedAdReportRun(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    channelAccountId: string;
    start: string;
    end: string;
    finishedAt?: string;
    status?: string;
  },
): Promise<{ id: string }> {
  return prisma.operation.create({
    data: {
      organizationId: input.organizationId,
      kind: AD_REPORT_KIND,
      status: input.status ?? 'succeeded',
      token: randomUUID(),
      expiresAt: day(input.end),
      plan: { channelAccountId: input.channelAccountId, startDate: input.start, endDate: input.end },
      windowStart: day(input.start),
      windowEnd: day(input.end),
      finishedAt: new Date(input.finishedAt ?? `${input.end}T15:30:00.000Z`),
      attempts: 1,
    },
    select: { id: true },
  });
}

export type AdProductDaySeed = {
  organizationId: string;
  channelAccountId: string;
  operationId: string;
  date: string;
  listingId?: string | null;
  campaignId?: string;
  adGroupId?: string;
  vendorItemId?: string;
  optionName?: string | null;
  impressions?: number;
  clicks?: number;
  spend?: number;
  /** 비우면 `spend`와 같다(정산 미확인 = 청구액이 집행액). */
  billedSpend?: number;
  orders?: number;
  units?: number;
  revenue?: number;
};

/** 상품 사실 표 행들. 유니크 키 (조직·계정·날·캠페인·광고그룹·옵션)가 겹치지 않게 `vendorItemId`/`campaignId`를 다르게 준다. */
export async function seedAdProductDays(prisma: PrismaClient, rows: readonly AdProductDaySeed[]): Promise<void> {
  if (rows.length === 0) return;
  await prisma.channelAdProductDailySnapshot.createMany({
    data: rows.map((row) => ({
      organizationId: row.organizationId,
      channelAccountId: row.channelAccountId,
      operationId: row.operationId,
      date: day(row.date),
      campaignId: row.campaignId ?? 'C1',
      adGroupId: row.adGroupId ?? '',
      vendorItemId: row.vendorItemId ?? 'VI-1',
      listingId: row.listingId ?? null,
      optionName: row.optionName ?? null,
      impressions: row.impressions ?? 0,
      clicks: row.clicks ?? 0,
      spend: row.spend ?? 0,
      orders: row.orders ?? 0,
      units: row.units ?? row.orders ?? 0,
      revenue: row.revenue ?? 0,
      billedSpend: row.billedSpend ?? row.spend ?? 0,
    })),
  });
}

export type AdBillingSeed = {
  organizationId: string;
  channelAccountId: string;
  operationId: string;
  date: string;
  settlementDomain?: 'SELLER' | 'RETAIL';
  /** '' 이면 계정 조정 행(캠페인에 붙일 수 없는 정산). */
  campaignKey: string;
  deliveredSpend?: number;
  billedSpend: number;
  promotionAdjustment?: number;
  billableAdjustment?: number;
};

/** 정산 표 행들. */
export async function seedAdBillings(prisma: PrismaClient, rows: readonly AdBillingSeed[]): Promise<void> {
  if (rows.length === 0) return;
  await prisma.channelAdDailyBilling.createMany({
    data: rows.map((row) => ({
      organizationId: row.organizationId,
      channelAccountId: row.channelAccountId,
      operationId: row.operationId,
      date: day(row.date),
      settlementDomain: row.settlementDomain ?? 'SELLER',
      campaignKey: row.campaignKey,
      deliveredSpend: row.deliveredSpend ?? row.billedSpend,
      billedSpend: row.billedSpend,
      promotionAdjustment: row.promotionAdjustment ?? 0,
      billableAdjustment: row.billableAdjustment ?? 0,
    })),
  });
}

/** 캠페인 현재 상태 한 줄(`ChannelAdCampaign`). 규칙·rollup 스펙용. */
export async function seedAdCampaign(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    channelAccountId: string;
    operationId: string;
    campaignId: string;
    name?: string;
    isActive?: boolean;
    status?: string | null;
    budget?: number | null;
    roasTarget?: number | null;
  },
): Promise<void> {
  await prisma.channelAdCampaign.create({
    data: {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      operationId: input.operationId,
      campaignId: input.campaignId,
      name: input.name ?? `캠페인 ${input.campaignId}`,
      isActive: input.isActive ?? true,
      status: input.status ?? null,
      budget: input.budget ?? null,
      roasTarget: input.roasTarget ?? null,
      lastSeenAt: new Date(),
    },
  });
}

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

/**
 * 리스팅 하루 광고 한 줄을 "측정한 날"로 심는다(KID-372 ①b 소비처 스펙용). 리스팅의 채널 계정에 그 날을 덮는 성공 실행이
 * 없으면 하루 창 실행을 만들고, 그 실행에 상품 사실 행을 붙인다. 측정은 활성 쿠팡 계정 **모두**가 덮어야 하므로 계정이
 * 여럿인 스펙은 다른 계정에도 `seedAdReportRun`을 따로 심는다. `vendorItemId`는 리스팅마다 다르게 기본값을 준다.
 */
export async function seedListingAdDay(
  prisma: PrismaClient,
  input: Omit<AdProductDaySeed, 'channelAccountId' | 'operationId' | 'listingId'> & { listingId: string },
): Promise<{ operationId: string; channelAccountId: string }> {
  const listing = await prisma.channelListing.findFirstOrThrow({
    where: { id: input.listingId, organizationId: input.organizationId },
    select: { channelAccountId: true, externalId: true },
  });
  const operationId = await ensureAdReportDay(prisma, {
    organizationId: input.organizationId,
    channelAccountId: listing.channelAccountId,
    date: input.date,
  });
  await seedAdProductDays(prisma, [{
    ...input,
    channelAccountId: listing.channelAccountId,
    operationId,
    vendorItemId: input.vendorItemId ?? `VI-${listing.externalId}`,
  }]);
  return { operationId, channelAccountId: listing.channelAccountId };
}

/** 계정의 그 날을 덮는 성공 실행 id. 없으면 하루 창 실행을 만든다. */
export async function ensureAdReportDay(
  prisma: PrismaClient,
  input: { organizationId: string; channelAccountId: string; date: string },
): Promise<string> {
  const existing = await prisma.operation.findFirst({
    where: {
      organizationId: input.organizationId,
      kind: AD_REPORT_KIND,
      status: 'succeeded',
      windowStart: { lte: day(input.date) },
      windowEnd: { gte: day(input.date) },
      plan: { path: ['channelAccountId'], equals: input.channelAccountId },
    },
    select: { id: true },
  });
  if (existing) return existing.id;
  const run = await seedAdReportRun(prisma, {
    organizationId: input.organizationId,
    channelAccountId: input.channelAccountId,
    start: input.date,
    end: input.date,
  });
  return run.id;
}

/**
 * 조직의 쿠팡 계정(지정이 없으면 대표·가장 오래된 계정) 하나에 확정 창 `[start, end]`의 성공 실행을 심는다. 창 안의 날은
 * 이 계정에 대해 측정한 날이 되고, 뒤이은 `seedListingAdDay`가 같은 실행에 행을 붙인다.
 */
export async function seedAdReportWindow(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    channelAccountId?: string;
    start: string;
    end: string;
    status?: string;
    /** 실행이 요청한 끝(`plan.endDate`). 비우면 `end` — 주면 `end`보다 늦은 날을 요청하고 보류한 실행이다. */
    requestedEnd?: string;
  },
): Promise<string> {
  const account = await prisma.channelAccount.findFirstOrThrow({
    where: {
      organizationId: input.organizationId,
      channel: 'coupang',
      ...(input.channelAccountId ? { id: input.channelAccountId } : {}),
    },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  const run = await seedAdReportRun(prisma, {
    organizationId: input.organizationId,
    channelAccountId: account.id,
    start: input.start,
    end: input.end,
    status: input.status,
  });
  if (input.requestedEnd) {
    await prisma.operation.update({
      where: { id: run.id },
      data: { plan: { channelAccountId: account.id, startDate: input.start, endDate: input.requestedEnd } },
    });
  }
  return run.id;
}

/**
 * 측정 근거가 없는 리스팅 하루 행: 실패한 실행에 붙은 상품 사실 행이다. 행은 있어도 그 날은 측정한 날이 아니다(KID-45) —
 * 옛 원장의 "완료 선언 없는 행"(`runId: null`)에 해당한다.
 */
export async function seedUnmeasuredListingAdDay(
  prisma: PrismaClient,
  input: Omit<AdProductDaySeed, 'channelAccountId' | 'operationId' | 'listingId'> & { listingId: string },
): Promise<void> {
  const listing = await prisma.channelListing.findFirstOrThrow({
    where: { id: input.listingId, organizationId: input.organizationId },
    select: { channelAccountId: true, externalId: true },
  });
  const failed = await seedAdReportRun(prisma, {
    organizationId: input.organizationId,
    channelAccountId: listing.channelAccountId,
    start: input.date,
    end: input.date,
    status: 'failed',
  });
  await seedAdProductDays(prisma, [{
    ...input,
    channelAccountId: listing.channelAccountId,
    operationId: failed.id,
    vendorItemId: input.vendorItemId ?? `VI-${listing.externalId}`,
  }]);
}

/** 조직의 새 광고 원장과 광고 보고서 실행을 모두 지운다 — 스펙이 공용 픽스처의 측정을 걷어낼 때. */
export async function clearAdReportLedger(prisma: PrismaClient, organizationId: string): Promise<void> {
  await prisma.channelAdProductDailySnapshot.deleteMany({ where: { organizationId } });
  await prisma.channelAdKeywordDailySnapshot.deleteMany({ where: { organizationId } });
  await prisma.channelAdDailyBilling.deleteMany({ where: { organizationId } });
  await prisma.operation.deleteMany({ where: { organizationId, kind: AD_REPORT_KIND } });
}

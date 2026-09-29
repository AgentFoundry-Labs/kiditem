import type { OwnerTransaction } from '../../../../../common/owner-transaction';

/**
 * 광고가 다른 owner(analytics·finance·products·readiness·common 이익 계산)에 내주는 읽기 capability(ADR-0021, KID-372).
 * 새 광고 원장(`ChannelAdProductDailySnapshot`·`ChannelAdKeywordDailySnapshot`·`ChannelAdDailyBilling`)과 실행 창에서
 * 읽는다. 소비처는 이 포트만 주입받고 광고의 리더 파일을 직접 import하지 않는다(`check:ledger-readers`).
 *
 * 광고비 규칙은 `domain/ad-spend-rule.ts`: 이익은 `billedSpend`+`adjustment`에 부가세, 성과는 `spend`.
 * 측정한 날 규칙은 `domain/ad-report-coverage.ts`: 활성 쿠팡 계정 모두의 성공 실행 창이 덮은 날.
 */
export const ADVERTISING_LEDGER_READ_PORT = Symbol('AdvertisingLedgerReadPort');

/** 달력일 창. `from` 포함, `to` 제외, 둘 다 `YYYY-MM-DD`(KST 달력일). 비우면 열린 끝. */
export type AdCalendarWindow = Readonly<{ organizationId: string; from?: string; to?: string }>;

export type AdCoverage = Readonly<{
  /** 조직이 광고를 측정한 달력일, 오름차순. 이 목록이 곧 coverage다 — 없는 날은 수집하지 않은 날이지 0이 아니다. */
  measuredDates: readonly string[];
  latestMeasuredDate: string | null;
  /** 측정에 든 실행 가운데 가장 늦게 끝난 시각. */
  observedAt: Date | null;
  /** 측정의 기준이 된 활성 쿠팡 계정. */
  activeAccountIds: readonly string[];
}>;

/** 조직이 측정한 하루의 합. 측정한 날인데 행이 없으면 모두 0인 날로 온다(측정했는데 0). */
export type AdWindowDay = Readonly<{
  businessDate: string;
  /** 광고센터 집행액(성과 기준). */
  spend: number;
  /** 상품 행에 배분된 정산 청구액. */
  billedSpend: number;
  /** 계정 조정 행(캠페인 키 '')의 청구액 — 캠페인에 붙일 수 없는 정산. 이익 광고비에만 더한다. */
  adjustment: number;
  revenue: number;
  impressions: number;
  clicks: number;
  orders: number;
  units: number;
}>;

export type AdWindowFacts = Readonly<{
  days: readonly AdWindowDay[];
  observedAt: Date | null;
}>;

/** 한 리스팅의 창 합. coverage는 계정 단위라, 측정한 날에 여기 없는 리스팅은 그날 광고비 0이다. */
export type AdListingWindowFacts = Readonly<{
  listingId: string;
  /** 이 리스팅의 행이 있던 측정일 수. */
  days: number;
  firstDate: string;
  lastDate: string;
  observedAt: Date | null;
  spend: number;
  billedSpend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  orders: number;
  units: number;
}>;

/**
 * 원천상품 한 달 광고비 배분(기여이익, 읽을 때 계산). 측정한 날의 리스팅 광고비를 현재 확정 레시피 무게로 원천상품에 나눈다.
 * 계정 조정(캠페인 키 '')·리스팅에 못 맞춘 상품 행·레시피 없는 리스팅은 배분하지 않는다.
 */
export type MonthlyAdAllocation = Readonly<{
  masterProductId: string;
  channelListingId: string;
  channelAccountId: string;
  /** `YYYY-MM`. */
  month: string;
  /** 집행액 배분(성과). */
  allocatedSpend: number;
  /** 청구액 배분(이익, 부가세 전). */
  allocatedBilledSpend: number;
  /** 그 달에 측정한 날 수. */
  measuredDays: number;
}>;

export interface AdvertisingLedgerReadPort {
  /** 조직에 활성 쿠팡 계정이 있는가 — 없으면 광고는 "적용 안 함"(0)이지 미측정이 아니다. */
  advertisingApplies(transaction: OwnerTransaction, organizationId: string): Promise<boolean>;
  readAdCoverage(transaction: OwnerTransaction, window: AdCalendarWindow): Promise<AdCoverage>;
  readAdWindowFacts(transaction: OwnerTransaction, window: AdCalendarWindow): Promise<AdWindowFacts>;
  readListingAdWindowFacts(transaction: OwnerTransaction, window: AdCalendarWindow): Promise<AdListingWindowFacts[]>;
  /**
   * 기여이익 월 배분(읽을 때 계산). `months`는 `YYYY-MM` 목록, `from`(포함)·`to`(제외)는 달력일 창 — 주면 그 안의 측정일만
   * 배분한다(기간이 달 중간에서 시작·끝날 때).
   */
  readMonthlyAdAllocation(
    transaction: OwnerTransaction,
    input: Readonly<{ organizationId: string; months: readonly string[]; from?: string; to?: string }>,
  ): Promise<MonthlyAdAllocation[]>;
  /**
   * 소비처가 광고에 요구할 마지막 날(`YYYY-MM-DD`, 옛 `readAdEvidenceCutoff` 규칙): 닫힌 날 `closedDay`. 단 활성 쿠팡 계정
   * 모두의 가장 최근 성공한 광고 보고서가 그날을 **요청하고** 보류했으면(확정 창이 그 전날에 끝남) 그 확정 끝 중 가장 이른 날
   * (`domain/ad-report-confirmation.ts` `adReportEvidenceCutoff`).
   */
  readAdEvidenceCutoff(
    transaction: OwnerTransaction,
    input: Readonly<{ organizationId: string; closedDay: string }>,
  ): Promise<string>;
}

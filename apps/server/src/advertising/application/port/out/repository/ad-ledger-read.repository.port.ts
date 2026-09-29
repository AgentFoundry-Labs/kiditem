import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type {
  AdCoverage,
  AdListingWindowFacts,
  AdWindowFacts,
} from '../../in/ledger/advertising-ledger-read.port';

export const AD_LEDGER_READ_REPOSITORY_PORT = Symbol('AdLedgerReadRepositoryPort');

/** 조직·활성 계정·달력일 창으로 좁힌 원장 읽기 범위. 활성 계정은 application 서비스가 Channels capability로 구한다. */
export type AdLedgerReadScope = Readonly<{
  organizationId: string;
  activeAccountIds: readonly string[];
  /** 달력일 `YYYY-MM-DD`, 포함. */
  from?: string;
  /** 달력일 `YYYY-MM-DD`, 제외. */
  to?: string;
}>;

/**
 * 새 광고 원장(상품 사실 표·정산 표)과 `advertising.ad_report` 실행 창을 읽는 출력 포트(KID-372).
 * 구현은 `adapter/out/persistence/ad-ledger-read.repository.ts`. KID-372 ①a가 캠페인·상품·키워드 rollup과 규칙 입력을,
 * ①b는 월 배분을 이 포트에 더한다(같은 어댑터 파일에 메서드 추가, 새 `read/` 폴더는 만들지 않는다 — ADR-0021).
 */
/** 한 캠페인으로 좁힌다(광고 운영 화면의 캠페인 상세). */
export type AdCampaignSelector = Readonly<{ channelAccountId: string; campaignId: string }>;

/** 측정한 날에 쌓인 성과 합. 광고비는 집행액(`spend`, 성과)과 청구액(`billedSpend`, 이익) 둘 다 싣는다. */
export type AdPerformanceSums = Readonly<{
  spend: number;
  billedSpend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  orders: number;
  units: number;
}>;

/**
 * 캠페인 한 줄: `ChannelAdCampaign`의 현재 상태(지운 캠페인 제외)와 측정한 날의 상품 행 합. 측정한 날에 행이 없는 캠페인은
 * 합이 0이다. `budget` 단위는 광고센터 원문 그대로이고 KID-371 QA에서 아직 확인하지 못했다(원/일로 가정하는 규칙은 스펙 이름에 적는다).
 */
export type AdCampaignWindowRollup = AdPerformanceSums & Readonly<{
  channelAccountId: string;
  campaignId: string;
  campaignName: string;
  isActive: boolean;
  status: string | null;
  budget: number | null;
  roasTarget: number | null;
  /** 창 안에서 이 캠페인이 광고한 리스팅(맞춘 것만). */
  listingIds: readonly string[];
  /** 창 안에서 이 캠페인이 광고한 옵션(`vendorItemId`). */
  vendorItemIds: readonly string[];
}>;

/** 광고 상품 한 줄: (캠페인, 광고그룹, 광고 옵션)의 측정한 날 합. 상태는 `ChannelAdCampaignAd`에서, 없으면 null. */
export type AdProductWindowRollup = AdPerformanceSums & Readonly<{
  channelAccountId: string;
  campaignId: string;
  campaignName: string | null;
  adGroupId: string;
  vendorItemId: string;
  listingId: string | null;
  optionName: string | null;
  isActive: boolean | null;
  status: string | null;
  /** 이 줄의 행이 있던 측정일 수. */
  days: number;
}>;

/**
 * 키워드 한 줄: (캠페인, 광고그룹, 광고 옵션, 키워드)의 측정한 날 일별 행 합. 클릭이 있던 날만 행이 있고 상품 합에 더하지
 * 않는다. 비검색 노출은 `keyword ''`이고 `nonSearch`로 따로 표시한다. 리스팅은 같은 옵션의 상품 행에서 찾는다.
 */
export type AdKeywordWindowRollup = Omit<AdPerformanceSums, 'billedSpend'> & Readonly<{
  channelAccountId: string;
  campaignId: string;
  campaignName: string | null;
  adGroupId: string;
  vendorItemId: string;
  keyword: string;
  nonSearch: boolean;
  listingId: string | null;
  optionName: string | null;
  days: number;
  lastDate: string;
}>;

export type AdWindowRollups<Row> = Readonly<{ coverage: AdCoverage; rows: readonly Row[] }>;

/** 규칙 입력(KID-372): 최근 측정일 창의 캠페인·키워드 합과 캠페인 현재 상태. 입찰가는 없다. */
export type AdCurrentTargets = Readonly<{
  /** 규칙이 본 측정일(최근 `recentMeasuredDays`개), 오름차순. */
  measuredDates: readonly string[];
  latestMeasuredDate: string | null;
  campaigns: readonly AdCampaignWindowRollup[];
  keywords: readonly AdKeywordWindowRollup[];
}>;

/** 규칙이 보는 최근 측정일 수. */
export const AD_RULE_RECENT_MEASURED_DAYS = 14;

export interface AdLedgerReadRepositoryPort {
  readAdCoverage(transaction: OwnerTransaction, scope: AdLedgerReadScope): Promise<AdCoverage>;
  readAdWindowFacts(transaction: OwnerTransaction, scope: AdLedgerReadScope): Promise<AdWindowFacts>;
  readListingAdWindowFacts(transaction: OwnerTransaction, scope: AdLedgerReadScope): Promise<AdListingWindowFacts[]>;
  readCampaignWindowRollups(transaction: OwnerTransaction, scope: AdLedgerReadScope): Promise<AdWindowRollups<AdCampaignWindowRollup>>;
  readProductWindowRollups(
    transaction: OwnerTransaction,
    scope: AdLedgerReadScope & Readonly<{ campaign?: AdCampaignSelector }>,
  ): Promise<AdWindowRollups<AdProductWindowRollup>>;
  readKeywordWindowRollups(
    transaction: OwnerTransaction,
    scope: AdLedgerReadScope & Readonly<{ campaign?: AdCampaignSelector }>,
  ): Promise<AdWindowRollups<AdKeywordWindowRollup>>;
  /** 창을 받지 않는다 — 조직 전체 측정일 가운데 최근 `recentMeasuredDays`(기본 14)개를 본다. */
  readCurrentAdTargets(
    transaction: OwnerTransaction,
    scope: Omit<AdLedgerReadScope, 'from' | 'to'> & Readonly<{ recentMeasuredDays?: number }>,
  ): Promise<AdCurrentTargets>;

  /** 활성 계정마다 가장 최근 성공한 광고 보고서 실행의 요청 끝·확정 끝(없으면 `null`), `activeAccountIds` 순서. */
  readNewestAdReportEnds(
    transaction: OwnerTransaction,
    scope: Pick<AdLedgerReadScope, 'organizationId' | 'activeAccountIds'>,
  ): Promise<Array<Readonly<{ requestedEnd: string; confirmedEnd: string }> | null>>;
}

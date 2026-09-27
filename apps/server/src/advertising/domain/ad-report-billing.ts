import type {
  AdReportReconciliationWarning,
  AdReportSettlementRow,
  AdSettlementDomain,
} from '@kiditem/shared/advertising-operations';

/**
 * 광고 보고서 정산 배분(KID-367·368·371). 상품 행의 청구액 = 집행액 × (그 캠페인·그날 정산 청구액 ÷ 보고서 집행액 합).
 * 원 단위 나머지까지 배분해 캠페인·날의 상품 청구액 합이 정산 청구액과 같다.
 */

/**
 * `billed`를 `spends` 비율로 나눈다. 내림한 몫의 합과 `billed`의 차(원)는 집행액이 큰 행부터(같으면 앞 행부터)
 * 1원씩 더한다. 집행액 합이 0 이하이면 나눌 기준이 없으므로 호출하지 않는다.
 */
export function allocateBilledSpend(spends: readonly number[], billed: number): number[] {
  const total = spends.reduce((sum, spend) => sum + spend, 0);
  if (total <= 0) throw new Error('allocateBilledSpend: spend total must be positive');
  const shares = spends.map((spend) => Math.floor((spend * billed) / total));
  let remainder = billed - shares.reduce((sum, share) => sum + share, 0);
  const order = spends.map((spend, index) => ({ spend, index })).sort((a, b) => b.spend - a.spend || a.index - b.index);
  for (let cursor = 0; remainder > 0; cursor = (cursor + 1) % order.length) {
    shares[order[cursor].index] += 1;
    remainder -= 1;
  }
  return shares;
}

/** 캠페인이 없거나 보고서에 짝이 없는 정산을 모으는 계정 광고비 조정 행의 캠페인 키. */
export const ACCOUNT_ADJUSTMENT_CAMPAIGN_KEY = '';

/** 대조 경고 문턱: 정산 집행액의 1%와 1,000원 중 큰 값을 넘는 차이(2026-09-25 15:56 결정). */
const WARNING_MIN_WON = 1_000;
const WARNING_RATIO = 0.01;

export type AdReportBilledProduct = Readonly<{ date: string; campaignId: string; spend: number }>;

export type AdReportBilling = {
  date: string;
  settlementDomain: AdSettlementDomain;
  campaignKey: string;
  deliveredSpend: number;
  billedSpend: number;
  promotionAdjustment: number;
  billableAdjustment: number;
};

export type AdReportSettlement = {
  /** `products`와 같은 순서의 상품 청구액. */
  billedSpend: number[];
  /** (날짜, 정산 영역, 캠페인 키)마다 한 행. 짝 없는 정산은 캠페인 키 ''에 모인다. */
  billings: AdReportBilling[];
  /** 보고서 광고비가 있는데 정산이 없어 청구액 = 집행액으로 넣은 캠페인×일 수. */
  unsettledCampaignDays: number;
  /** 계정 조정 행으로 모은 정산 행 수. */
  accountAdjustmentRows: number;
  warnings: AdReportReconciliationWarning[];
};

/**
 * 창 안 상품 행(검색/비검색을 더한 행)과 정산 행을 캠페인×일로 맞춘다.
 * - 보고서 광고비 합이 0보다 큰 캠페인×일에 정산이 있으면 영역을 더한 청구액을 상품 행에 배분하고 캠페인 키로 적는다.
 * - 정산이 없으면 상품 청구액 = 집행액. 광고비가 있던 날만 "정산 미확인"으로 센다.
 * - 캠페인 없는 정산과 보고서 광고비가 없는 캠페인×일의 정산은 (날짜, 영역)의 계정 조정 행에 더한다.
 * - 짝이 맞은 캠페인×일은 보고서 광고비 합과 정산 집행액을 대조해 문턱을 넘으면 경고한다. 데이터는 그대로다.
 */
export function settleAdReport(input: Readonly<{
  products: readonly AdReportBilledProduct[];
  settlements: readonly AdReportSettlementRow[];
}>): AdReportSettlement {
  const productIndexes = new Map<string, number[]>();
  input.products.forEach((product, index) => {
    const key = campaignDayKey(product.date, product.campaignId);
    const indexes = productIndexes.get(key);
    if (indexes) indexes.push(index);
    else productIndexes.set(key, [index]);
  });
  const reportSpend = (indexes: readonly number[]) => indexes.reduce((sum, index) => sum + input.products[index].spend, 0);

  const settledByCampaignDay = new Map<string, AdReportSettlementRow[]>();
  const billings = new Map<string, AdReportBilling>();
  let accountAdjustmentRows = 0;
  for (const row of input.settlements) {
    const indexes = row.campaignId === null ? undefined : productIndexes.get(campaignDayKey(row.date, row.campaignId));
    const matched = indexes !== undefined && reportSpend(indexes) > 0;
    if (matched) {
      const key = campaignDayKey(row.date, row.campaignId!);
      const rows = settledByCampaignDay.get(key);
      if (rows) rows.push(row);
      else settledByCampaignDay.set(key, [row]);
    } else {
      accountAdjustmentRows += 1;
    }
    addBilling(billings, row, matched ? row.campaignId! : ACCOUNT_ADJUSTMENT_CAMPAIGN_KEY);
  }

  const billedSpend = input.products.map((product) => product.spend);
  const warnings: AdReportReconciliationWarning[] = [];
  let unsettledCampaignDays = 0;
  for (const [key, indexes] of productIndexes) {
    const spend = reportSpend(indexes);
    const settled = settledByCampaignDay.get(key);
    if (!settled) {
      if (spend > 0) unsettledCampaignDays += 1;
      continue;
    }
    const billed = settled.reduce((sum, row) => sum + row.billedSpend, 0);
    const shares = allocateBilledSpend(indexes.map((index) => input.products[index].spend), billed);
    indexes.forEach((productIndex, position) => {
      billedSpend[productIndex] = shares[position];
    });
    const delivered = settled.reduce((sum, row) => sum + row.deliveredSpend, 0);
    if (Math.abs(spend - delivered) > Math.max(Math.abs(delivered) * WARNING_RATIO, WARNING_MIN_WON)) {
      const { date, campaignId } = input.products[indexes[0]];
      warnings.push({ date, campaignId, reportSpend: spend, settlementSpend: delivered });
    }
  }

  return {
    billedSpend,
    billings: [...billings.values()].sort((a, b) =>
      a.date.localeCompare(b.date) || a.settlementDomain.localeCompare(b.settlementDomain) || a.campaignKey.localeCompare(b.campaignKey)),
    unsettledCampaignDays,
    accountAdjustmentRows,
    warnings: warnings.sort((a, b) => a.date.localeCompare(b.date) || a.campaignId.localeCompare(b.campaignId)),
  };
}

function campaignDayKey(date: string, campaignId: string): string {
  return `${date}:${campaignId}`;
}

function addBilling(billings: Map<string, AdReportBilling>, row: AdReportSettlementRow, campaignKey: string): void {
  const key = `${row.date}:${row.settlementDomain}:${campaignKey}`;
  const current = billings.get(key);
  if (!current) {
    billings.set(key, {
      date: row.date,
      settlementDomain: row.settlementDomain,
      campaignKey,
      deliveredSpend: row.deliveredSpend,
      billedSpend: row.billedSpend,
      promotionAdjustment: row.promotionAdjustment,
      billableAdjustment: row.billableAdjustment,
    });
    return;
  }
  current.deliveredSpend += row.deliveredSpend;
  current.billedSpend += row.billedSpend;
  current.promotionAdjustment += row.promotionAdjustment;
  current.billableAdjustment += row.billableAdjustment;
}

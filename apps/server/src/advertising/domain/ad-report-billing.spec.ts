import { describe, expect, it } from 'vitest';
import type { AdReportSettlementRow } from '@kiditem/shared/advertising-operations';
import { allocateBilledSpend, settleAdReport } from './ad-report-billing';

describe('allocateBilledSpend', () => {
  it('splits a campaign-day bill in proportion to spend and hands the won remainder to the largest spends first', () => {
    // 비율이 나눠떨어지면 나머지가 없다.
    expect(allocateBilledSpend([500, 300, 200], 1_000)).toEqual([500, 300, 200]);
    expect(allocateBilledSpend([700, 200, 100], 900)).toEqual([630, 180, 90]);
    // 1,000 / 3 = 333.33…: 내림 합 999, 남은 1원은 동률이라 앞 행에.
    expect(allocateBilledSpend([100, 100, 100], 1_000)).toEqual([334, 333, 333]);
    // 4 × 1/3 = 1.33 → 1, 4 × 2/3 = 2.67 → 2: 남은 1원은 앞 행이 아니라 집행액이 큰 행에.
    expect(allocateBilledSpend([1, 2], 4)).toEqual([1, 3]);
    // 1,000 × 3/7 = 428.57 → 428 (둘), 1,000 × 1/7 = 142.86 → 142: 남은 2원은 집행액 3인 두 행에 1원씩.
    expect(allocateBilledSpend([3, 1, 3], 1_000)).toEqual([429, 142, 429]);
  });
});

function settlement(values: Partial<AdReportSettlementRow> & Pick<AdReportSettlementRow, 'date' | 'campaignId'>): AdReportSettlementRow {
  return {
    settlementDomain: 'SELLER',
    campaignName: values.campaignId ? `캠페인 ${values.campaignId}` : null,
    deliveredSpend: 0,
    billedSpend: 0,
    promotionAdjustment: 0,
    billableAdjustment: 0,
    ...values,
  };
}

describe('settleAdReport', () => {
  it('bills each product row from its campaign-day settlement and keeps the campaign-day total equal to the bill', () => {
    const settled = settleAdReport({
      products: [
        { date: '2026-09-20', campaignId: '11', spend: 600 },
        { date: '2026-09-20', campaignId: '11', spend: 400 },
        { date: '2026-09-20', campaignId: '22', spend: 50 },
      ],
      settlements: [
        settlement({ date: '2026-09-20', campaignId: '11', deliveredSpend: 1_000, billedSpend: 901 }),
        settlement({ date: '2026-09-20', campaignId: '22', deliveredSpend: 50, billedSpend: 50 }),
      ],
    });
    expect(settled.billedSpend).toEqual([541, 360, 50]);
    expect(settled.billings).toEqual([
      { date: '2026-09-20', settlementDomain: 'SELLER', campaignKey: '11', deliveredSpend: 1_000, billedSpend: 901, promotionAdjustment: 0, billableAdjustment: 0 },
      { date: '2026-09-20', settlementDomain: 'SELLER', campaignKey: '22', deliveredSpend: 50, billedSpend: 50, promotionAdjustment: 0, billableAdjustment: 0 },
    ]);
    expect(settled.unsettledCampaignDays).toBe(0);
    expect(settled.accountAdjustmentRows).toBe(0);
    expect(settled.warnings).toEqual([]);
  });

  it('bills an unsettled campaign-day at its spend and counts it, and folds settlement-only rows into the account adjustment', () => {
    const settled = settleAdReport({
      products: [
        { date: '2026-09-20', campaignId: '11', spend: 700 },
        { date: '2026-09-21', campaignId: '11', spend: 0 },
      ],
      settlements: [
        settlement({ date: '2026-09-20', campaignId: '33', deliveredSpend: 200, billedSpend: 180 }),
        settlement({ date: '2026-09-20', campaignId: null, billedSpend: -30, billableAdjustment: -30 }),
        settlement({ date: '2026-09-20', settlementDomain: 'RETAIL', campaignId: '44', deliveredSpend: 10, billedSpend: 10 }),
      ],
    });
    expect(settled.billedSpend).toEqual([700, 0]);
    // 광고비가 0인 날은 정산이 없어도 "정산 미확인"이 아니다.
    expect(settled.unsettledCampaignDays).toBe(1);
    expect(settled.accountAdjustmentRows).toBe(3);
    expect(settled.billings).toEqual([
      { date: '2026-09-20', settlementDomain: 'RETAIL', campaignKey: '', deliveredSpend: 10, billedSpend: 10, promotionAdjustment: 0, billableAdjustment: 0 },
      { date: '2026-09-20', settlementDomain: 'SELLER', campaignKey: '', deliveredSpend: 200, billedSpend: 150, promotionAdjustment: 0, billableAdjustment: -30 },
    ]);
  });

  it('sums a campaign-day across settlement domains and warns when report spend and delivered spend drift beyond 1% or 1,000 won', () => {
    const settled = settleAdReport({
      products: [
        { date: '2026-09-20', campaignId: '11', spend: 200_000 },
        { date: '2026-09-20', campaignId: '22', spend: 5_000 },
        { date: '2026-09-20', campaignId: '33', spend: 300_000 },
      ],
      settlements: [
        // 202,000 vs 200,000: 2,000 > max(2,020, 1,000)? no — 1%가 더 크다.
        settlement({ date: '2026-09-20', campaignId: '11', deliveredSpend: 150_000, billedSpend: 150_000 }),
        settlement({ date: '2026-09-20', settlementDomain: 'RETAIL', campaignId: '11', deliveredSpend: 52_000, billedSpend: 52_000 }),
        // 6,001 vs 5,000: 1,001 > 1,000.
        settlement({ date: '2026-09-20', campaignId: '22', deliveredSpend: 6_001, billedSpend: 6_001 }),
        // 303,001 vs 300,000: 3,001 > 3,030? no.
        settlement({ date: '2026-09-20', campaignId: '33', deliveredSpend: 303_001, billedSpend: 303_001 }),
      ],
    });
    expect(settled.billedSpend).toEqual([202_000, 6_001, 303_001]);
    expect(settled.warnings).toEqual([{ date: '2026-09-20', campaignId: '22', reportSpend: 5_000, settlementSpend: 6_001 }]);
  });
});

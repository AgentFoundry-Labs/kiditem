import type { PLData } from '@kiditem/shared/finance';

export function mapProfitLossReportRow(row: PLData) {
  return {
    등급: row.grade,
    상품명: row.masterName,
    셀피아상품코드: row.masterCode,
    채널: row.channelName ?? '',
    매출: row.revenue,
    매입원가: row.cogs,
    수수료: row.commission,
    배송비: row.shippingCost,
    광고비: row.adCost,
    기타비용: row.otherCost,
    순이익: row.netProfit,
    '이익률(%)': row.profitRate,
    주문수: row.orderCount,
  };
}

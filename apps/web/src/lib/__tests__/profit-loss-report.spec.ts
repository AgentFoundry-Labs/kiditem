import { describe, expect, it } from 'vitest';
import { mapProfitLossReportRow } from '@/lib/profit-loss-report';

describe('mapProfitLossReportRow', () => {
  it('exports the final MasterProduct, channel, and COGS fields', () => {
    expect(mapProfitLossReportRow({
      listingId: '11111111-1111-4111-8111-111111111111',
      externalId: 'wing-123',
      channelName: '쿠팡 로켓',
      masterId: '22222222-2222-4222-8222-222222222222',
      masterCode: 'SP-0008',
      masterName: '우파루팡반짝슈가말랑이',
      category: '완구',
      grade: 'A',
      thumbnailUrl: null,
      revenue: 100_000,
      cogs: 48_000,
      commission: 10_000,
      shippingCost: 5_000,
      adCost: 7_000,
      otherCost: 1_000,
      netProfit: 29_000,
      profitRate: 29,
      orderCount: 8,
      returnCount: 1,
    })).toEqual({
      등급: 'A',
      상품명: '우파루팡반짝슈가말랑이',
      셀피아상품코드: 'SP-0008',
      채널: '쿠팡 로켓',
      매출: 100_000,
      매입원가: 48_000,
      수수료: 10_000,
      배송비: 5_000,
      광고비: 7_000,
      기타비용: 1_000,
      순이익: 29_000,
      '이익률(%)': 29,
      주문수: 8,
    });
  });

  it('keeps a missing channel name explicit as an empty export cell', () => {
    expect(mapProfitLossReportRow({
      listingId: '11111111-1111-4111-8111-111111111111',
      externalId: 'wing-123',
      channelName: null,
      masterId: '22222222-2222-4222-8222-222222222222',
      masterCode: 'SP-0008',
      masterName: '우파루팡반짝슈가말랑이',
      category: null,
      grade: null,
      thumbnailUrl: null,
      revenue: 0,
      cogs: 0,
      commission: 0,
      shippingCost: 0,
      adCost: 0,
      otherCost: 0,
      netProfit: 0,
      profitRate: 0,
      orderCount: 0,
      returnCount: 0,
    }).채널).toBe('');
  });
});

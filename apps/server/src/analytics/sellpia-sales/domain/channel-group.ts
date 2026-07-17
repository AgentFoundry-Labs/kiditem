// Sellpia 판매처(seller) → 대시보드 버킷 분류. 순수 함수(NestJS/Prisma 비의존).
//
// 사용자 확정: "쿠팡 로켓" = Sellpia 판매처 "쿠팡-직배송"(사입/로켓 발주) 단독.
// 그 외 판매처("쿠팡", "쿠팡2"(윙 마켓플레이스) 포함)는 전부 others 합산 버킷.
export type SellpiaChannelGroup = 'rocket' | 'others';

export function classifySellpiaChannelGroup(sellerName: string): SellpiaChannelGroup {
  const norm = (sellerName ?? '').replace(/[\s\-_()]/g, '');
  // "쿠팡-직배송" 만 직배송 라벨을 가진다. 공백/하이픈 변형에 견고하게 정규화 후 판정.
  return norm.includes('쿠팡') && norm.includes('직배송') ? 'rocket' : 'others';
}

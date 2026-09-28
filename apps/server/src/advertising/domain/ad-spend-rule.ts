/**
 * 광고비를 어느 숫자로 읽는가(KID-368·372, 새 광고 원장 기준).
 *
 * - **이익**(손익·대시보드 이익·상품 허브·기여이익)은 청구액 기준이다: 상품 행 `billedSpend`(정산 청구액을 캠페인×일에서
 *   원 단위까지 배분한 값)와 계정 조정 행(캠페인 키 ''의 청구액)을 더한 뒤 부가세 10%를 얹는다. 화면 이름 "광고비(청구·VAT 포함)".
 * - **성과**(광고 운영 KPI·캠페인·상품·키워드·벤치마크·전략·추세)는 광고센터 집행액 `spend` 그대로다. 화면 이름 "집행 광고비".
 * - 전환은 보고서의 주문수 `orders`다. 새 원장에는 "전환을 관찰했는가" 표식이 없다 — 측정한 날의 행은 모두 주문수를 갖는다.
 *
 * 원 단위 반올림은 더한 뒤 마지막에 한 번만 한다(행마다 반올림하면 합이 정산과 어긋난다).
 */
export const AD_VAT_RATE = 0.1;

/** 이익 계산의 광고비: (청구액 + 계정 조정) × (1 + 부가세). 원 단위 반올림. */
export function profitAdCost(input: Readonly<{ billedSpend: number; adjustment?: number }>): number {
  return Math.round((input.billedSpend + (input.adjustment ?? 0)) * (1 + AD_VAT_RATE));
}

/** 성과 지표의 광고비: 집행액 그대로. 이름을 붙여 두어 "왜 여기는 청구액이 아닌가"가 호출부에서 읽히게 한다. */
export function performanceAdSpend(spend: number): number {
  return spend;
}

/** 보고서 행의 전환 수 = 주문수. */
export function adConversions(row: Readonly<{ orders: number }>): number {
  return row.orders;
}

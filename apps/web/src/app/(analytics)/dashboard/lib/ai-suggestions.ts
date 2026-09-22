import { formatNumber } from '@/lib/utils';
import type { DashboardFindings } from '@kiditem/shared/dashboard';

/**
 * AI 제안 — 지금 하면 돈이 되는 일(사장님 2026-09-20).
 *
 * 발주만 있던 칸을 넓혔다. 다만 근거가 서버에 있는 것만 말한다 — "매출 10% 상승" 같은 수는
 * 아무도 재지 않았으므로 쓰지 않는다. 대신 이미 발표된 수로 기회를 말한다: 어느 몰에도 연결되지 않은
 * 원천 상품이 몇 개인지, 품절이 몇 개인지, 어떤 상품이 며칠 뒤 떨어지는지.
 *
 * 이 파일은 세지 않는다. 받은 수를 줄로 바꾸고 순서만 정한다.
 */

export interface AiSuggestion {
  key: string;
  /** 줄 앞 딱지 — 무슨 갈래의 제안인가. */
  badge: '발주' | '기회' | '매출' | '쇼핑몰';
  headline: string;
  /** 왜 그런지 — 숫자로. 모르면 null. */
  evidence: string | null;
  /** 눈에 띄는 한 값(3일 후 · 2,429개). */
  figure: string | null;
  figureNote: string | null;
  imageUrl: string | null;
  action: { label: string; href: string };
}

export interface AiSuggestionInput {
  findings: DashboardFindings | undefined;
  /** 상품 관리 요약 — 품절 · 재고 매칭. 모르면 undefined. */
  stock: { outOfStockCount: number | null; reorderProductCount: number | null } | undefined;
  /** 아직 어느 몰에도 연결되지 않은 원천 상품 수. 모르면 null. */
  unlinkedProducts: number | null;
}

const REORDER_HREF = '/product-hub?inventoryFocus=reorder';

function daysLabel(daysLeft: number): string {
  return daysLeft <= 0 ? '오늘' : `${daysLeft}일 후`;
}

export function buildAiSuggestions(input: AiSuggestionInput): AiSuggestion[] {
  const list: AiSuggestion[] = [];

  // 1) 발주 — 품절은 되돌릴 수 없다. 급한 것부터 셋.
  for (const item of (input.findings?.reorderSuggestions ?? []).slice(0, 3)) {
    list.push({
      key: `reorder:${item.productCode}`,
      badge: '발주',
      headline: `${item.name}의 재고가 ${daysLabel(item.daysLeft)} 소진됩니다`,
      evidence: `현재고 ${formatNumber(item.availableStock)}개 · 월 평균 ${formatNumber(Math.round(item.monthlyOutflow))}개 판매`,
      figure: daysLabel(item.daysLeft),
      figureNote: '재고 부족 예측',
      imageUrl: item.imageUrl ?? null,
      action: { label: '발주 검토', href: item.masterProductId ? `/product-hub/${item.masterProductId}` : REORDER_HREF },
    });
  }

  // 2) 기회 — 이미 발표된 연결·재고 상태를 확인할 길. 만들어 낸 수가 아니라 있는 수다.
  if (input.unlinkedProducts !== null && input.unlinkedProducts > 0) {
    list.push({
      key: 'unlinked',
      badge: '기회',
      headline: `원천 상품 ${formatNumber(input.unlinkedProducts)}개가 아직 어느 몰에도 연결되지 않았습니다`,
      evidence: '상품별 쇼핑몰 연결 현황에서 연결할 상품을 고르세요',
      figure: `${formatNumber(input.unlinkedProducts)}개`,
      figureNote: '몰 연결 없음',
      imageUrl: null,
      action: { label: '몰 연결', href: '/mall-listings' },
    });
  }

  if (input.stock?.outOfStockCount !== null && input.stock?.outOfStockCount !== undefined && input.stock.outOfStockCount > 0) {
    list.push({
      key: 'outOfStock',
      badge: '기회',
      headline: `품절 상태 상품 ${formatNumber(input.stock.outOfStockCount)}개가 확인되었습니다`,
      evidence: '상품 관리에서 재고와 판매 상태를 확인하세요',
      figure: `${formatNumber(input.stock.outOfStockCount)}개`,
      figureNote: '품절 상품',
      imageUrl: null,
      action: { label: '재고 확인', href: '/product-hub?inventoryFocus=out_of_stock' },
    });
  }

  // 3) 매출이 빠지는 곳.
  const decline = input.findings?.salesDecline;
  if (decline?.count && decline.count > 0) {
    const worst = decline.items[0];
    list.push({
      key: 'decline',
      badge: '매출',
      headline: `주요 상품 ${decline.count}개 판매량이 기준보다 낮습니다`,
      evidence: worst ? `가장 큰 것: ${worst.name} 기준 대비 ${Math.round(worst.changePercent)}%` : null,
      figure: `${decline.count}개`,
      figureNote: '기준 대비 판매량',
      imageUrl: null,
      action: { label: '분석', href: '/stock-ops?tab=product-outflow' },
    });
  }

  // 4) 등록 처리에서 실패한 항목 — 원인은 provider별로 다를 수 있으므로 단정하지 않는다.
  const failures = input.findings?.registrationFailures;
  if (failures && failures.count > 0) {
    const mall = failures.byChannel[0];
    list.push({
      key: 'registration',
      badge: '쇼핑몰',
      headline: `등록 실패 ${failures.count}건이 남아 있습니다`,
      evidence: mall ? `가장 많은 곳: ${mall.mallName} ${mall.count}건` : null,
      figure: `${failures.count}건`,
      figureNote: '등록 실패',
      imageUrl: null,
      action: { label: '확인', href: '/mall-listings' },
    });
  }

  return list;
}

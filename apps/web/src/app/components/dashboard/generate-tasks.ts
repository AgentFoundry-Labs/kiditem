import type { DashboardSummary as DashboardData } from '@kiditem/shared';
import type { HumanTask, AiAction } from './ActionPanels';

export function generateTasksAndActions(d: DashboardData): { tasks: HumanTask[]; actions: AiAction[] } {
  const tasks: HumanTask[] = [];
  const actions: AiAction[] = [];
  const w = d.warnings;

  if (w.highAdProducts > 0) {
    tasks.push({
      id: 'h-ad-bid', label: `광고비 초과 ${w.highAdProducts}개 — 입찰가 하향 조정`,
      detail: '쿠팡 광고센터에서 해당 상품 입찰가를 낮추거나 일예산 축소',
      where: '쿠팡 광고센터', priority: 'urgent',
    });
  }
  if (w.minusProducts > 0) {
    tasks.push({
      id: 'h-minus-ad-stop', label: `적자 상품 ${w.minusProducts}개 — 광고 중단 처리`,
      detail: '쿠팡 광고센터에서 적자 상품 캠페인 OFF 처리',
      where: '쿠팡 광고센터', priority: 'urgent', href: '/cleanup',
    });
    tasks.push({
      id: 'h-minus-price', label: `적자 상품 ${w.minusProducts}개 — 판매가 인상 검토`,
      detail: '경쟁사 가격 확인 후 마진 확보 가능한 상품 가격 조정',
      where: '쿠팡 윙', priority: 'high', href: '/cleanup',
    });
  }
  if (w.needReorder > 0) {
    tasks.push({
      id: 'h-reorder', label: `${w.needReorder}개 상품 — 매입처에 발주`,
      detail: '안전재고 이하 상품을 매입처에 발주서 전송',
      where: '매입처/1688', priority: 'high',
    });
  }
  if (d.summary.adRate > 12) {
    tasks.push({
      id: 'h-ad-rate', label: `전체 광고비율 ${d.summary.adRate}% — 비효율 캠페인 정리`,
      detail: 'ROAS 200% 미만 캠페인을 쿠팡 광고센터에서 OFF 또는 입찰가 50% 하향',
      where: '쿠팡 광고센터', priority: 'high',
    });
  }
  if (w.lowProfitProducts > 0) {
    tasks.push({
      id: 'h-low-profit', label: `저이익 ${w.lowProfitProducts}개 — 소싱처/수수료 재검토`,
      detail: '원가 절감 가능한 소싱처 확인, 카테고리 수수료율 점검',
      where: '소싱처/쿠팡 윙', priority: 'medium', href: '/cleanup',
    });
  }

  actions.push({
    id: 'recalc-grade', label: 'ABC 등급 재계산', desc: '최신 매출/마진/판매속도 기반 등급 재산정',
    priority: 'medium',
    apiCall: { url: '/api/products/calculate-grades', method: 'POST' },
  });
  if (w.minusProducts > 0 || w.lowProfitProducts > 0) {
    actions.push({
      id: 'view-cleanup', label: '정리대상 상품 분석 보기', desc: `적자 ${w.minusProducts}개 + 저이익 ${w.lowProfitProducts}개 원인 분석`,
      priority: 'high', href: '/cleanup',
    });
  }
  if (w.highAdProducts > 0) {
    actions.push({
      id: 'view-ad-strategy', label: '광고 전략 리포트 확인', desc: 'AI 추천 입찰가/일예산/액션 플랜 확인',
      priority: 'high', href: '/profit-loss',
    });
  }
  actions.push({
    id: 'view-profit', label: '손익 분석 리포트', desc: '상품별 손익 현황 상세 확인',
    priority: 'medium', href: '/profit-loss',
  });

  return { tasks, actions };
}

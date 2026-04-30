import { formatKRW, formatPercent } from '@/lib/utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ActionResult { label: string; value: string; highlight?: boolean; list?: string[] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseActionResult(taskKey: string, json: any): ActionResult[] {
  const results: ActionResult[] = [];

  if (taskKey === 'recalc-grade') {
    results.push({ label: '총 상품', value: json.totalProducts });
    results.push({ label: '등급 변경', value: `${json.updatedCount}개`, highlight: json.updatedCount > 0 });
    results.push({ label: 'A등급', value: `${json.gradeCounts?.A || 0}개` });
    results.push({ label: 'B등급', value: `${json.gradeCounts?.B || 0}개` });
    results.push({ label: 'C등급', value: `${json.gradeCounts?.C || 0}개` });
    results.push({ label: '총 매출', value: formatKRW(json.totalRevenue || 0) + '원' });
    if (json.updatedProducts?.length > 0) {
      results.push({ label: '변경 내역', value: '', list: json.updatedProducts.slice(0, 10).map((p: { oldGrade: string; newGrade: string; score: number }) => `${p.oldGrade}→${p.newGrade} (${p.score}점)`) });
    }
  } else if (taskKey === 'analyze-deficit') {
    const prods = (json.data || []).filter((p: { profitRate: number }) => p.profitRate < 0).slice(0, 15);
    results.push({ label: '적자 상품 수', value: `${prods.length}개`, highlight: true });
    for (const p of prods) {
      const reason = p.adRate > 15 ? '광고비 과다' : p.costPrice >= p.sellPrice ? '원가 > 판매가' : '수수료/배송비';
      results.push({ label: p.name?.substring(0, 25), value: `이익률 ${formatPercent(p.profitRate)} | 원인: ${reason}` });
    }
  } else if (taskKey === 'analyze-ad') {
    const prods = (json.data || []).filter((p: { adTier: string | null }) => p.adTier).slice(0, 15);
    const stop = prods.filter((p: { roas: number }) => p.roas < 1);
    const reduce = prods.filter((p: { roas: number }) => p.roas >= 1 && p.roas < 3);
    const keep = prods.filter((p: { roas: number }) => p.roas >= 3);
    results.push({ label: '광고 중단 권장', value: `${stop.length}개 (ROAS < 1)`, highlight: stop.length > 0 });
    results.push({ label: '광고 축소 검토', value: `${reduce.length}개 (ROAS 1~3)` });
    results.push({ label: '광고 유지/확대', value: `${keep.length}개 (ROAS 3+)` });
  } else if (taskKey === 'analyze-stock') {
    const items = (json.inventories || json.data || []).filter((i: { currentStock: number; reorderPoint: number }) => i.currentStock <= i.reorderPoint && i.reorderPoint > 0).slice(0, 15);
    results.push({ label: '발주 필요', value: `${items.length}개`, highlight: true });
    for (const i of items) {
      const days = i.avgDailySales > 0 ? Math.round(i.currentStock / i.avgDailySales) : 0;
      results.push({ label: i.productName || i.product?.name || '상품', value: `재고 ${i.currentStock}개 (${days}일분)` });
    }
  } else if (taskKey === 'analyze-ad-rules') {
    const s = json.summary || {};
    const recs = json.recommendations || [];
    results.push({ label: '분석 상품 수', value: `${s.total}개` });
    results.push({ label: '긴급 조치 필요', value: `${s.urgent}개`, highlight: s.urgent > 0 });
    results.push({ label: '높은 우선순위', value: `${s.high}개` });
    results.push({ label: '전략 수정 알림', value: `${s.newAlerts}건 생성` });
    for (const r of recs.slice(0, 15)) {
      const icon = r.priority === 'urgent' ? '🔴' : r.priority === 'high' ? '🟡' : '🟢';
      results.push({ label: `${icon} [${r.rule}] ${r.name?.substring(0, 18)}`, value: r.action });
    }
  } else if (taskKey === 'analyze-ctr') {
    const prods = (json.data || []).filter((p: { thumbnailCTR: number }) => p.thumbnailCTR < 1.5 && p.thumbnailCTR > 0).slice(0, 10);
    results.push({ label: 'CTR 미달 상품', value: `${prods.length}개`, highlight: true });
    for (const p of prods) {
      results.push({ label: p.name?.substring(0, 25), value: `CTR ${p.thumbnailCTR}% → 목표 1.5% 이상` });
    }
  } else if (taskKey === 'analyze-category') {
    const cats = (json.categories || []).slice(0, 10);
    results.push({ label: '카테고리 수', value: `${cats.length}개` });
    for (const c of cats) {
      results.push({ label: c.category?.substring(0, 20) || '-', value: `매출 ${formatKRW(c.totalRevenue)}원 | 이익률 ${c.avgProfitRate}% | 상품 ${c.productCount}개` });
    }
  } else if (json.error) {
    results.push({ label: '오류', value: json.error, highlight: true });
  } else {
    results.push({ label: '결과', value: JSON.stringify(json).substring(0, 200) });
  }

  return results;
}

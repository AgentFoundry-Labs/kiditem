import { formatKRW, formatPercent } from '@/lib/utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ActionResult { label: string; value: string; highlight?: boolean; list?: string[] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseActionResult(taskKey: string, json: any): ActionResult[] {
  const results: ActionResult[] = [];

  if (taskKey === 'analyze-deficit') {
    const rows = Array.isArray(json) ? json : (json.data || []);
    const prods = rows.filter((p: { profitRate: number }) => p.profitRate < 0).slice(0, 15);
    results.push({ label: '적자 상품 수', value: `${prods.length}개`, highlight: true });
    for (const p of prods) {
      const reason = p.adCost > p.cogs ? '광고비 과다' : p.cogs >= p.revenue ? '원가 부담' : '수수료/배송비';
      results.push({ label: p.masterName?.substring(0, 25) ?? '-', value: `이익률 ${formatPercent(p.profitRate)} | 원인: ${reason}` });
    }
  } else if (taskKey === 'analyze-ad') {
    const prods = (json.items || json.data || [])
      .filter((p: { adTier?: string | null; tier?: string | null }) => p.adTier || p.tier)
      .slice(0, 15);
    const roasOf = (p: { roas?: number; metrics?: { roas?: number | null } }) => p.metrics?.roas ?? p.roas ?? 0;
    const stop = prods.filter((p: { roas?: number; metrics?: { roas?: number | null } }) => roasOf(p) < 100);
    const reduce = prods.filter((p: { roas?: number; metrics?: { roas?: number | null } }) => roasOf(p) >= 100 && roasOf(p) < 300);
    const keep = prods.filter((p: { roas?: number; metrics?: { roas?: number | null } }) => roasOf(p) >= 300);
    results.push({ label: '광고 중단 권장', value: `${stop.length}개 (ROAS < 100%)`, highlight: stop.length > 0 });
    results.push({ label: '광고 축소 검토', value: `${reduce.length}개 (ROAS 100~300%)` });
    results.push({ label: '광고 유지/확대', value: `${keep.length}개 (ROAS 300%+)` });
  } else if (taskKey === 'analyze-ad-rules') {
    const recs = Array.isArray(json) ? json : (json.recommendations || []);
    const urgent = recs.filter((r: { priority?: string }) => r.priority === 'urgent').length;
    const high = recs.filter((r: { priority?: string }) => r.priority === 'high').length;
    results.push({ label: '분석 상품 수', value: `${recs.length}개` });
    results.push({ label: '긴급 조치 필요', value: `${urgent}개`, highlight: urgent > 0 });
    results.push({ label: '높은 우선순위', value: `${high}개` });
    for (const r of recs.slice(0, 15)) {
      const icon = r.priority === 'urgent' ? '🔴' : r.priority === 'high' ? '🟡' : '🟢';
      results.push({ label: `${icon} ${r.title ?? r.name ?? '광고 전략'}`, value: r.action ?? r.description ?? '-' });
    }
  } else if (taskKey === 'analyze-ctr') {
    const rows = json.items || json.data || [];
    const ctrOf = (p: { thumbnailCTR?: number; metrics?: { ctr?: number | null } }) => p.metrics?.ctr ?? p.thumbnailCTR ?? 0;
    const prods = rows.filter((p: { thumbnailCTR?: number; metrics?: { ctr?: number | null } }) => ctrOf(p) < 1.5 && ctrOf(p) > 0).slice(0, 10);
    results.push({ label: 'CTR 미달 상품', value: `${prods.length}개`, highlight: true });
    for (const p of prods) {
      results.push({ label: p.masterProduct?.name?.substring(0, 25) ?? p.name?.substring(0, 25) ?? '-', value: `CTR ${ctrOf(p)}% → 목표 1.5% 이상` });
    }
  } else if (taskKey === 'analyze-category') {
    const cats = (Array.isArray(json) ? json : (json.categories || [])).slice(0, 10);
    results.push({ label: '카테고리 수', value: `${cats.length}개` });
    for (const c of cats) {
      const revenue = Number(c.revenue ?? c.totalRevenue ?? 0);
      const profit = Number(c.profit ?? 0);
      const profitRate = c.avgProfitRate ?? (revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0);
      results.push({ label: c.category?.substring(0, 20) || '-', value: `매출 ${formatKRW(revenue)}원 | 이익률 ${profitRate}% | 상품 ${c.count ?? c.productCount ?? 0}개` });
    }
  } else if (json.error) {
    results.push({ label: '오류', value: json.error, highlight: true });
  } else {
    results.push({ label: '결과', value: JSON.stringify(json).substring(0, 200) });
  }

  return results;
}

'use client';

import {
  TrendingUp, Megaphone, BarChart3, Zap, ShoppingCart,
} from 'lucide-react';
import { formatKRW } from '@/lib/utils';

function parseWingValue(v: string | null | undefined): number {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
  if (String(v).includes('M')) return n * 1_000_000;
  if (String(v).includes('K')) return n * 1_000;
  return n;
}

interface KpiDef {
  label: string;
  value: string;
  unit: string;
  current: number;
  goal: number;
  goalLabel: string;
  invertGoal: boolean;
  accentColor: string;
  icon: typeof TrendingUp;
  avg: number | null;
}

function KpiCard({ kpi }: { kpi: KpiDef }) {
  const pct = kpi.invertGoal
    ? kpi.goal > 0 ? Math.max(0, Math.min(100, ((kpi.goal * 2 - kpi.current) / kpi.goal) * 100)) : 0
    : kpi.goal > 0 ? Math.min((kpi.current / kpi.goal) * 100, 100) : 0;
  const achieved = kpi.invertGoal ? kpi.current <= kpi.goal : kpi.current >= kpi.goal;
  const Icon = kpi.icon;
  const avgDiff = kpi.avg !== null ? kpi.current - kpi.avg : null;
  const avgBetter = kpi.avg !== null ? (kpi.invertGoal ? kpi.current <= kpi.avg : kpi.current >= kpi.avg) : null;

  return (
    <div className="rounded-2xl p-4 transition-all hover:shadow-lg bg-white shadow-md border border-slate-100">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} style={{ color: kpi.accentColor }} />
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: kpi.accentColor }}>{kpi.label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-extrabold tabular-nums" style={{ color: kpi.accentColor }}>{kpi.value}</span>
        <span className="text-base font-semibold" style={{ color: kpi.accentColor, opacity: 0.6 }}>{kpi.unit}</span>
      </div>
      {kpi.avg !== null && (
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[11px] text-slate-400">업계 평균 {kpi.avg}{kpi.unit}</span>
          {avgDiff !== null && avgDiff !== 0 && (
            <span className="text-[11px] font-bold" style={{ color: avgBetter ? '#059669' : '#dc2626' }}>
              {avgBetter ? '\u25B2' : '\u25BC'} {Math.abs(Math.round(avgDiff * 100) / 100)}{kpi.unit === '원' ? '원' : '%p'}
            </span>
          )}
        </div>
      )}
      <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${kpi.accentColor}20` }}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px]" style={{ color: `${kpi.accentColor}99` }}>{kpi.goalLabel}</span>
          <span className="text-[12px] font-bold" style={{ color: kpi.accentColor }}>{achieved ? '달성' : `${Math.round(pct)}%`}</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: `${kpi.accentColor}15` }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: kpi.accentColor }} />
        </div>
      </div>
    </div>
  );
}

interface Props {
  totalKpi: Record<string, number>;
  wingAdData: Record<string, string> | null;
  roas: number;
}

export function KpiCards({ totalKpi, wingAdData, roas }: Props) {
  const adSpend = wingAdData?.adSpend ? parseWingValue(wingAdData.adSpend) : (totalKpi.adSpend || 0);
  const adRevenue = wingAdData?.adGmv ? parseWingValue(wingAdData.adGmv) : (totalKpi.adRevenue || 0);
  const wingRoas = wingAdData?.roas ? parseFloat(wingAdData.roas) : roas;
  const clicks = totalKpi.clicks || 0;
  const conversions = totalKpi.conversions || 0;
  const cvr = clicks > 0 ? Math.round((conversions / clicks) * 10000) / 100 : 0;
  const cpc = clicks > 0 ? Math.round(adSpend / clicks) : 0;
  const adRate = adRevenue > 0 ? Math.round((adSpend / adRevenue) * 10000) / 100 : 0;

  const row1: KpiDef[] = [
    { label: '전환 매출', value: formatKRW(adRevenue), unit: '원', current: adRevenue, goal: 2000000, goalLabel: '목표 200만원', invertGoal: false, accentColor: '#2563eb', icon: TrendingUp, avg: null },
    { label: '집행 광고비', value: formatKRW(adSpend), unit: '원', current: adSpend, goal: 500000, goalLabel: '목표 50만원 이하', invertGoal: true, accentColor: '#059669', icon: Megaphone, avg: null },
    { label: 'ROAS', value: String(wingRoas), unit: '%', current: wingRoas, goal: 400, goalLabel: '목표 400%', invertGoal: false, accentColor: '#733de5', icon: BarChart3, avg: 350 },
    { label: 'CTR', value: String(totalKpi.ctr || 0), unit: '%', current: totalKpi.ctr || 0, goal: 0.3, goalLabel: '목표 0.3%', invertGoal: false, accentColor: '#dc2626', icon: Zap, avg: 0.3 },
  ];

  const row2: KpiDef[] = [
    { label: '전환수', value: String(conversions), unit: '건', current: conversions, goal: 100, goalLabel: '목표 100건', invertGoal: false, accentColor: '#2563eb', icon: ShoppingCart, avg: null },
    { label: 'CVR', value: String(cvr), unit: '%', current: cvr, goal: 8, goalLabel: '목표 8%', invertGoal: false, accentColor: '#059669', icon: TrendingUp, avg: 8 },
    { label: 'CPC', value: formatKRW(cpc), unit: '원', current: cpc, goal: 300, goalLabel: '목표 300원 이하', invertGoal: true, accentColor: '#733de5', icon: Zap, avg: 500 },
    { label: '광고비율', value: String(adRate), unit: '%', current: adRate, goal: 10, goalLabel: '목표 10% 이하', invertGoal: true, accentColor: '#dc2626', icon: Megaphone, avg: 10 },
  ];

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {row1.map(kpi => <KpiCard key={kpi.label} kpi={kpi} />)}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {row2.map(kpi => <KpiCard key={kpi.label} kpi={kpi} />)}
      </div>
    </>
  );
}

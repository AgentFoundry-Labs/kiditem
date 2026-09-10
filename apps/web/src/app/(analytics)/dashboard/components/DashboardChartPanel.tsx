'use client';

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowRight, Loader2, Play, Zap } from 'lucide-react';
import { toast } from 'sonner';
import AgentFace from '@/components/AgentFace';
import { cn } from '@/lib/utils';
import {
  useDepartmentQuickActions,
  type DepartmentQuickAction,
} from '../hooks/use-department-quick-actions';
import { type DashboardMetricBasis } from './DashboardDataBasis';

const DashboardCharts = dynamic(
  () => import('./DashboardCharts').then((mod) => ({ default: mod.DashboardCharts })),
  { ssr: false, loading: () => <div className="h-[320px] flex items-center justify-center text-sm text-slate-300">차트 로딩 중...</div> },
);

type DailyTrendPoint = {
  date: string;
  revenue: number | null;
  profit: number | null;
  adCost: number | null;
  profitRate: number | null;
  adRate: number | null;
  evidence: {
    revenue: DashboardMetricBasis | null;
    profit: DashboardMetricBasis | null;
    adCost: DashboardMetricBasis | null;
  };
};

type IndustryBenchmark = {
  myAdRate?: number | null;
  myRoas?: number | null;
  myCtr?: number | null;
  myCvr?: number | null;
};

// 인라인 실행 액션 — 대시보드에서 바로 실행한다(페이지 이동 없음).
type DeptButton =
  | { label: string; kind: 'action'; action: DepartmentQuickAction }
  // 링크 — 관리 화면(상품)은 해당 페이지로 이동.
  | { label: string; kind: 'link'; href: string };

type Dept = {
  key: string;
  label: string;
  color: string;
  faceColor: string;
  faceRole: string;
  buttons: readonly DeptButton[];
};

const ACTION_LABEL: Record<DepartmentQuickAction, string> = {
  collectTrend: '시장분석 수집',
  refreshInventory: '재고 분석 업데이트',
  syncSellpia: '셀피아 동기화',
  collectAllOrders: '몰 주문수집',
  collectCoupangShipmentSummary: '쿠팡 쉽먼트 조회',
  collectCoupangRocketPurchaseOrders: '쿠팡 로켓 PO 수집',
};

const DEPT_MAP: readonly Dept[] = [
  {
    key: 'sourcing', label: '소싱', color: '#8b5cf6', faceColor: 'violet', faceRole: 'sourcing',
    buttons: [{ label: '시장분석', kind: 'action', action: 'collectTrend' }],
  },
  {
    key: 'product', label: '상품', color: '#10b981', faceColor: 'emerald', faceRole: 'inventory',
    buttons: [
      { label: '상품 관리', kind: 'link', href: '/product-hub' },
      { label: '재고 관리', kind: 'link', href: '/inventory-hub' },
    ],
  },
  {
    key: 'order', label: '주문', color: '#f59e0b', faceColor: 'amber', faceRole: 'order',
    buttons: [{ label: '몰 주문수집', kind: 'action', action: 'collectAllOrders' }],
  },
  {
    key: 'shipping', label: '출고', color: '#0ea5e9', faceColor: 'cyan', faceRole: 'shipping',
    buttons: [
      { label: '쿠팡 쉽먼트', kind: 'action', action: 'collectCoupangShipmentSummary' },
      { label: '쿠팡 로켓 PO 수집', kind: 'action', action: 'collectCoupangRocketPurchaseOrders' },
    ],
  },
  {
    key: 'analysis', label: '분석', color: '#ef4444', faceColor: 'rose', faceRole: 'finance',
    buttons: [
      { label: '재고 분석 업데이트', kind: 'action', action: 'refreshInventory' },
      { label: '셀피아 동기화', kind: 'action', action: 'syncSellpia' },
    ],
  },
];

export function DashboardChartPanel({
  dailyTrend,
  industryBenchmark,
  benchmarkBases,
}: {
  dailyTrend: DailyTrendPoint[];
  industryBenchmark?: IndustryBenchmark;
  benchmarkBases?: {
    adRate: DashboardMetricBasis | null;
    roas: DashboardMetricBasis | null;
    ctr: DashboardMetricBasis | null;
    cvr: DashboardMetricBasis | null;
  };
}) {
  const [chartTab, setChartTab] = useState<'agents' | 'revenue' | 'ad' | 'benchmark'>('agents');
  // A row with all nullable metrics missing is an evidence gap, not a usable
  // trend. Keep the row for the x-axis (and the chart's null gap), but only
  // enable trend tabs when at least one measured value exists.
  const hasTrend = dailyTrend.some((point) => point.revenue !== null || point.profit !== null || point.adCost !== null);
  const hasBenchmark = !!industryBenchmark;
  const isAgentOs = chartTab === 'agents';

  const quickActions = useDepartmentQuickActions();
  const [runningAction, setRunningAction] = useState<string | null>(null);

  const runAction = async (deptKey: string, action: DepartmentQuickAction) => {
    const id = `${deptKey}:${action}`;
    if (runningAction) return;
    setRunningAction(id);
    const label = ACTION_LABEL[action];
    try {
      await quickActions.start(action);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${label} 실패`);
    } finally {
      setRunningAction(null);
    }
  };

  const tabs = [
    { key: 'agents' as const, label: 'Agent OS' },
    { key: 'revenue' as const, label: '매출 · 이익률' },
    { key: 'ad' as const, label: '광고비 · 비율' },
    ...(hasBenchmark ? [{ key: 'benchmark' as const, label: '업계 기준(참고)' }] : []),
  ];

  const adChartData = dailyTrend.map((point) => ({
    date: point.date,
    adCost: point.adCost,
    revenue: point.revenue,
    adRate: point.adRate,
    evidence: point.evidence,
  }));

  return (
    <div className={cn('relative rounded-2xl overflow-hidden flex flex-col h-full border shadow-sm transition-all', isAgentOs ? 'border-violet-100 shadow-[0_0_40px_rgba(124,58,237,0.08)]' : 'bg-white border-slate-100')}>
      {isAgentOs && <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-violet-500 via-purple-500 to-blue-500 z-10" />}
      <div className={cn('flex items-center justify-between px-5 py-3 border-b shrink-0', isAgentOs ? 'border-violet-100/60 bg-white/60 backdrop-blur-sm' : 'border-slate-100')}>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg p-0.5 bg-slate-100">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setChartTab(tab.key)}
                className={cn('px-4 py-1.5 rounded-md text-[13px] font-semibold transition-all', chartTab === tab.key ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500')}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {isAgentOs && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-gradient-to-r from-violet-600 to-blue-600 text-white shadow-sm">
              <Zap size={9} className="fill-white" /> AI Powered
            </span>
          )}
        </div>
        <span className={cn('text-[12px] flex items-center gap-1.5', isAgentOs ? 'text-violet-600 font-semibold' : 'text-slate-400')}>
          {isAgentOs && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
          {isAgentOs ? '실시간' : '최근 30일'}
        </span>
      </div>

      {chartTab === 'agents' && (
        <div className="flex-1 flex flex-col p-4 rounded-b-2xl relative" style={{ background: 'linear-gradient(135deg, #faf5ff 0%, #ffffff 45%, #eff6ff 100%)' }}>
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 20% 0%, rgba(139,92,246,0.08) 0%, transparent 40%), radial-gradient(circle at 80% 100%, rgba(59,130,246,0.06) 0%, transparent 40%)' }} />
          <div className="relative flex-1 flex flex-col min-h-0">
            <div className="flex justify-center mb-1.5">
              <div className="rounded-full px-3 py-1.5 flex items-center gap-2 bg-purple-600" style={{ boxShadow: '0 2px 8px rgba(124,58,237,0.25)' }}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center overflow-hidden shrink-0" style={{ background: 'rgba(255,255,255,0.85)' }}>
                  <AgentFace color="violet" role="ceo" size={24} />
                </div>
                <span className="text-xs font-semibold text-white">CEO</span>
                <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-white/40" />
              </div>
            </div>

            <div className="flex justify-center">
              <div style={{ width: 1.5, height: 8, background: '#7c3aed', opacity: 0.3 }} />
            </div>

            <div className="grid grid-cols-5 gap-2 flex-1 min-h-0">
              {DEPT_MAP.map((dept) => (
                <div key={dept.key} className="flex flex-col min-h-0">
                  <div className="rounded-xl p-3 flex items-center gap-2.5 border border-slate-100 shrink-0" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)', background: '#ffffff' }}>
                    <div className="relative shrink-0">
                      <div className="w-12 h-12 rounded-full overflow-hidden" style={{ background: `${dept.color}08` }}>
                        <AgentFace color={dept.faceColor} role={dept.faceRole} size={48} />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-bold truncate" style={{ color: dept.color }}>{dept.label}</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-gray-300" />
                        <span className="text-xs text-slate-400">대기</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <div style={{ width: 1, height: 6, background: dept.color, opacity: 0.25 }} />
                  </div>

                  <div className="rounded-xl border border-slate-100 flex-1 min-h-0 overflow-y-auto" style={{ background: `${dept.color}04` }}>
                    <div className="p-2 space-y-1.5">
                      {dept.buttons.map((button) => {
                        if (button.kind === 'action') {
                          const id = `${dept.key}:${button.action}`;
                          const isRunning = runningAction === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => void runAction(dept.key, button.action)}
                              disabled={runningAction !== null}
                              className="w-full text-left rounded-lg px-2.5 py-2 flex items-center gap-2 bg-white border border-slate-50 hover:border-slate-200 transition-colors disabled:opacity-60"
                            >
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dept.color }} />
                              <span className="text-[15px] text-slate-800 flex-1 leading-snug line-clamp-2 font-medium">{button.label}</span>
                              <span
                                className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md transition-all"
                                style={{ background: isRunning ? '#e2e8f0' : `${dept.color}15`, color: isRunning ? '#94a3b8' : dept.color }}
                                title="실행"
                              >
                                {isRunning ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                              </span>
                            </button>
                          );
                        }
                        return (
                          <Link
                            key={button.href}
                            href={button.href}
                            className="rounded-lg px-2.5 py-2 flex items-center gap-2 bg-white border border-slate-50 hover:border-slate-200 transition-colors"
                          >
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dept.color }} />
                            <span className="text-[15px] text-slate-800 flex-1 leading-snug line-clamp-2 font-medium">{button.label}</span>
                            <span
                              className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md transition-all"
                              style={{ background: `${dept.color}15`, color: dept.color }}
                              title="열기"
                            >
                              <ArrowRight size={13} />
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <DashboardCharts
        chartTab={chartTab}
        dailyTrend={dailyTrend}
        adChartData={adChartData}
        benchmarkData={industryBenchmark ? [
          { name: '광고비율', my: industryBenchmark.myAdRate ?? null, unit: '%', basis: benchmarkBases?.adRate ?? null },
          { name: 'ROAS', my: industryBenchmark.myRoas ?? null, unit: '%', basis: benchmarkBases?.roas ?? null },
          { name: 'CTR', my: industryBenchmark.myCtr ?? null, unit: '%', basis: benchmarkBases?.ctr ?? null },
          { name: 'CVR', my: industryBenchmark.myCvr ?? null, unit: '%', basis: benchmarkBases?.cvr ?? null },
        ] : null}
        hasTrend={hasTrend}
      />
      {chartTab === 'benchmark' && (
        <div className="px-5 pb-3 text-[11px] text-slate-400">
          지표별 기준 근거는 각 카드에서 확인할 수 있습니다.
        </div>
      )}
      {(chartTab === 'revenue' || chartTab === 'ad') && (
        <div className="px-5 pb-3 text-[11px] text-slate-400">
          날짜별 원천 근거와 누락 여부는 각 점의 툴팁에서 확인할 수 있습니다.
        </div>
      )}
    </div>
  );
}

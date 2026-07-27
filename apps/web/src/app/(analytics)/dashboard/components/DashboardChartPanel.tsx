'use client';

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Loader2, Play, Zap } from 'lucide-react';
import { toast } from 'sonner';
import AgentFace from '@/components/AgentFace';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  useDepartmentQuickActions,
  type OrderCollectionMallAccount,
} from '../hooks/use-department-quick-actions';

const DashboardCharts = dynamic(
  () => import('./DashboardCharts').then((mod) => ({ default: mod.DashboardCharts })),
  { ssr: false, loading: () => <div className="h-[320px] flex items-center justify-center text-sm text-slate-300">차트 로딩 중...</div> },
);

type DailyTrendPoint = {
  date: string;
  revenue: number;
  profit: number;
  adCost: number;
  profitRate: number;
  adRate: number;
};

type IndustryBenchmark = {
  avgAdRate: number;
  avgProfitRate: number;
  avgRoas: number;
  avgCtr: number;
  myAdRate?: number;
  myRoas?: number;
  myCtr?: number;
  avgCvr?: number;
};

// 인라인 실행 액션 — 대시보드에서 바로 실행한다(페이지 이동 없음).
type DeptAction =
  | 'collectTrend'
  | 'refreshInventory'
  | 'syncSellpia'
  | 'collectAllOrders'
  | 'collectShipmentToday';
type DeptButton =
  | { label: string; kind: 'action'; action: DeptAction }
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

const ACTION_LABEL: Record<DeptAction, string> = {
  collectTrend: '시장분석 수집',
  refreshInventory: '재고 분석 업데이트',
  syncSellpia: '셀피아 재고 동기화',
  collectAllOrders: '몰 주문 전체수집',
  collectShipmentToday: '금일 쿠팡 쉽먼트 다운',
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
    buttons: [{ label: '몰 주문수집 (전체수집)', kind: 'action', action: 'collectAllOrders' }],
  },
  {
    key: 'shipping', label: '출고', color: '#0ea5e9', faceColor: 'cyan', faceRole: 'shipping',
    buttons: [{ label: '금일 쿠팡 쉽먼트 다운', kind: 'action', action: 'collectShipmentToday' }],
  },
  {
    key: 'analysis', label: '분석', color: '#ef4444', faceColor: 'rose', faceRole: 'finance',
    buttons: [
      { label: '재고 분석 업데이트', kind: 'action', action: 'refreshInventory' },
      { label: '셀피아 재고 동기화', kind: 'action', action: 'syncSellpia' },
    ],
  },
];

export function DashboardChartPanel({
  dailyTrend,
  industryBenchmark,
}: {
  dailyTrend: DailyTrendPoint[];
  industryBenchmark?: IndustryBenchmark;
}) {
  const [chartTab, setChartTab] = useState<'agents' | 'revenue' | 'ad' | 'benchmark'>('agents');
  const hasTrend = dailyTrend.length > 0;
  const hasBenchmark = !!industryBenchmark;
  const isAgentOs = chartTab === 'agents';

  const { data: instances = [] } = useQuery({
    queryKey: ['agent-os', 'instances'],
    queryFn: () => apiClient.get<Array<{
      id: string;
      role: string;
      name: string;
      lifecycleStatus: string;
    }>>('/api/agent-os/instances'),
    refetchInterval: 30_000,
    enabled: isAgentOs,
  });
  const ceo = instances.find((instance) => instance.role === 'ceo');

  const quickActions = useDepartmentQuickActions();
  const [runningAction, setRunningAction] = useState<string | null>(null);
  // 주문 전체수집 후 실패한 몰 — 주문 카드 하단에 재수집 버튼을 동적으로 노출한다.
  const [orderFailedAccounts, setOrderFailedAccounts] = useState<OrderCollectionMallAccount[]>([]);

  const runAction = async (deptKey: string, action: DeptAction) => {
    const id = `${deptKey}:${action}`;
    if (runningAction) return;
    setRunningAction(id);
    const label = ACTION_LABEL[action];
    const toastId = toast.loading(`${label} 실행 중…`);
    try {
      if (action === 'collectTrend') {
        await quickActions.collectTrend();
        toast.success('시장분석 트렌드 수집을 완료했습니다.', { id: toastId });
      } else if (action === 'refreshInventory' || action === 'syncSellpia') {
        await quickActions.requestInventoryRefresh();
        toast.success(`${label}을(를) 요청했습니다.`, { id: toastId });
      } else if (action === 'collectAllOrders') {
        const result = await quickActions.collectAllOrders();
        setOrderFailedAccounts(result.failedAccounts);
        if (result.failedAccounts.length > 0) {
          toast.warning(`전체수집 완료 · 성공 ${result.success}/${result.total} (실패 ${result.failedAccounts.length})`, { id: toastId });
        } else {
          toast.success(`전체수집 완료 · ${result.success}개 몰`, { id: toastId });
        }
      } else {
        const result = await quickActions.collectShipmentToday();
        const failedNote = result.failed > 0 ? ` (실패 ${result.failed})` : '';
        toast.success(`쿠팡 쉽먼트 완료 · ${result.date} 쉽먼트 ${result.shipments}건 → 파일 ${result.files}개${failedNote}`, { id: toastId });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${label} 실패`, { id: toastId });
    } finally {
      setRunningAction(null);
    }
  };

  const retryFailedOrders = async () => {
    if (runningAction || orderFailedAccounts.length === 0) return;
    setRunningAction('order:retry');
    const toastId = toast.loading(`실패 몰 재수집 중… (${orderFailedAccounts.length}개)`);
    try {
      const result = await quickActions.retryOrders(orderFailedAccounts);
      setOrderFailedAccounts(result.failedAccounts);
      if (result.failedAccounts.length > 0) {
        toast.warning(`재수집 · ${result.success}개 성공, ${result.failedAccounts.length}개 여전히 실패`, { id: toastId });
      } else {
        toast.success('실패 몰 재수집 완료', { id: toastId });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '실패 몰 재수집 실패', { id: toastId });
    } finally {
      setRunningAction(null);
    }
  };

  const tabs = [
    { key: 'agents' as const, label: 'Agent OS' },
    { key: 'revenue' as const, label: '매출 · 이익률' },
    { key: 'ad' as const, label: '광고비 · 비율' },
    ...(hasBenchmark ? [{ key: 'benchmark' as const, label: '업계 평균 대비' }] : []),
  ];

  const adChartData = dailyTrend.map((point) => ({
    date: point.date,
    adCost: point.adCost,
    revenue: point.revenue,
    adRate: point.adRate,
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
                <span className="text-xs font-semibold text-white">{ceo?.name || 'CEO'}</span>
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

                      {/* 주문 전체수집 후 실패한 몰이 있으면 동적으로 재수집 버튼 노출. */}
                      {dept.key === 'order' && orderFailedAccounts.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => void retryFailedOrders()}
                          disabled={runningAction !== null}
                          className="w-full text-left rounded-lg px-2.5 py-2 flex items-center gap-2 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-60"
                        >
                          <span className="w-2 h-2 rounded-full shrink-0 bg-red-500" />
                          <span className="text-[15px] text-red-700 flex-1 leading-snug font-semibold">실패 몰 수집 ({orderFailedAccounts.length})</span>
                          <span className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md bg-red-100 text-red-600" title="실패 몰 재수집">
                            {runningAction === 'order:retry' ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                          </span>
                        </button>
                      ) : null}
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
          { name: '광고비율', my: industryBenchmark.myAdRate ?? 0, avg: industryBenchmark.avgAdRate, unit: '%', invertGood: true },
          { name: 'ROAS', my: industryBenchmark.myRoas ?? 0, avg: industryBenchmark.avgRoas, unit: '%', invertGood: false },
          { name: 'CTR', my: industryBenchmark.myCtr ?? 0, avg: industryBenchmark.avgCtr, unit: '%', invertGood: false },
          { name: 'CVR', my: industryBenchmark.avgCvr ?? 0, avg: 8, unit: '%', invertGood: false },
        ] : null}
        hasTrend={hasTrend}
      />
    </div>
  );
}

'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Loader2, Play, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { ActionTaskSchema, type ActionTask } from '@kiditem/shared/action-task';
import AgentFace from '@/components/AgentFace';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

const DashboardCharts = dynamic(
  () => import('./DashboardCharts').then((mod) => ({ default: mod.DashboardCharts })),
  { ssr: false, loading: () => <div className="h-[320px] flex items-center justify-center text-sm text-slate-300">차트 로딩 중...</div> },
);

type AgentDisplay = {
  role: string;
  name: string;
  title: string;
  status: string;
  color: string;
  currentTask: string | null;
};

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

const ROLE_COLORS: Record<string, string> = {
  ceo: 'violet',
  ad_manager: 'blue',
  inventory: 'emerald',
  finance: 'rose',
  cs: 'amber',
  data_ad: 'blue',
  data_inv: 'emerald',
  data_fin: 'rose',
  data_cs: 'amber',
};

const DEPT_MAP = [
  { key: 'ad', label: '광고부', leadRole: 'ad_manager', memberRole: 'data_ad', color: '#3b82f6' },
  { key: 'inv', label: '재고부', leadRole: 'inventory', memberRole: 'data_inv', color: '#10b981' },
  { key: 'cs', label: 'CS부', leadRole: 'cs', memberRole: 'data_cs', color: '#f59e0b' },
  { key: 'fin', label: '분석부', leadRole: 'finance', memberRole: 'data_fin', color: '#ef4444' },
] as const;

const DEPT_FACE_COLORS: Record<string, string> = {
  ad: 'blue',
  inv: 'emerald',
  cs: 'amber',
  fin: 'rose',
};

function classifyAction(action: ActionTask): string {
  if (action.role === 'ad_manager') return 'ad';
  if (action.role === 'inventory') return 'inv';
  if (action.role === 'cs') return 'cs';
  if (action.role === 'finance') return 'fin';
  const key = `${action.taskKey} ${action.label}`.toLowerCase();
  if (/광고|ad_|roas|campaign|cpc|ctr|클릭|노출|bid/.test(key)) return 'ad';
  if (/재고|stock|inventory|상품|product|reorder|입고|발주|품절/.test(key)) return 'inv';
  if (/cs|고객|review|리뷰|반품|return|문의|refund|교환/.test(key)) return 'cs';
  if (/profit|수익|정산|settlement|category|마진|비용|minus/.test(key)) return 'fin';
  return 'ad';
}

export function DashboardChartPanel({
  dailyTrend,
  aiActions,
  industryBenchmark,
}: {
  dailyTrend: DailyTrendPoint[];
  aiActions: ActionTask[];
  industryBenchmark?: IndustryBenchmark;
}) {
  const [chartTab, setChartTab] = useState<'agents' | 'revenue' | 'ad' | 'benchmark'>('agents');
  const hasTrend = dailyTrend.length > 0;
  const hasBenchmark = !!industryBenchmark;
  const queryClient = useQueryClient();

  const { data: instances = [] } = useQuery({
    queryKey: ['agent-os', 'instances'],
    queryFn: () => apiClient.get<Array<{
      id: string;
      type: string;
      name: string;
      role: string;
      title: string | null;
      reportsToId: string | null;
      lifecycleStatus: string;
    }>>('/api/agent-os/instances'),
    refetchInterval: 30_000,
    enabled: chartTab === 'agents',
  });

  const agents: AgentDisplay[] = instances.map((instance) => ({
    role: instance.role,
    name: instance.name,
    title: instance.title ?? instance.role,
    status: instance.lifecycleStatus === 'active' ? 'idle' : instance.lifecycleStatus,
    color: ROLE_COLORS[instance.role] ?? 'violet',
    currentTask: null,
  }));

  const { mutate: executeAction, variables: executingId } = useMutation({
    mutationFn: async (id: string) => {
      const raw = await apiClient.post<unknown>(`/api/action-tasks/${id}/execute`, {});
      return ActionTaskSchema.parse(raw);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.actionTasks.list() });
      toast.success('액션을 실행했습니다.');
    },
    onError: () => toast.error('실행에 실패했습니다.'),
  });

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

  const isAgentOs = chartTab === 'agents';
  const ceo = agents.find((agent) => agent.role === 'ceo');
  const deptActions: Record<string, ActionTask[]> = { ad: [], inv: [], cs: [], fin: [] };
  for (const action of aiActions) deptActions[classifyAction(action)].push(action);

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
                  <AgentFace color={ceo?.color || 'violet'} role="ceo" size={24} />
                </div>
                <span className="text-xs font-semibold text-white">{ceo?.name || 'CEO'}</span>
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', ceo?.status === 'running' ? 'bg-green-400 animate-pulse' : 'bg-white/40')} />
              </div>
            </div>

            <div className="flex justify-center">
              <div style={{ width: 1.5, height: 8, background: '#7c3aed', opacity: 0.3 }} />
            </div>

            <div className="grid grid-cols-4 gap-2 flex-1 min-h-0">
              {DEPT_MAP.map((dept) => {
                const lead = agents.find((agent) => agent.role === dept.leadRole);
                const isWorking = lead?.status === 'running';
                const faceColor = lead?.color || DEPT_FACE_COLORS[dept.key] || 'violet';
                const faceRole = lead?.role || dept.leadRole;
                const actions = deptActions[dept.key] ?? [];

                return (
                  <div key={dept.key} className="flex flex-col min-h-0">
                    <div className="rounded-xl p-3 flex items-center gap-2.5 border border-slate-100 shrink-0" style={{ boxShadow: isWorking ? `0 3px 12px ${dept.color}20` : '0 1px 4px rgba(0,0,0,0.04)', background: '#ffffff' }}>
                      <div className="relative shrink-0">
                        <div className="w-12 h-12 rounded-full overflow-hidden" style={{ background: `${dept.color}08`, boxShadow: isWorking ? `0 0 0 2px ${dept.color}40` : 'none', transition: 'box-shadow 0.3s' }}>
                          <AgentFace color={faceColor} role={faceRole} size={48} />
                        </div>
                        {isWorking && (
                          <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: '#059669' }}>
                            <Zap size={8} className="text-white" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-base font-bold truncate" style={{ color: lead ? '#0f172a' : dept.color }}>{lead?.name || dept.label}</div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', isWorking ? 'bg-green-500 animate-pulse' : 'bg-gray-300')} />
                          <span className="text-xs" style={{ color: isWorking ? '#059669' : '#94a3b8' }}>{isWorking ? '업무 중' : '대기'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-center">
                      <div style={{ width: 1, height: 6, background: dept.color, opacity: 0.25 }} />
                    </div>

                    <div className="rounded-xl border border-slate-100 flex-1 min-h-0 overflow-y-auto" style={{ background: `${dept.color}04` }}>
                      {actions.length === 0 ? (
                        <div className="flex items-center justify-center h-full py-4">
                          <span className="text-sm text-slate-300">할일 없음</span>
                        </div>
                      ) : (
                        <div className="p-2 space-y-1.5">
                          {actions.map((action) => {
                            const isRunning = executingId === action.id;
                            const dot = action.priority === 'urgent' ? '#ef4444' : action.priority === 'high' ? '#f59e0b' : '#94a3b8';
                            return (
                              <div key={action.id} className="rounded-lg px-2.5 py-2 flex items-start gap-2 bg-white border border-slate-50 hover:border-slate-200 transition-colors">
                                <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: dot }} />
                                <span className="text-[15px] text-slate-800 flex-1 leading-snug line-clamp-2 font-medium">{action.label}</span>
                                <button
                                  onClick={() => executeAction(action.id)}
                                  disabled={isRunning}
                                  className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md mt-0.5 transition-all disabled:opacity-50"
                                  style={{ background: isRunning ? '#e2e8f0' : `${dept.color}15`, color: isRunning ? '#94a3b8' : dept.color }}
                                  title="실행"
                                >
                                  {isRunning ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
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

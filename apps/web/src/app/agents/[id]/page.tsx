'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Play,
  Pause,
  MoreHorizontal,
  RotateCcw,
  Copy,
  CheckCircle2,
  XCircle,
  Clock,
  Timer,
  Loader2,
  Slash,
  Plus,
  Save,
  X,
  Wallet,
  ShieldAlert,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Cpu,
  Zap,
  DollarSign,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { agentApi } from '@/lib/agent-api';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { relativeTime, formatTokens, formatCost, formatDuration } from '@/lib/agent-utils';
import { ADAPTER_LABELS, ROLE_LABELS, SOURCE_LABELS } from '@/lib/agent-types';
import type { Agent, HeartbeatRun, AgentRuntimeState, AgentDetailTab } from '@/lib/agent-types';

/* ---------- constants ---------- */

const RUN_STATUS_ICONS: Record<string, { icon: typeof CheckCircle2; colorClass: string }> = {
  succeeded: { icon: CheckCircle2, colorClass: 'text-green-600' },
  failed: { icon: XCircle, colorClass: 'text-red-600' },
  running: { icon: Loader2, colorClass: 'text-cyan-600' },
  queued: { icon: Clock, colorClass: 'text-yellow-600' },
  timed_out: { icon: Timer, colorClass: 'text-orange-600' },
  cancelled: { icon: Slash, colorClass: 'text-gray-500' },
};

const ALL_TABS: AgentDetailTab[] = ['dashboard', 'instructions', 'skills', 'configuration', 'runs', 'budget'];

const TAB_LABELS: Record<AgentDetailTab, string> = {
  dashboard: '대시보드',
  instructions: '인스트럭션',
  skills: '스킬',
  configuration: '설정',
  runs: '실행 이력',
  budget: '예산',
};

const SOURCE_BADGE_COLORS: Record<string, string> = {
  timer: 'bg-blue-100 text-blue-700',
  assignment: 'bg-violet-100 text-violet-700',
  on_demand: 'bg-cyan-100 text-cyan-700',
  automation: 'bg-amber-100 text-amber-700',
};

/* ---------- main page ---------- */

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === 'string' ? params.id : '';

  const [agent, setAgent] = useState<Agent | null>(null);
  const [runs, setRuns] = useState<HeartbeatRun[]>([]);
  const [runtimeState, setRuntimeState] = useState<AgentRuntimeState | null>(null);
  const [activeTab, setActiveTab] = useState<AgentDetailTab>('dashboard');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);

  // config dirty/saving state for floating save bar
  const [configDirty, setConfigDirty] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const saveConfigRef = useRef<(() => void) | null>(null);
  const cancelConfigRef = useRef<(() => void) | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      const [agentData, runsData, stateData] = await Promise.all([
        agentApi.get(id),
        agentApi.getRuns(id, 30),
        agentApi.getRuntimeState(id).catch(() => null),
      ]);
      setAgent(agentData);
      setRuns(Array.isArray(runsData) ? runsData : []);
      setRuntimeState(stateData);
    } catch (err) {
      console.error('Failed to fetch agent detail:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // reset dirty on tab switch
  useEffect(() => {
    setConfigDirty(false);
    setConfigSaving(false);
  }, [activeTab]);

  const handleAction = async (action: string) => {
    if (!agent) return;
    setActionLoading(action);
    try {
      if (action === 'run') await agentApi.invoke(agent.id);
      else if (action === 'pause') await agentApi.pause(agent.id);
      else if (action === 'resume') await agentApi.resume(agent.id);
      else if (action === 'reset-session') await agentApi.resetSession(agent.id);
      await fetchData();
    } catch (err) {
      console.error(`Action ${action} failed:`, err);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-32 bg-gray-100 rounded" />
          <div className="h-16 bg-gray-100 rounded" />
          <div className="h-8 bg-gray-100 rounded w-2/3" />
          <div className="h-64 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="p-4 sm:p-8">
        <button
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4 transition-colors"
          onClick={() => router.push('/agents')}
        >
          <ArrowLeft className="w-4 h-4" /> 뒤로
        </button>
        <p className="text-gray-500">에이전트를 찾을 수 없습니다.</p>
      </div>
    );
  }

  const showConfigBar = (activeTab === 'configuration' || activeTab === 'instructions') && configDirty;

  return (
    <div className={cn('p-4 sm:p-8', showConfigBar && 'pb-24')}>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500 mb-5">
        <Link href="/agents" className="hover:text-gray-900 transition-colors">에이전트</Link>
        <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
        <span className="text-gray-900 font-medium">{agent.name}</span>
        <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
        <span className="text-gray-500">{TAB_LABELS[activeTab]}</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          {/* Agent icon */}
          <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 text-xl font-semibold text-gray-600">
            {agent.icon ?? agent.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 truncate">{agent.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {ROLE_LABELS[agent.role] ?? agent.role}
              {agent.title ? ` · ${agent.title}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Assign task */}
          <button className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-700">
            <Plus className="w-3.5 h-3.5" />
            <span>태스크 할당</span>
          </button>

          {/* Run heartbeat */}
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
            onClick={() => handleAction('run')}
            disabled={actionLoading === 'run'}
          >
            {actionLoading === 'run' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">하트비트 실행</span>
          </button>

          {/* Pause / Resume */}
          {agent.status === 'paused' ? (
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              onClick={() => handleAction('resume')}
              disabled={actionLoading === 'resume'}
            >
              <Play className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">재개</span>
            </button>
          ) : (
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              onClick={() => handleAction('pause')}
              disabled={actionLoading === 'pause'}
            >
              <Pause className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">일시정지</span>
            </button>
          )}

          <StatusBadge status={agent.status} className="hidden sm:inline-flex" />

          {/* More menu */}
          <div className="relative">
            <button
              className="p-1.5 text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg transition-colors"
              onClick={() => setMoreOpen((o) => !o)}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-white border border-gray-200 rounded-lg shadow-lg p-1">
                  <button
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-left rounded-md hover:bg-gray-50 transition-colors"
                    onClick={() => { navigator.clipboard.writeText(agent.id); setMoreOpen(false); }}
                  >
                    <Copy className="w-3 h-3" /> 에이전트 ID 복사
                  </button>
                  <button
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-left rounded-md hover:bg-gray-50 transition-colors"
                    onClick={() => { handleAction('reset-session'); setMoreOpen(false); }}
                  >
                    <RotateCcw className="w-3 h-3" /> 세션 리셋
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 mb-6 border-b border-gray-200 overflow-x-auto">
        {ALL_TABS.map((tab) => (
          <button
            key={tab}
            className={cn(
              'px-4 py-2.5 text-sm whitespace-nowrap -mb-px border-b-2 transition-colors',
              activeTab === tab
                ? 'border-gray-900 text-gray-900 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
            )}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Floating save/cancel bar */}
      {showConfigBar && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur-sm">
          <div className="flex items-center justify-end gap-2 px-4 sm:px-8 py-3">
            <span className="text-sm text-gray-500 mr-auto">저장되지 않은 변경사항이 있습니다.</span>
            <button
              className="px-4 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              onClick={() => cancelConfigRef.current?.()}
              disabled={configSaving}
            >
              취소
            </button>
            <button
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
              onClick={() => saveConfigRef.current?.()}
              disabled={configSaving}
            >
              {configSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {configSaving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      )}

      {/* Tab content */}
      {activeTab === 'dashboard' && (
        <DashboardTab agent={agent} runs={runs} runtimeState={runtimeState} onSelectRun={(runId) => { setSelectedRunId(runId); setActiveTab('runs'); }} />
      )}
      {activeTab === 'instructions' && (
        <InstructionsTab
          agent={agent}
          onDirtyChange={setConfigDirty}
          onSaveAction={(fn) => { saveConfigRef.current = fn; }}
          onCancelAction={(fn) => { cancelConfigRef.current = fn; }}
          onSavingChange={setConfigSaving}
          onSaved={fetchData}
        />
      )}
      {activeTab === 'skills' && (
        <SkillsTab agent={agent} />
      )}
      {activeTab === 'configuration' && (
        <ConfigurationTab
          agent={agent}
          onDirtyChange={setConfigDirty}
          onSaveAction={(fn) => { saveConfigRef.current = fn; }}
          onCancelAction={(fn) => { cancelConfigRef.current = fn; }}
          onSavingChange={setConfigSaving}
          onSaved={fetchData}
        />
      )}
      {activeTab === 'runs' && (
        <RunsTab runs={runs} selectedRunId={selectedRunId} onSelectRun={setSelectedRunId} />
      )}
      {activeTab === 'budget' && (
        <BudgetTab agent={agent} runtimeState={runtimeState} onSaved={fetchData} />
      )}
    </div>
  );
}

/* ============================================================
   TAB 1 — Dashboard
   ============================================================ */

function DashboardTab({
  agent,
  runs,
  runtimeState,
  onSelectRun,
}: {
  agent: Agent;
  runs: HeartbeatRun[];
  runtimeState: AgentRuntimeState | null;
  onSelectRun: (id: string) => void;
}) {
  const sorted = [...runs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const liveRun = sorted.find((r) => r.status === 'running' || r.status === 'queued');
  const latestRun = liveRun ?? sorted[0] ?? null;
  const isLive = latestRun?.status === 'running' || latestRun?.status === 'queued';

  // run activity last 14 days
  const activityData = buildRunActivity(runs, 14);
  const successRate = computeSuccessRate(runs);

  return (
    <div className="space-y-6">
      {/* Latest run card */}
      {latestRun && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              {isLive && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
                </span>
              )}
              {isLive ? '라이브 실행' : '최근 실행'}
            </h3>
            <button
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
              onClick={() => onSelectRun(latestRun.id)}
            >
              상세 보기 →
            </button>
          </div>
          <LatestRunCard run={latestRun} isLive={isLive} />
        </div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={Activity}
          label="총 실행"
          value={String(runs.length)}
          sub={`${sorted.filter(r => r.status === 'running').length}개 실행 중`}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
        <MetricCard
          icon={CheckCircle2}
          label="성공률"
          value={`${successRate}%`}
          sub="최근 14일"
          iconColor="text-green-600"
          iconBg="bg-green-50"
        />
        <MetricCard
          icon={DollarSign}
          label="누적 비용"
          value={formatCost(runtimeState?.totalCostCents ?? 0)}
          sub="이번 달"
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
        />
        <MetricCard
          icon={Cpu}
          label="총 토큰"
          value={formatTokens((runtimeState?.totalInputTokens ?? 0) + (runtimeState?.totalOutputTokens ?? 0))}
          sub={`in: ${formatTokens(runtimeState?.totalInputTokens ?? 0)}`}
          iconColor="text-purple-600"
          iconBg="bg-purple-50"
        />
      </div>

      {/* Run activity mini chart */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">실행 활동 (최근 14일)</h3>
        <div className="flex items-end gap-1 h-20">
          {activityData.map((day, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${day.date}: ${day.total}회`}>
              <div className="w-full flex flex-col-reverse gap-px">
                {day.succeeded > 0 && (
                  <div
                    className="w-full bg-green-400 rounded-sm"
                    style={{ height: `${Math.max(2, (day.succeeded / Math.max(1, activityData.reduce((m, d) => Math.max(m, d.total), 1))) * 72)}px` }}
                  />
                )}
                {day.failed > 0 && (
                  <div
                    className="w-full bg-red-400 rounded-sm"
                    style={{ height: `${Math.max(2, (day.failed / Math.max(1, activityData.reduce((m, d) => Math.max(m, d.total), 1))) * 72)}px` }}
                  />
                )}
                {day.total === 0 && (
                  <div className="w-full bg-gray-100 rounded-sm" style={{ height: '4px' }} />
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-2">
          <span className="flex items-center gap-1 text-[11px] text-gray-500">
            <span className="w-2 h-2 rounded-sm bg-green-400 inline-block" /> 성공
          </span>
          <span className="flex items-center gap-1 text-[11px] text-gray-500">
            <span className="w-2 h-2 rounded-sm bg-red-400 inline-block" /> 실패
          </span>
        </div>
      </div>

      {/* Recent issues placeholder */}
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-700">최근 이슈</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-6 text-gray-400">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center mb-2">
            <Clock className="w-4 h-4" />
          </div>
          <p className="text-sm">이슈 트래킹 준비 중</p>
          <p className="text-xs text-gray-300 mt-0.5">Coming soon</p>
        </div>
      </div>

      {/* Runtime state */}
      {runtimeState && (
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">런타임 상태</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 tabular-nums">
            <div>
              <span className="text-[11px] uppercase tracking-wide text-gray-400 block mb-1">입력 토큰</span>
              <span className="text-lg font-semibold text-gray-900">{formatTokens(runtimeState.totalInputTokens)}</span>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wide text-gray-400 block mb-1">출력 토큰</span>
              <span className="text-lg font-semibold text-gray-900">{formatTokens(runtimeState.totalOutputTokens)}</span>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wide text-gray-400 block mb-1">총 비용</span>
              <span className="text-lg font-semibold text-gray-900">{formatCost(runtimeState.totalCostCents)}</span>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wide text-gray-400 block mb-1">세션 ID</span>
              <span className="text-xs font-mono text-gray-700 truncate block">
                {runtimeState.sessionId ? runtimeState.sessionId.slice(0, 16) + '…' : '—'}
              </span>
            </div>
          </div>
          {runtimeState.lastError && (
            <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded text-xs text-red-700">
              {runtimeState.lastError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LatestRunCard({ run, isLive }: { run: HeartbeatRun; isLive: boolean }) {
  const statusInfo = RUN_STATUS_ICONS[run.status] ?? { icon: Clock, colorClass: 'text-gray-400' };
  const StatusIcon = statusInfo.icon;
  const sourceBadgeClass = SOURCE_BADGE_COLORS[run.invocationSource] ?? 'bg-gray-100 text-gray-600';

  const summaryText = (() => {
    if (run.stdoutExcerpt) {
      const lines = run.stdoutExcerpt
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0 && !l.startsWith('{') && !l.startsWith('['));
      return lines.slice(0, 2).join(' ').slice(0, 200);
    }
    return run.error ?? '';
  })();

  return (
    <div className={cn(
      'border rounded-lg p-4 space-y-3',
      isLive ? 'border-cyan-300 bg-cyan-50/20 shadow-[0_0_12px_rgba(6,182,212,0.06)]' : 'border-gray-200',
    )}>
      <div className="flex items-center gap-2 flex-wrap">
        <StatusIcon
          className={cn('w-3.5 h-3.5 shrink-0', statusInfo.colorClass, run.status === 'running' && 'animate-spin')}
        />
        <StatusBadge status={run.status} />
        <span className="font-mono text-xs text-gray-400">{run.id.slice(0, 8)}</span>
        <span className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium', sourceBadgeClass)}>
          {SOURCE_LABELS[run.invocationSource] ?? run.invocationSource}
        </span>
        <span className="ml-auto text-xs text-gray-400">{relativeTime(run.createdAt)}</span>
      </div>
      {summaryText && (
        <p className="text-xs text-gray-600 line-clamp-2">{summaryText}</p>
      )}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span>소요: {formatDuration(run.startedAt, run.finishedAt)}</span>
        {(run.usageJson?.costCents as number | undefined) ? (
          <span>비용: {formatCost(run.usageJson!.costCents as number)}</span>
        ) : null}
      </div>
      {run.error && (
        <div className="text-xs text-red-600 bg-red-50 rounded p-2 border border-red-100">{run.error}</div>
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon, label, value, sub, iconColor, iconBg,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  sub: string;
  iconColor: string;
  iconBg: string;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('w-6 h-6 rounded-md flex items-center justify-center', iconBg)}>
          <Icon className={cn('w-3.5 h-3.5', iconColor)} />
        </div>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className="text-xl font-bold text-gray-900 tabular-nums">{value}</div>
      <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>
    </div>
  );
}

/* ============================================================
   TAB 2 — Instructions
   ============================================================ */

function InstructionsTab({
  agent,
  onDirtyChange,
  onSaveAction,
  onCancelAction,
  onSavingChange,
  onSaved,
}: {
  agent: Agent;
  onDirtyChange: (dirty: boolean) => void;
  onSaveAction: (fn: () => void) => void;
  onCancelAction: (fn: () => void) => void;
  onSavingChange: (saving: boolean) => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(agent.promptTemplate ?? '');
  const original = agent.promptTemplate ?? '';

  useEffect(() => {
    setDraft(agent.promptTemplate ?? '');
  }, [agent.promptTemplate]);

  useEffect(() => {
    const dirty = draft !== original;
    onDirtyChange(dirty);

    if (dirty) {
      onSaveAction(async () => {
        onSavingChange(true);
        try {
          await agentApi.update(agent.id, { promptTemplate: draft });
          onSaved();
          onDirtyChange(false);
        } catch (err) {
          console.error('Failed to save instructions:', err);
        } finally {
          onSavingChange(false);
        }
      });
      onCancelAction(() => {
        setDraft(original);
        onDirtyChange(false);
      });
    }
  }, [draft, original, agent.id, onDirtyChange, onSaveAction, onCancelAction, onSavingChange, onSaved]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-900">프롬프트 템플릿</h3>
          <p className="text-xs text-gray-500 mt-0.5">에이전트의 시스템 프롬프트입니다. 편집 후 저장 버튼을 누르세요.</p>
        </div>
      </div>
      <textarea
        className="w-full h-[600px] font-mono text-xs bg-gray-50 border border-gray-200 rounded-lg p-4 text-gray-900 resize-none focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 transition-colors"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        placeholder="프롬프트 템플릿을 입력하세요..."
      />
      <p className="text-xs text-gray-400">
        {draft.length.toLocaleString('ko-KR')}자 · 대략 {Math.round(draft.length / 4).toLocaleString('ko-KR')} 토큰
      </p>
    </div>
  );
}

/* ============================================================
   TAB 3 — Skills
   ============================================================ */

function SkillsTab({ agent }: { agent: Agent }) {
  const skills = agent.skills ?? [];

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-900">에이전트 스킬</h3>
          <p className="text-xs text-gray-500 mt-0.5">이 에이전트에 할당된 스킬 목록입니다.</p>
        </div>
        <button className="text-xs text-blue-600 hover:text-blue-800 transition-colors">
          스킬 라이브러리 보기 →
        </button>
      </div>

      {skills.length === 0 ? (
        <div className="border border-gray-200 rounded-lg p-8 text-center">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <Zap className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500">등록된 스킬이 없습니다.</p>
          <p className="text-xs text-gray-400 mt-1">에이전트 설정에서 스킬을 추가할 수 있습니다.</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {skills.map((skill, index) => (
            <div
              key={skill}
              className={cn(
                'flex items-center gap-3 px-4 py-3',
                index < skills.length - 1 && 'border-b border-gray-100',
              )}
            >
              <div className="w-3.5 h-3.5 rounded border-2 border-gray-300 bg-white flex items-center justify-center shrink-0">
                <div className="w-1.5 h-1.5 rounded-sm bg-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-900 font-mono">{skill}</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                활성
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Skill management info */}
      <div className="border border-gray-100 rounded-lg p-4 bg-gray-50">
        <p className="text-xs text-gray-500">
          <span className="font-medium text-gray-700">스킬 관리:</span> 스킬은{' '}
          <code className="font-mono text-gray-700 bg-white px-1 rounded border border-gray-200">agent-config/skills/</code>{' '}
          디렉토리에서 심링크로 주입됩니다.
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   TAB 4 — Configuration (Editable)
   ============================================================ */

type ConfigForm = {
  name: string;
  title: string;
  description: string;
  timeoutSeconds: number;
  schedule: string;
  monthlyTokenBudget: number;
};

function ConfigurationTab({
  agent,
  onDirtyChange,
  onSaveAction,
  onCancelAction,
  onSavingChange,
  onSaved,
}: {
  agent: Agent;
  onDirtyChange: (dirty: boolean) => void;
  onSaveAction: (fn: () => void) => void;
  onCancelAction: (fn: () => void) => void;
  onSavingChange: (saving: boolean) => void;
  onSaved: () => void;
}) {
  const originalForm: ConfigForm = {
    name: agent.name,
    title: agent.title ?? '',
    description: agent.description ?? '',
    timeoutSeconds: agent.timeoutSeconds,
    schedule: agent.schedule ?? '',
    monthlyTokenBudget: agent.monthlyTokenBudget,
  };

  const [form, setForm] = useState<ConfigForm>(originalForm);

  useEffect(() => {
    setForm({
      name: agent.name,
      title: agent.title ?? '',
      description: agent.description ?? '',
      timeoutSeconds: agent.timeoutSeconds,
      schedule: agent.schedule ?? '',
      monthlyTokenBudget: agent.monthlyTokenBudget,
    });
  }, [agent]);

  const isDirty =
    form.name !== agent.name ||
    form.title !== (agent.title ?? '') ||
    form.description !== (agent.description ?? '') ||
    form.timeoutSeconds !== agent.timeoutSeconds ||
    form.schedule !== (agent.schedule ?? '') ||
    form.monthlyTokenBudget !== agent.monthlyTokenBudget;

  useEffect(() => {
    onDirtyChange(isDirty);

    if (isDirty) {
      onSaveAction(async () => {
        onSavingChange(true);
        try {
          await agentApi.update(agent.id, {
            name: form.name,
            title: form.title || null,
            description: form.description || null,
            timeoutSeconds: form.timeoutSeconds,
            schedule: form.schedule || null,
            monthlyTokenBudget: form.monthlyTokenBudget,
          });
          onSaved();
          onDirtyChange(false);
        } catch (err) {
          console.error('Failed to save configuration:', err);
        } finally {
          onSavingChange(false);
        }
      });
      onCancelAction(() => {
        setForm(originalForm);
        onDirtyChange(false);
      });
    }
  }, [isDirty, form, agent.id]);

  const field = (key: keyof ConfigForm) => ({
    value: String(form[key]),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const raw = e.target.value;
      if (key === 'timeoutSeconds' || key === 'monthlyTokenBudget') {
        setForm(f => ({ ...f, [key]: Number(raw) || 0 }));
      } else {
        setForm(f => ({ ...f, [key]: raw }));
      }
    },
  });

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Identity */}
      <ConfigSection title="Identity">
        <div className="space-y-4">
          <FormField label="이름">
            <input
              type="text"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 transition-colors"
              {...field('name')}
            />
          </FormField>
          <FormField label="직함">
            <input
              type="text"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 transition-colors"
              placeholder="e.g. Senior Analyst"
              {...field('title')}
            />
          </FormField>
          <FormField label="설명">
            <textarea
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 transition-colors resize-none"
              rows={3}
              {...field('description')}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="역할">
              <div className="px-3 py-2 text-sm border border-gray-100 rounded-lg bg-gray-50 text-gray-600">
                {ROLE_LABELS[agent.role] ?? agent.role}
              </div>
            </FormField>
            <FormField label="타입">
              <div className="px-3 py-2 text-sm border border-gray-100 rounded-lg bg-gray-50 text-gray-600 font-mono">
                {agent.type}
              </div>
            </FormField>
          </div>
        </div>
      </ConfigSection>

      {/* Adapter */}
      <ConfigSection title="Adapter">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="어댑터 타입">
            <div className="px-3 py-2 text-sm border border-gray-100 rounded-lg bg-gray-50 text-gray-600 font-mono">
              {ADAPTER_LABELS[agent.adapterType] ?? agent.adapterType}
            </div>
          </FormField>
          <FormField label="모델">
            <div className="px-3 py-2 text-sm border border-gray-100 rounded-lg bg-gray-50 text-gray-600 font-mono truncate">
              {(agent.adapterConfig?.model as string) ?? '—'}
            </div>
          </FormField>
        </div>
        <div className="mt-4">
          <span className="text-xs text-gray-500 block mb-1">어댑터 설정 (JSON)</span>
          <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-x-auto text-gray-700">
            {JSON.stringify(agent.adapterConfig, null, 2)}
          </pre>
        </div>
      </ConfigSection>

      {/* Runtime */}
      <ConfigSection title="Runtime">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="타임아웃 (초)">
            <input
              type="number"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 transition-colors"
              min={0}
              {...field('timeoutSeconds')}
            />
          </FormField>
          <FormField label="스케줄 (cron)">
            <input
              type="text"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 transition-colors font-mono"
              placeholder="0 * * * *"
              {...field('schedule')}
            />
          </FormField>
        </div>
      </ConfigSection>

      {/* Permissions */}
      <ConfigSection title="Permissions">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="권한 모드">
            <div className="px-3 py-2 text-sm border border-gray-100 rounded-lg bg-gray-50 text-gray-600 font-mono">
              {agent.permissionMode || '—'}
            </div>
          </FormField>
          <FormField label="허용 도구">
            <div className="px-3 py-2 text-sm border border-gray-100 rounded-lg bg-gray-50 text-gray-600 truncate">
              {agent.allowedTools || '—'}
            </div>
          </FormField>
        </div>
      </ConfigSection>
    </div>
  );
}

function ConfigSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{title}</h4>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

/* ============================================================
   TAB 5 — Runs
   ============================================================ */

function RunsTab({
  runs,
  selectedRunId,
  onSelectRun,
}: {
  runs: HeartbeatRun[];
  selectedRunId: string | null;
  onSelectRun: (id: string | null) => void;
}) {
  const sorted = [...runs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const effectiveSelectedId = selectedRunId ?? sorted[0]?.id ?? null;
  const selectedRun = sorted.find((r) => r.id === effectiveSelectedId) ?? null;

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <Clock className="w-8 h-8 mb-3" />
        <p className="text-sm">실행 이력이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex gap-4 min-h-[500px]">
      {/* Run list */}
      <div className="w-72 shrink-0 border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
          <span className="text-xs font-medium text-gray-600">실행 목록</span>
          <span className="text-xs text-gray-400 ml-1.5">({sorted.length})</span>
        </div>
        <div className="overflow-y-auto max-h-[600px]">
          {sorted.map((run) => {
            const isSelected = effectiveSelectedId === run.id;
            const statusInfo = RUN_STATUS_ICONS[run.status] ?? { icon: Clock, colorClass: 'text-gray-400' };
            const StatusIcon = statusInfo.icon;
            const sourceBadgeClass = SOURCE_BADGE_COLORS[run.invocationSource] ?? 'bg-gray-100 text-gray-600';

            return (
              <button
                key={run.id}
                className={cn(
                  'w-full text-left px-3 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors',
                  isSelected && 'bg-blue-50 border-l-2 border-l-blue-600',
                )}
                onClick={() => onSelectRun(run.id)}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <StatusIcon className={cn('w-3.5 h-3.5 shrink-0', statusInfo.colorClass, run.status === 'running' && 'animate-spin')} />
                  <StatusBadge status={run.status} />
                </div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs text-gray-400 font-mono">{run.id.slice(0, 8)}</span>
                  <span className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium', sourceBadgeClass)}>
                    {SOURCE_LABELS[run.invocationSource] ?? run.invocationSource}
                  </span>
                </div>
                <div className="text-[11px] text-gray-400 mt-1">{relativeTime(run.createdAt)}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Run detail */}
      <div className="flex-1 border border-gray-200 rounded-lg overflow-hidden">
        {selectedRun ? (
          <RunDetail run={selectedRun} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            실행을 선택하세요.
          </div>
        )}
      </div>
    </div>
  );
}

function RunDetail({ run }: { run: HeartbeatRun }) {
  const inputTokens = (run.usageJson?.inputTokens as number | undefined) ?? 0;
  const outputTokens = (run.usageJson?.outputTokens as number | undefined) ?? 0;
  const costCents = (run.usageJson?.costCents as number | undefined) ?? 0;
  const statusInfo = RUN_STATUS_ICONS[run.status] ?? { icon: Clock, colorClass: 'text-gray-400' };
  const StatusIcon = statusInfo.icon;
  const [stdoutOpen, setStdoutOpen] = useState(true);
  const [stderrOpen, setStderrOpen] = useState(true);

  return (
    <div className="h-full overflow-y-auto">
      {/* Detail header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusIcon className={cn('w-3.5 h-3.5', statusInfo.colorClass, run.status === 'running' && 'animate-spin')} />
          <StatusBadge status={run.status} />
          <span className="font-mono text-xs text-gray-500">{run.id.slice(0, 16)}…</span>
          {run.exitCode !== null && (
            <span className="text-xs text-gray-500 ml-auto">exit: {run.exitCode}</span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Timing */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-xs text-gray-500 block mb-0.5">시작</span>
            <span className="text-sm text-gray-900">
              {run.startedAt ? new Date(run.startedAt).toLocaleString('ko-KR') : '—'}
            </span>
          </div>
          <div>
            <span className="text-xs text-gray-500 block mb-0.5">종료</span>
            <span className="text-sm text-gray-900">
              {run.finishedAt ? new Date(run.finishedAt).toLocaleString('ko-KR') : '—'}
            </span>
          </div>
          <div>
            <span className="text-xs text-gray-500 block mb-0.5">소요</span>
            <span className="text-sm text-gray-900">{formatDuration(run.startedAt, run.finishedAt)}</span>
          </div>
          <div>
            <span className="text-xs text-gray-500 block mb-0.5">소스</span>
            <span className="text-sm text-gray-900">
              {SOURCE_LABELS[run.invocationSource] ?? run.invocationSource}
            </span>
          </div>
        </div>

        {/* Token usage */}
        {(inputTokens > 0 || outputTokens > 0 || costCents > 0) && (
          <div className="border border-gray-200 rounded-lg p-3 grid grid-cols-3 gap-3">
            <div>
              <span className="text-[11px] uppercase tracking-wide text-gray-400 block mb-0.5">입력 토큰</span>
              <span className="text-sm font-semibold tabular-nums">{formatTokens(inputTokens)}</span>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wide text-gray-400 block mb-0.5">출력 토큰</span>
              <span className="text-sm font-semibold tabular-nums">{formatTokens(outputTokens)}</span>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wide text-gray-400 block mb-0.5">비용</span>
              <span className="text-sm font-semibold tabular-nums">{formatCost(costCents)}</span>
            </div>
          </div>
        )}

        {/* Session info */}
        {(run.sessionIdBefore || run.sessionIdAfter) && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-gray-500 block mb-0.5">이전 세션</span>
              <span className="text-xs font-mono text-gray-700 truncate block">
                {run.sessionIdBefore ? run.sessionIdBefore.slice(0, 20) + '…' : '—'}
              </span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block mb-0.5">이후 세션</span>
              <span className="text-xs font-mono text-gray-700 truncate block">
                {run.sessionIdAfter ? run.sessionIdAfter.slice(0, 20) + '…' : '—'}
              </span>
            </div>
          </div>
        )}

        {/* Error */}
        {run.error && (
          <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">
            <p className="font-medium mb-1">에러</p>
            {run.error}
          </div>
        )}

        {/* Stdout */}
        {run.stdoutExcerpt && (
          <div>
            <button
              className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-2 hover:text-gray-900 transition-colors"
              onClick={() => setStdoutOpen(v => !v)}
            >
              {stdoutOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Stdout
            </button>
            {stdoutOpen && (
              <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-72 overflow-auto whitespace-pre-wrap text-gray-800 leading-relaxed">
                {run.stdoutExcerpt}
              </pre>
            )}
          </div>
        )}

        {/* Stderr */}
        {run.stderrExcerpt && (
          <div>
            <button
              className="flex items-center gap-1.5 text-xs font-medium text-red-600 mb-2 hover:text-red-800 transition-colors"
              onClick={() => setStderrOpen(v => !v)}
            >
              {stderrOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Stderr
            </button>
            {stderrOpen && (
              <pre className="text-xs bg-red-50 border border-red-100 rounded-lg p-3 max-h-72 overflow-auto whitespace-pre-wrap text-red-700 leading-relaxed">
                {run.stderrExcerpt}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   TAB 6 — Budget
   ============================================================ */

function BudgetTab({
  agent,
  runtimeState,
  onSaved,
}: {
  agent: Agent;
  runtimeState: AgentRuntimeState | null;
  onSaved: () => void;
}) {
  const [budgetInput, setBudgetInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const observedCents = runtimeState?.totalCostCents ?? 0;
  const budgetCents = agent.monthlyTokenBudget; // stored as tokens but we display as tokens
  const tokensUsed = (runtimeState?.totalInputTokens ?? 0) + (runtimeState?.totalOutputTokens ?? 0);
  const tokensTotal = agent.monthlyTokenBudget;
  const progressPct = tokensTotal > 0 ? Math.min((tokensUsed / tokensTotal) * 100, 100) : 0;
  const remaining = Math.max(tokensTotal - tokensUsed, 0);

  const isHealthy = progressPct < 80;

  const handleSetBudget = async () => {
    const val = Number(budgetInput);
    if (!Number.isFinite(val) || val < 0) return;
    setSaving(true);
    try {
      await agentApi.update(agent.id, { monthlyTokenBudget: Math.round(val) });
      await onSaved();
      setBudgetInput('');
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
    } catch (err) {
      console.error('Failed to set budget:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400">AGENT</p>
          <h2 className="text-xl font-semibold text-gray-900 mt-1">{agent.name}</h2>
          <p className="text-sm text-gray-500 mt-1">월간 UTC 예산</p>
        </div>
        <div className={cn(
          'inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] font-medium',
          isHealthy ? 'text-green-600' : 'text-amber-600',
        )}>
          {isHealthy ? <Wallet className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          {isHealthy ? 'HEALTHY' : 'WARNING'}
        </div>
      </div>

      {/* Observed / Budget grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="border border-gray-200 rounded-lg p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400">Observed</p>
          <p className="text-xl font-semibold text-gray-900 mt-2 tabular-nums">{formatCost(observedCents)}</p>
          <p className="text-xs text-gray-400 mt-1">
            {budgetCents > 0 ? `${progressPct.toFixed(1)}% 사용` : '한도 없음'}
          </p>
        </div>
        <div className="border border-gray-200 rounded-lg p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400">Budget (tokens)</p>
          <p className="text-xl font-semibold text-gray-900 mt-2 tabular-nums">
            {budgetCents > 0 ? formatTokens(budgetCents) : 'Disabled'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            월간 토큰 예산
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>남은 예산</span>
          <span>{tokensTotal > 0 ? formatTokens(remaining) : '무제한'}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              progressPct >= 90 ? 'bg-red-500' : progressPct >= 75 ? 'bg-amber-400' : 'bg-green-500',
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Token stats */}
      {runtimeState && (
        <div className="border border-gray-200 rounded-lg p-4 grid grid-cols-3 gap-4">
          <div>
            <span className="text-[11px] uppercase tracking-wide text-gray-400 block mb-1">입력 토큰</span>
            <span className="text-base font-semibold tabular-nums text-gray-900">{formatTokens(runtimeState.totalInputTokens)}</span>
          </div>
          <div>
            <span className="text-[11px] uppercase tracking-wide text-gray-400 block mb-1">출력 토큰</span>
            <span className="text-base font-semibold tabular-nums text-gray-900">{formatTokens(runtimeState.totalOutputTokens)}</span>
          </div>
          <div>
            <span className="text-[11px] uppercase tracking-wide text-gray-400 block mb-1">총 비용</span>
            <span className="text-base font-semibold tabular-nums text-green-700">{formatCost(runtimeState.totalCostCents)}</span>
          </div>
        </div>
      )}

      {/* Set budget */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
        <label className="text-[11px] uppercase tracking-[0.18em] text-gray-400 block">
          월간 토큰 예산 설정
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 transition-colors"
            placeholder="토큰 수 (예: 1000000)"
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
            min={0}
          />
          <button
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            onClick={handleSetBudget}
            disabled={saving || !budgetInput}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            예산 설정
          </button>
        </div>
        {savedMsg && (
          <p className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> 저장되었습니다.
          </p>
        )}
        {agent.budgetResetAt && (
          <p className="text-xs text-gray-400">
            다음 리셋: {new Date(agent.budgetResetAt).toLocaleDateString('ko-KR')}
          </p>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Helpers
   ============================================================ */

function buildRunActivity(runs: HeartbeatRun[], days: number) {
  const today = new Date();
  const result: { date: string; total: number; succeeded: number; failed: number }[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayRuns = runs.filter(r => r.createdAt.slice(0, 10) === dateStr);
    result.push({
      date: dateStr,
      total: dayRuns.length,
      succeeded: dayRuns.filter(r => r.status === 'succeeded').length,
      failed: dayRuns.filter(r => r.status === 'failed' || r.status === 'timed_out').length,
    });
  }
  return result;
}

function computeSuccessRate(runs: HeartbeatRun[]): number {
  const last14days = new Date();
  last14days.setDate(last14days.getDate() - 14);
  const recent = runs.filter(r => new Date(r.createdAt) >= last14days);
  if (recent.length === 0) return 0;
  const succeeded = recent.filter(r => r.status === 'succeeded').length;
  return Math.round((succeeded / recent.length) * 100);
}

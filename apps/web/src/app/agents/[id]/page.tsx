'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import PageSkeleton from '@/components/ui/PageSkeleton';
import {
  ArrowLeft,
  Play,
  Pause,
  MoreHorizontal,
  RotateCcw,
  Copy,
  Loader2,
  Plus,
  Save,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { useAgent, useAgentRuns, useAgentRuntimeState, useInvokeAgent, usePauseAgent, useResumeAgent, useResetAgentSession } from '@/hooks/use-agents';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ROLE_LABELS } from '@/lib/agent-types';
import type { AgentDetailTab } from '@/lib/agent-types';

import { DashboardTab } from './components/DashboardTab';
import { InstructionsTab } from './components/InstructionsTab';
import { SkillsTab } from './components/SkillsTab';
import { ConfigurationTab } from './components/ConfigurationTab';
import { RunsTab } from './components/RunsTab';
import { BudgetTab } from './components/BudgetTab';

/* ---------- constants ---------- */

const ALL_TABS: AgentDetailTab[] = ['dashboard', 'instructions', 'skills', 'configuration', 'runs', 'budget'];

const TAB_LABELS: Record<AgentDetailTab, string> = {
  dashboard: '대시보드',
  instructions: '인스트럭션',
  skills: '스킬',
  configuration: '설정',
  runs: '실행 이력',
  budget: '예산',
};

/* ---------- main page ---------- */

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = typeof params?.id === 'string' ? params.id : '';

  const [activeTab, setActiveTab] = useState<AgentDetailTab>('dashboard');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  // config dirty/saving state for floating save bar
  const [configDirty, setConfigDirty] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const saveConfigRef = useRef<(() => void) | null>(null);
  const cancelConfigRef = useRef<(() => void) | null>(null);

  // Queries
  const { data: agent, isLoading: agentLoading, error: agentError } = useAgent(id, { refetchInterval: 15_000 });
  const { data: runsData, isLoading: runsLoading } = useAgentRuns(id, 30, { refetchInterval: 15_000 });
  const { data: runtimeState = null } = useAgentRuntimeState(id, { refetchInterval: 15_000 });
  const runs = Array.isArray(runsData) ? runsData : [];
  const loading = agentLoading || runsLoading;
  const error = agentError ? (isApiError(agentError) ? agentError.detail : '에이전트 정보를 불러오는데 실패했습니다.') : null;

  // Mutations
  const invokeAgent = useInvokeAgent();
  const pauseAgent = usePauseAgent();
  const resumeAgent = useResumeAgent();
  const resetSession = useResetAgentSession();

  const handleAction = async (action: string) => {
    if (!agent) return;
    try {
      if (action === 'run') await invokeAgent.mutateAsync(agent.id);
      else if (action === 'pause') await pauseAgent.mutateAsync({ id: agent.id });
      else if (action === 'resume') await resumeAgent.mutateAsync(agent.id);
      else if (action === 'reset-session') await resetSession.mutateAsync(agent.id);
    } catch (err) {
      alert(isApiError(err) ? err.detail : `작업(${action})에 실패했습니다.`);
    }
  };

  const actionLoading = invokeAgent.isPending ? 'run'
    : pauseAgent.isPending ? 'pause'
    : resumeAgent.isPending ? 'resume'
    : resetSession.isPending ? 'reset-session'
    : null;

  // reset dirty on tab switch
  useEffect(() => {
    setConfigDirty(false);
    setConfigSaving(false);
  }, [activeTab]);

  const invalidateAgent = () => queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(id) });

  if (loading) {
    return (
      <div className="p-4 sm:p-8">
        <PageSkeleton variant="detail" />
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
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
        </div>
      )}
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
          onSaved={invalidateAgent}
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
          onSaved={invalidateAgent}
        />
      )}
      {activeTab === 'runs' && (
        <RunsTab runs={runs} selectedRunId={selectedRunId} onSelectRun={setSelectedRunId} />
      )}
      {activeTab === 'budget' && (
        <BudgetTab agent={agent} runtimeState={runtimeState} onSaved={invalidateAgent} />
      )}
    </div>
  );
}

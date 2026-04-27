'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { isApiError } from '@/lib/api-error';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { queryKeys } from '@/lib/query-keys';
import { useAgent, useAgentRuns, useAgentRuntimeState, useInvokeAgent, usePauseAgent, useResumeAgent, useResetAgentSession } from '../hooks/useAgents';
import { AgentDetailHeader } from './components/AgentDetailHeader';
import { AgentConfigSaveBar } from './components/AgentConfigSaveBar';
import { DashboardTab } from './components/DashboardTab';
import { InstructionsTab } from './components/InstructionsTab';
import { SkillsTab } from './components/SkillsTab';
import { ConfigurationTab } from './components/ConfigurationTab';
import { RunsTab } from './components/RunsTab';
import { BudgetTab } from './components/BudgetTab';
import type { AgentDetailTab } from '../lib/agent-types';

/* ---------- constants ---------- */

const ALL_TABS: AgentDetailTab[] = ['dashboard', 'instructions', 'skills', 'configuration', 'runs', 'budget'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const agentId = UUID_RE.test(id) ? id : '';

  const [activeTab, setActiveTab] = useState<AgentDetailTab>('dashboard');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const [configDirty, setConfigDirty] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const saveConfigRef = useRef<(() => void) | null>(null);
  const cancelConfigRef = useRef<(() => void) | null>(null);

  const { data: agent, isLoading: agentLoading, error: agentError } = useAgent(agentId, { refetchInterval: 15_000 });
  const { data: runsData, isLoading: runsLoading } = useAgentRuns(agentId, 30, { refetchInterval: 15_000 });
  const { data: runtimeState } = useAgentRuntimeState(agentId, { refetchInterval: 15_000 });
  const runs = Array.isArray(runsData) ? runsData : [];
  const loading = agentLoading || runsLoading;
  const error = agentError ? (isApiError(agentError) ? agentError.detail : '에이전트 정보를 불러오는데 실패했습니다.') : null;

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
      toast.error(isApiError(err) ? err.detail : `작업(${action})에 실패했습니다.`);
    }
  };

  const actionLoading = invokeAgent.isPending ? 'run'
    : pauseAgent.isPending ? 'pause'
    : resumeAgent.isPending ? 'resume'
    : resetSession.isPending ? 'reset-session'
    : null;

  useEffect(() => {
    setConfigDirty(false);
    setConfigSaving(false);
  }, [activeTab]);

  useEffect(() => {
    if (id && !agentId) router.replace('/agents');
  }, [agentId, id, router]);

  const invalidateAgent = () => {
    if (agentId) queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agentId) });
  };

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
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-4 transition-colors"
          onClick={() => router.push('/agents')}
        >
          <ArrowLeft className="w-4 h-4" /> 뒤로
        </button>
        {agentError && isApiError(agentError) && agentError.status === 403 ? (
          <div className="flex flex-col items-center py-32 text-slate-400 gap-2">
            <p>이 에이전트는 아직 고용되지 않았습니다.</p>
            <button
              onClick={() => router.push('/agents?tab=marketplace')}
              className="text-sm text-violet-600 hover:text-violet-800 transition-colors"
            >
              마켓플레이스에서 고용하기 →
            </button>
          </div>
        ) : (
          <p className="text-slate-500">에이전트를 찾을 수 없습니다.</p>
        )}
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

      <AgentDetailHeader
        agent={agent}
        tabLabel={TAB_LABELS[activeTab]}
        actionLoading={actionLoading}
        onAction={handleAction}
        moreOpen={moreOpen}
        setMoreOpen={setMoreOpen}
      />

      {/* Tab bar */}
      <div className="flex gap-0 mb-6 border-b border-slate-200 overflow-x-auto">
        {ALL_TABS.map((tab) => (
          <button
            key={tab}
            className={cn(
              'px-4 py-2.5 text-sm whitespace-nowrap -mb-px border-b-2 transition-colors',
              activeTab === tab
                ? 'border-slate-900 text-slate-900 font-medium'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
            )}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {showConfigBar && (
        <AgentConfigSaveBar
          saving={configSaving}
          onSave={() => saveConfigRef.current?.()}
          onCancel={() => cancelConfigRef.current?.()}
        />
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

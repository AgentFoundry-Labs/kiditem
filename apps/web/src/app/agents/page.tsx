'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Bot,
  Play,
  Pause,
  RotateCcw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Timer,
  Activity,
  ChevronDown,
  ChevronUp,
  Zap,
  Shield,
} from 'lucide-react';
import { API_BASE } from '@/lib/api';
import { cn } from '@/lib/utils';

interface AgentDefinition {
  id: string;
  name: string;
  type: string;
  description: string;
  role: string;
  title: string;
  status: string;
  adapterType: string;
  skills: string[];
  schedule: string | null;
  timeoutSeconds: number;
  isActive: boolean;
  monthlyTokenBudget: number;
  tokensUsed: number;
  lastHeartbeatAt: string | null;
  pauseReason: string | null;
}

interface HeartbeatRun {
  id: string;
  invocationSource: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  errorCode: string | null;
  error: string | null;
  usageJson: { inputTokens?: number; outputTokens?: number } | null;
}

interface RuntimeState {
  sessionId: string | null;
  lastRunStatus: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostCents: number;
  lastError: string | null;
}

const STATUS_CONFIG: Record<string, { color: string; icon: typeof CheckCircle2; label: string }> = {
  idle: { color: 'text-gray-500 bg-gray-50', icon: Clock, label: '대기' },
  running: { color: 'text-blue-600 bg-blue-50', icon: Activity, label: '실행 중' },
  paused: { color: 'text-yellow-600 bg-yellow-50', icon: Pause, label: '일시정지' },
  disabled: { color: 'text-red-500 bg-red-50', icon: XCircle, label: '비활성' },
};

const RUN_STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  queued: { color: 'text-gray-500', label: '대기' },
  running: { color: 'text-blue-600', label: '실행 중' },
  succeeded: { color: 'text-green-600', label: '성공' },
  failed: { color: 'text-red-500', label: '실패' },
  timed_out: { color: 'text-orange-500', label: '타임아웃' },
  cancelled: { color: 'text-gray-400', label: '취소' },
};

const ROLE_BADGE: Record<string, string> = {
  manager: 'bg-indigo-100 text-indigo-700',
  specialist: 'bg-gray-100 text-gray-700',
};

function timeAgo(date: string | null): string {
  if (!date) return '-';
  const diff = Date.now() - new Date(date).getTime();
  if (diff < 60_000) return '방금 전';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}시간 전`;
  return `${Math.floor(diff / 86400_000)}일 전`;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, HeartbeatRun[]>>({});
  const [runtimeStates, setRuntimeStates] = useState<Record<string, RuntimeState>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/agent-registry`);
      const data = await res.json();
      setAgents(data);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const fetchRuns = async (agentId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/agent-registry/${agentId}/runs?limit=10`);
      const data = await res.json();
      setRuns(prev => ({ ...prev, [agentId]: data }));
    } catch (err) {
      console.error('Failed to fetch runs:', err);
    }
  };

  const fetchRuntimeState = async (agentId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/agent-registry/${agentId}/runtime-state`);
      if (res.ok) {
        const data = await res.json();
        if (data) setRuntimeStates(prev => ({ ...prev, [agentId]: data }));
      }
    } catch (err) {
      console.error('Failed to fetch runtime state:', err);
    }
  };

  const toggleExpand = (agentId: string) => {
    if (expandedId === agentId) {
      setExpandedId(null);
    } else {
      setExpandedId(agentId);
      fetchRuns(agentId);
      fetchRuntimeState(agentId);
    }
  };

  const handleAction = async (agentId: string, action: 'pause' | 'resume' | 'reset-session' | 'run') => {
    setActionLoading(`${agentId}-${action}`);
    try {
      const url = action === 'run'
        ? `${API_BASE}/api/agent-registry/${agentId}/run`
        : `${API_BASE}/api/agent-registry/${agentId}/${action}`;
      await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      await fetchAgents();
      if (expandedId === agentId) {
        fetchRuns(agentId);
        fetchRuntimeState(agentId);
      }
    } catch (err) {
      console.error(`Action ${action} failed:`, err);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-lg" />)}
        </div>
      </div>
    );
  }

  const managers = agents.filter(a => a.role === 'manager');
  const specialists = agents.filter(a => a.role !== 'manager');

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">에이전트 관리</h1>
          <p className="text-sm text-gray-500 mt-1">
            {agents.length}개 에이전트 · {agents.filter(a => a.status === 'running').length}개 실행 중
          </p>
        </div>
      </div>

      {/* Manager Section */}
      {managers.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Manager</h2>
          <div className="space-y-3">
            {managers.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                expanded={expandedId === agent.id}
                runs={runs[agent.id]}
                runtimeState={runtimeStates[agent.id]}
                actionLoading={actionLoading}
                onToggle={() => toggleExpand(agent.id)}
                onAction={(action) => handleAction(agent.id, action)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Specialist Section */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Specialists</h2>
        <div className="space-y-3">
          {specialists.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              expanded={expandedId === agent.id}
              runs={runs[agent.id]}
              runtimeState={runtimeStates[agent.id]}
              actionLoading={actionLoading}
              onToggle={() => toggleExpand(agent.id)}
              onAction={(action) => handleAction(agent.id, action)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentCard({
  agent,
  expanded,
  runs,
  runtimeState,
  actionLoading,
  onToggle,
  onAction,
}: {
  agent: AgentDefinition;
  expanded: boolean;
  runs?: HeartbeatRun[];
  runtimeState?: RuntimeState;
  actionLoading: string | null;
  onToggle: () => void;
  onAction: (action: 'pause' | 'resume' | 'reset-session' | 'run') => void;
}) {
  const statusCfg = STATUS_CONFIG[agent.status] || STATUS_CONFIG.idle;
  const StatusIcon = statusCfg.icon;

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      {/* Header */}
      <div
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50"
        onClick={onToggle}
      >
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', statusCfg.color)}>
          <Bot className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">{agent.name}</h3>
            <span className={cn('px-2 py-0.5 text-xs rounded-full font-medium', ROLE_BADGE[agent.role] || ROLE_BADGE.specialist)}>
              {agent.role}
            </span>
            <span className={cn('px-2 py-0.5 text-xs rounded-full', statusCfg.color)}>
              {statusCfg.label}
            </span>
          </div>
          <p className="text-sm text-gray-500 truncate">{agent.description}</p>
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-500">
          {agent.schedule && (
            <span className="flex items-center gap-1">
              <Timer className="w-3.5 h-3.5" />
              {agent.schedule}
            </span>
          )}
          {agent.lastHeartbeatAt && (
            <span className="flex items-center gap-1">
              <Zap className="w-3.5 h-3.5" />
              {timeAgo(agent.lastHeartbeatAt)}
            </span>
          )}
        </div>

        {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-4">
          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onAction('run')}
              disabled={actionLoading === `${agent.id}-run`}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
            >
              <Play className="w-3.5 h-3.5" /> 실행
            </button>
            {agent.status === 'paused' ? (
              <button
                onClick={() => onAction('resume')}
                disabled={actionLoading === `${agent.id}-resume`}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-1"
              >
                <Play className="w-3.5 h-3.5" /> 재개
              </button>
            ) : (
              <button
                onClick={() => onAction('pause')}
                disabled={actionLoading === `${agent.id}-pause`}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-1"
              >
                <Pause className="w-3.5 h-3.5" /> 일시정지
              </button>
            )}
            <button
              onClick={() => onAction('reset-session')}
              disabled={actionLoading === `${agent.id}-reset-session`}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" /> 세션 리셋
            </button>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Adapter</span>
              <p className="font-medium">{agent.adapterType}</p>
            </div>
            <div>
              <span className="text-gray-500">Timeout</span>
              <p className="font-medium">{agent.timeoutSeconds}초</p>
            </div>
            <div>
              <span className="text-gray-500">Skills</span>
              <p className="font-medium">{agent.skills?.length > 0 ? agent.skills.join(', ') : '-'}</p>
            </div>
            <div>
              <span className="text-gray-500">토큰 사용량</span>
              <p className="font-medium">
                {agent.tokensUsed.toLocaleString()}
                {agent.monthlyTokenBudget > 0 && ` / ${agent.monthlyTokenBudget.toLocaleString()}`}
              </p>
            </div>
          </div>

          {/* Runtime State */}
          {runtimeState && (
            <div className="bg-gray-50 rounded-md p-3 text-sm">
              <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-1">
                <Shield className="w-3.5 h-3.5" /> Runtime State
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <span className="text-gray-500">Session</span>
                  <p className="font-mono text-xs">{runtimeState.sessionId?.slice(0, 12) || '-'}</p>
                </div>
                <div>
                  <span className="text-gray-500">마지막 상태</span>
                  <p>{runtimeState.lastRunStatus || '-'}</p>
                </div>
                <div>
                  <span className="text-gray-500">총 Input 토큰</span>
                  <p>{runtimeState.totalInputTokens.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-gray-500">총 Output 토큰</span>
                  <p>{runtimeState.totalOutputTokens.toLocaleString()}</p>
                </div>
              </div>
              {runtimeState.lastError && (
                <div className="mt-2 p-2 bg-red-50 rounded text-red-700 text-xs">
                  {runtimeState.lastError}
                </div>
              )}
            </div>
          )}

          {/* Run History */}
          <div>
            <h4 className="font-medium text-gray-700 mb-2">실행 이력</h4>
            {!runs || runs.length === 0 ? (
              <p className="text-sm text-gray-400">실행 이력 없음</p>
            ) : (
              <div className="space-y-1">
                {runs.map(run => {
                  const cfg = RUN_STATUS_CONFIG[run.status] || RUN_STATUS_CONFIG.failed;
                  return (
                    <div key={run.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-gray-50 last:border-0">
                      <span className={cn('w-16', cfg.color)}>{cfg.label}</span>
                      <span className="text-gray-500">{run.invocationSource}</span>
                      <span className="text-gray-400 text-xs">
                        {run.startedAt ? new Date(run.startedAt).toLocaleString('ko-KR') : '-'}
                      </span>
                      {run.finishedAt && run.startedAt && (
                        <span className="text-gray-400 text-xs">
                          ({Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}초)
                        </span>
                      )}
                      {run.error && (
                        <span className="text-red-400 text-xs truncate max-w-40" title={run.error}>
                          {run.error}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {agent.pauseReason && (
            <div className="flex items-center gap-2 text-sm text-yellow-700 bg-yellow-50 rounded-md p-2">
              <AlertTriangle className="w-4 h-4" />
              일시정지 사유: {agent.pauseReason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

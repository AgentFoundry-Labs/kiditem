'use client';

import Link from 'next/link';
import { Play, Pause, MoreHorizontal, RotateCcw, Copy, Loader2, Plus, ChevronRight } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ROLE_LABELS } from '../../lib/agent-types';
import type { Agent } from '../../lib/agent-types';

interface AgentDetailHeaderProps {
  agent: Agent;
  tabLabel: string;
  actionLoading: string | null;
  onAction: (action: string) => void;
  moreOpen: boolean;
  setMoreOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function AgentDetailHeader({
  agent,
  tabLabel,
  actionLoading,
  onAction,
  moreOpen,
  setMoreOpen,
}: AgentDetailHeaderProps) {
  return (
    <>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-slate-500 mb-5">
        <Link href="/agents" className="hover:text-slate-900 transition-colors">에이전트</Link>
        <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
        <span className="text-slate-900 font-medium">{agent.name}</span>
        <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
        <span className="text-slate-500">{tabLabel}</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-xl font-semibold text-slate-600">
            {agent.icon ?? agent.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="page-title truncate">{agent.name}</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {ROLE_LABELS[agent.role] ?? agent.role}
              {agent.title ? ` · ${agent.title}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-slate-700">
            <Plus className="w-3.5 h-3.5" />
            <span>태스크 할당</span>
          </button>

          <button
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
            onClick={() => onAction('run')}
            disabled={actionLoading === 'run'}
          >
            {actionLoading === 'run' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">하트비트 실행</span>
          </button>

          {agent.status === 'paused' ? (
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
              onClick={() => onAction('resume')}
              disabled={actionLoading === 'resume'}
            >
              <Play className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">재개</span>
            </button>
          ) : (
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
              onClick={() => onAction('pause')}
              disabled={actionLoading === 'pause'}
            >
              <Pause className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">일시정지</span>
            </button>
          )}

          <StatusBadge status={agent.status} className="hidden sm:inline-flex" />

          <div className="relative">
            <button
              className="p-1.5 text-slate-400 hover:text-slate-700 border border-slate-200 rounded-lg transition-colors"
              onClick={() => setMoreOpen((o) => !o)}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-white border border-slate-200 rounded-lg shadow-lg p-1">
                  <button
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-left rounded-md hover:bg-slate-50 transition-colors"
                    onClick={() => { navigator.clipboard.writeText(agent.id); setMoreOpen(false); }}
                  >
                    <Copy className="w-3 h-3" /> 에이전트 ID 복사
                  </button>
                  <button
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-left rounded-md hover:bg-slate-50 transition-colors"
                    onClick={() => { onAction('reset-session'); setMoreOpen(false); }}
                  >
                    <RotateCcw className="w-3 h-3" /> 세션 리셋
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

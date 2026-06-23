'use client';

import { ChevronRight, Minus, Search, Users, Wrench } from 'lucide-react';
import AgentFace from '@/components/AgentFace';
import { cn } from '@/lib/utils';
import { findAgentTeam } from '../lib/agent-os-helpers';
import { CATEGORY_FACE, type OrgNode, type TeamStyle } from '../lib/agent-os-types';

interface Props {
  agents: OrgNode[];
  tools: OrgNode[];
  teams: OrgNode[];
  teamStyle: Record<string, TeamStyle>;
  selectedAgent: string | null;
  minimized: boolean;
  onToggleMinimize: () => void;
  onSelect: (id: string) => void;
}

export function AgentsListPanel({
  agents, tools, teams, teamStyle, selectedAgent, minimized, onToggleMinimize, onSelect,
}: Props) {
  if (minimized) {
    return (
      <button
        onClick={onToggleMinimize}
        className="absolute left-4 top-4 z-20 flex h-[200px] w-11 flex-col items-center justify-between rounded-2xl border border-white/10 bg-[#0f1628]/95 py-3 shadow-xl shadow-black/40 backdrop-blur-xl transition-colors hover:bg-[#0f1628] max-md:left-3 max-md:top-3 group"
        title="Agents 펼치기"
      >
        <Users size={14} className="text-slate-400 group-hover:text-white transition-colors" />
        <span className="text-[11px] font-bold text-slate-300 tracking-widest" style={{ writingMode: 'vertical-rl' }}>AGENTS · {agents.length}</span>
        <ChevronRight size={14} className="text-slate-500 group-hover:text-white transition-colors" />
      </button>
    );
  }

  return (
    <div className="absolute left-4 top-4 z-20 flex max-h-[calc(100%-32px)] w-[300px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0f1628]/95 shadow-xl shadow-black/40 backdrop-blur-xl max-md:left-3 max-md:right-3 max-md:top-3 max-md:max-h-[calc(100%-24px)] max-md:w-auto">
      <div className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-white/5">
        <div>
          <div className="text-[14px] font-bold">Agents</div>
          <div className="text-[10px] text-slate-600">{tools.length} tools available</div>
        </div>
        <div className="flex items-center gap-1">
          <button className="w-7 h-7 rounded-lg hover:bg-white/[0.04] flex items-center justify-center text-slate-500"><Search size={13} /></button>
          <button
            onClick={onToggleMinimize}
            className="w-7 h-7 rounded-lg hover:bg-white/[0.04] flex items-center justify-center text-slate-500 hover:text-white"
            title="최소화"
          >
            <Minus size={13} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {agents.map(agent => {
          const team = findAgentTeam(teams, agent.id);
          const style = teamStyle[team?.category ?? ''];
          const isRunning = agent.status === 'running';
          const isSelected = selectedAgent === agent.id;
          const statusLabel = isRunning ? 'Running' : agent.lastHeartbeatAt ? 'Idle' : 'Offline';
          const subtitle = agent.runtimeKind === 'coordinator' ? 'Coordinator' : style?.label ?? agent.role;
          return (
            <button key={agent.id} onClick={() => onSelect(agent.id)}
              className={cn('w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-colors',
                isSelected ? 'bg-white/[0.06]' : 'border-white/[0.06] bg-white/[0.015] hover:bg-white/[0.04]')}
              style={isSelected ? { borderColor: `${style?.color ?? '#64748b'}50`, boxShadow: `0 0 0 1px ${style?.color ?? '#64748b'}30` } : undefined}>
              <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0" style={{ background: `${style?.color ?? '#64748b'}12` }}>
                <AgentFace color={CATEGORY_FACE[team?.category ?? ''] ?? 'blue'} role={agent.role} size={44} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold truncate">{agent.name}</div>
                <div className="text-[10px] text-slate-500 truncate">{subtitle}</div>
              </div>
              <span className={cn('shrink-0 px-2 py-1 rounded-full text-[9px] font-semibold border',
                isRunning ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' :
                agent.lastHeartbeatAt ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                'bg-slate-500/10 text-slate-400 border-slate-500/15')}>
                {statusLabel}
              </span>
            </button>
          );
        })}
        {agents.length === 0 && (
          <div className="py-8 text-center text-slate-600 text-[11px]">에이전트 없음</div>
        )}
        {tools.length > 0 && (
          <div className="pt-3">
            <div className="px-1 pb-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-600">Tools</div>
            <div className="space-y-1">
              {tools.map(tool => {
                const team = findAgentTeam(teams, tool.id);
                const style = teamStyle[team?.category ?? ''];
                const isRunning = tool.status === 'running';
                const isSelected = selectedAgent === tool.id;
                return (
                  <button
                    key={tool.id}
                    onClick={() => onSelect(tool.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border text-left transition-colors',
                      isSelected ? 'bg-white/[0.06]' : 'border-white/[0.05] bg-black/10 hover:bg-white/[0.035]',
                    )}
                    style={isSelected ? { borderColor: `${style?.color ?? '#64748b'}45`, boxShadow: `0 0 0 1px ${style?.color ?? '#64748b'}25` } : undefined}
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${style?.color ?? '#64748b'}12` }}>
                      <Wrench size={13} style={{ color: style?.color ?? '#94a3b8' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-slate-300 truncate">{tool.name}</div>
                      <div className="text-[9px] text-slate-600 truncate">{style?.label ?? 'Tool wrapper'}</div>
                    </div>
                    <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-700')} />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

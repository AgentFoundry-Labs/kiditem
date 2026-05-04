'use client';

import { AlertTriangle, CheckCircle2, Layers, Loader2, Play, X } from 'lucide-react';
import type { ActionTask } from '@kiditem/shared/action-task';
import { cn } from '@/lib/utils';
import { PriorityDot } from './PriorityDot';
import type { TeamStyle } from '../lib/agent-os-types';

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

function isTaskDone(status: string): boolean {
  return status === 'done' || status === 'completed';
}

interface Props {
  open: boolean;
  onClose: () => void;
  actionTasks: ActionTask[];
  urgentCount: number;
  teamStyle: Record<string, TeamStyle>;
  allTeamTasks: Record<string, ActionTask[]>;
  executingId: string | undefined;
  onExecute: (id: string) => void;
}

export function ActionBoardOverlay({
  open, onClose, actionTasks, urgentCount, teamStyle, allTeamTasks, executingId, onExecute,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-5 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-6xl max-h-[75vh] rounded-2xl bg-[#0d1321] border border-white/10 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="shrink-0 px-5 py-3 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-2">
            <Layers size={15} className="text-cyan-400" />
            <span className="text-[14px] font-bold">Action Board</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-mono">{actionTasks.length}</span>
            {urgentCount > 0 && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-mono flex items-center gap-1">
                <AlertTriangle size={10} />{urgentCount}
              </span>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/[0.04] flex items-center justify-center text-slate-500"><X size={15} /></button>
        </div>
        <div className="flex-1 overflow-x-auto p-3">
          <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
            {Object.entries(teamStyle).map(([cat, style]) => {
              const tasks = allTeamTasks[cat] ?? [];
              if (tasks.length === 0) return null;
              const sorted = [...tasks].sort((a, b) =>
                (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));
              const TeamIcon = style.icon;
              return (
                <div key={cat} className="shrink-0" style={{ width: 260 }}>
                  <div className="flex items-center gap-2 mb-2.5 px-1">
                    <TeamIcon size={13} style={{ color: style.color }} />
                    <span className="text-[12px] font-bold" style={{ color: style.color }}>{style.label}</span>
                    <span className="text-[11px] text-slate-700 font-mono">{tasks.length}</span>
                  </div>
                  <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
                    {sorted.map(task => {
                      const isAi = task.type === 'ai';
                      const isExec = executingId === task.id;
                      const done = isTaskDone(task.status);
                      return (
                        <div key={task.id} className={cn('rounded-lg border border-white/5 p-2.5', done ? 'opacity-40' : 'bg-white/[0.02] hover:bg-white/[0.04]')}>
                          <div className="flex items-start gap-2">
                            <PriorityDot priority={task.priority} />
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] text-slate-300 leading-relaxed line-clamp-2">{task.label}</p>
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', isAi ? 'bg-cyan-500/10 text-cyan-500' : 'bg-amber-500/10 text-amber-500')}>
                                  {isAi ? 'AI' : '수동'}
                                </span>
                              </div>
                            </div>
                            {isAi && !done && (
                              <button onClick={() => onExecute(task.id)} disabled={isExec}
                                className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-all hover:scale-110 disabled:opacity-30"
                                style={{ background: `${style.color}15`, color: style.color }}>
                                {isExec ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {Object.values(allTeamTasks).every(t => t.length === 0) && (
              <div className="flex items-center justify-center w-full py-6 text-slate-700">
                <CheckCircle2 size={16} className="mr-2 opacity-40" />
                <span className="text-[11px]">모든 액션 완료</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

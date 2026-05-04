'use client';

import {
  CheckCircle2, ChevronLeft, Circle, Loader2, Minus, Radio, X, XCircle,
} from 'lucide-react';
import type { PanelItem } from '@kiditem/shared/panel';
import { cn, timeAgo } from '@/lib/utils';

const STATUS_COLOR: Record<string, string> = {
  running: '#34d399', pending: '#fbbf24', succeeded: '#22d3ee', failed: '#f87171', cancelled: '#64748b',
};
const STATUS_ICON: Record<string, typeof Loader2> = {
  running: Loader2, pending: Circle, succeeded: CheckCircle2, failed: XCircle, cancelled: X,
};

interface RecentLog {
  taskId: string;
  taskLabel: string;
  role: string | null;
  action: string;
  timestamp: string;
  detail?: string;
  success?: boolean;
}

interface Props {
  panelItems: (PanelItem & { kind: 'run' })[];
  recentLogs: RecentLog[];
  connectionStatus: string;
  minimized: boolean;
  onToggleMinimize: () => void;
}

export function LiveActivityPanel({
  panelItems, recentLogs, connectionStatus, minimized, onToggleMinimize,
}: Props) {
  if (minimized) {
    return (
      <button
        onClick={onToggleMinimize}
        className="absolute top-4 right-4 w-11 h-[220px] bg-[#0f1628]/95 backdrop-blur-xl border border-white/10 rounded-2xl flex flex-col items-center justify-between py-3 z-20 shadow-xl shadow-black/40 hover:bg-[#0f1628] transition-colors group"
        title="Live Activity 펼치기"
      >
        <div className="relative">
          <Radio size={14} className={cn(connectionStatus === 'connected' ? 'text-emerald-400' : 'text-slate-400', 'group-hover:scale-110 transition-transform')} />
          {connectionStatus === 'connected' && panelItems.some(i => i.status === 'running') && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </div>
        <span className="text-[11px] font-bold text-slate-300 tracking-widest" style={{ writingMode: 'vertical-rl' }}>LIVE · {panelItems.length}</span>
        <ChevronLeft size={14} className="text-slate-500 group-hover:text-white transition-colors" />
      </button>
    );
  }

  return (
    <div className="absolute top-4 right-4 w-[320px] max-h-[calc(100%-32px)] bg-[#0f1628]/95 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden flex flex-col z-20 shadow-xl shadow-black/40">
      <div className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2">
          <Radio size={13} className={cn(connectionStatus === 'connected' ? 'text-emerald-400' : 'text-slate-500')} />
          <span className="text-[14px] font-bold">Live Activity</span>
          <span className={cn('px-1.5 py-0.5 rounded-md text-[9px] font-semibold',
            connectionStatus === 'connected' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/15 text-slate-500')}>
            {connectionStatus === 'connected' ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
        <button
          onClick={onToggleMinimize}
          className="w-7 h-7 rounded-lg hover:bg-white/[0.04] flex items-center justify-center text-slate-500 hover:text-white"
          title="최소화"
        >
          <Minus size={13} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {panelItems.length > 0 && (
          <div className="px-3 pt-3 pb-2">
            <div className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-1.5 px-1">실행 중</div>
            <div className="space-y-1.5">
              {panelItems.slice(0, 6).map(item => {
                const color = STATUS_COLOR[item.status] ?? '#64748b';
                const StatusIcon = STATUS_ICON[item.status] ?? Circle;
                const isActive = item.status === 'running' || item.status === 'pending';
                return (
                  <div key={item.id} className={cn('rounded-lg border p-2',
                    isActive ? 'border-emerald-500/20 bg-emerald-500/[0.04]' : 'border-white/5 bg-white/[0.015]')}>
                    <div className="flex items-start gap-2">
                      <StatusIcon size={12} className={cn('shrink-0 mt-0.5', item.status === 'running' && 'animate-spin')} style={{ color }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium text-slate-200 truncate">{item.title}</div>
                        {item.subtitle && <div className="text-[9px] text-slate-600 truncate mt-0.5">{item.subtitle}</div>}
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[8px] font-semibold px-1 py-px rounded-sm uppercase" style={{ background: `${color}15`, color }}>{item.status}</span>
                          <span className="text-[9px] text-slate-700">{timeAgo(item.updatedAt)}</span>
                          {item.status === 'running' && item.progress != null && (
                            <div className="flex-1 h-0.5 bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${item.progress * 100}%` }} />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="px-3 pt-3 pb-3">
          <div className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-1.5 px-1 flex items-center justify-between">
            <span>최근 활동</span>
            <span className="text-slate-700 font-mono">{recentLogs.length}</span>
          </div>
          {recentLogs.length > 0 ? (
            <div className="space-y-0.5">
              {recentLogs.map((log, i) => {
                const ok = log.success === true;
                const fail = log.success === false;
                return (
                  <div key={`${log.taskId}-${i}`} className="relative pl-5 py-1.5 border-l border-white/5 ml-1">
                    <span className={cn('absolute -left-[4px] top-2 w-[7px] h-[7px] rounded-full border-2 border-[#0f1628]',
                      ok ? 'bg-emerald-400' : fail ? 'bg-red-400' : 'bg-slate-500')} />
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={cn('text-[10px] font-semibold truncate',
                        ok ? 'text-emerald-400' : fail ? 'text-red-400' : 'text-slate-300')}>
                        {log.action}
                      </span>
                      <span className="text-[9px] text-slate-700 shrink-0 ml-auto">{timeAgo(log.timestamp)}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">{log.taskLabel}</div>
                    {log.detail && <div className="text-[9px] text-slate-600 truncate mt-0.5">{log.detail}</div>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-slate-700 flex flex-col items-center gap-2">
              <Radio size={20} className="opacity-30" />
              <p className="text-[10px]">활동 기록 없음</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export type { RecentLog };

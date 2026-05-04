'use client';

import {
  BarChart3, CheckCircle2, Circle, DollarSign, Loader2, Maximize2, Megaphone,
  MoreHorizontal, Radio, TrendingUp, X, XCircle,
} from 'lucide-react';
import type { DashboardAdSummary, DashboardSalesSummary } from '@kiditem/shared/dashboard';
import type { PanelItem } from '@kiditem/shared/panel';
import { cn, formatNumber, timeAgo } from '@/lib/utils';
import { compactKRW } from '../lib/agent-os-helpers';

const STATUS_COLOR: Record<string, string> = {
  running: '#34d399', pending: '#fbbf24', succeeded: '#22d3ee', failed: '#f87171', cancelled: '#64748b',
};
const STATUS_ICON: Record<string, typeof Loader2> = {
  running: Loader2, pending: Circle, succeeded: CheckCircle2, failed: XCircle, cancelled: X,
};

interface Props {
  totalAgents: number;
  runningCount: number;
  idleCount: number;
  offlineCount: number;
  salesData: DashboardSalesSummary | undefined;
  adData: DashboardAdSummary | undefined;
  panelItems: (PanelItem & { kind: 'run' })[];
  panelConnection: string;
}

export function AgentOsBottomDashboard({
  totalAgents, runningCount, idleCount, offlineCount,
  salesData, adData, panelItems, panelConnection,
}: Props) {
  const sm = salesData?.monthly;
  const am = adData?.monthly;

  return (
    <div className="shrink-0 grid grid-cols-12 grid-rows-2 gap-3 px-5 py-4 h-[240px]">
      <div className="col-span-3 row-span-2 rounded-2xl bg-[#0d1321] border border-white/10 p-4 flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[13px] font-bold text-slate-300">Agents Summary</span>
          <span className="text-[10px] text-slate-600">Last sync · now</span>
        </div>
        <div className="text-[30px] font-bold leading-tight">{formatNumber(totalAgents)}</div>
        <div className="text-[11px] text-slate-600 mb-3">Total Agents</div>
        <div className="flex items-center gap-3 text-[10px] text-slate-500 mb-1.5">
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />Running</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />Idle</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-600" />Offline</div>
        </div>
        <div className="flex h-2 rounded-full overflow-hidden bg-white/5 mb-3">
          {totalAgents > 0 && (
            <>
              <div className="h-full bg-emerald-400" style={{ width: `${(runningCount / totalAgents) * 100}%` }} />
              <div className="h-full bg-amber-400" style={{ width: `${(idleCount / totalAgents) * 100}%` }} />
              <div className="h-full bg-slate-600" style={{ width: `${(offlineCount / totalAgents) * 100}%` }} />
            </>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center mt-auto">
          <div><div className="text-[15px] font-bold text-emerald-400">{runningCount}</div><div className="text-[9px] text-slate-600">Running</div></div>
          <div><div className="text-[15px] font-bold text-amber-400">{idleCount}</div><div className="text-[9px] text-slate-600">Idle</div></div>
          <div><div className="text-[15px] font-bold text-slate-500">{offlineCount}</div><div className="text-[9px] text-slate-600">Offline</div></div>
        </div>
      </div>

      <div className="col-span-2 rounded-2xl bg-[#0d1321] border border-white/10 p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <DollarSign size={13} className="text-cyan-400" />
            <span className="text-[11px] text-slate-500">월 매출</span>
          </div>
          <MoreHorizontal size={12} className="text-slate-700" />
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="text-[20px] font-bold leading-tight truncate">{sm ? compactKRW(sm.revenue) : '—'}</div>
          {sm && (
            <span className={cn('shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold',
              sm.revenueChange >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400')}>
              {sm.revenueChange >= 0 ? '+' : ''}{sm.revenueChange.toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      <div className="col-span-2 rounded-2xl bg-[#0d1321] border border-white/10 p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <BarChart3 size={13} className="text-emerald-400" />
            <span className="text-[11px] text-slate-500">영업이익</span>
          </div>
          <MoreHorizontal size={12} className="text-slate-700" />
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="text-[20px] font-bold leading-tight truncate">{sm ? compactKRW(sm.profit) : '—'}</div>
          {sm && (
            <span className={cn('shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold',
              sm.profitChange >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400')}>
              {sm.profitChange >= 0 ? 'Optimal' : 'Down'}
            </span>
          )}
        </div>
      </div>

      <div className="col-span-5 row-span-2 rounded-2xl bg-[#0d1321] border border-white/10 p-4 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-slate-300">Overview Panel</span>
            <span className={cn('px-2 py-0.5 rounded-md text-[9px] font-semibold',
              panelConnection === 'connected' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/15 text-slate-500')}>
              {panelConnection === 'connected' ? 'Live' : 'Offline'}
            </span>
          </div>
          <button className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-slate-500"><Maximize2 size={12} /></button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {panelItems.length > 0 ? panelItems.map(item => {
            const color = STATUS_COLOR[item.status] ?? '#64748b';
            const StatusIcon = STATUS_ICON[item.status] ?? Circle;
            const isActive = item.status === 'running' || item.status === 'pending';
            return (
              <div key={item.id} className={cn('rounded-lg border p-2.5',
                isActive ? 'border-emerald-500/15 bg-emerald-500/[0.03]' : 'border-white/5 bg-white/[0.01]')}>
                <div className="flex items-start gap-2.5">
                  <StatusIcon size={14} className={cn('shrink-0 mt-0.5', item.status === 'running' && 'animate-spin')} style={{ color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-slate-300 truncate">{item.title}</div>
                    {item.subtitle && <div className="text-[10px] text-slate-600 truncate mt-0.5">{item.subtitle}</div>}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-sm" style={{ background: `${color}15`, color }}>{item.status}</span>
                      <span className="text-[9px] text-slate-700">{timeAgo(item.updatedAt)}</span>
                      {item.status === 'running' && item.progress != null && (
                        <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-400" style={{ width: `${item.progress * 100}%` }} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          }) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-700 gap-2 py-6">
              <Radio size={22} className="opacity-30" />
              <p className="text-[11px]">실시간 작업 대기 중</p>
              <p className="text-[10px] text-slate-800">에이전트/워크플로우 실행 시 표시</p>
            </div>
          )}
        </div>
      </div>

      <div className="col-span-2 col-start-4 rounded-2xl bg-[#0d1321] border border-white/10 p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <TrendingUp size={13} className="text-amber-400" />
            <span className="text-[11px] text-slate-500">ROAS</span>
          </div>
          <MoreHorizontal size={12} className="text-slate-700" />
        </div>
        <div>
          <div className="text-[20px] font-bold leading-tight">{am ? `${am.roas.toFixed(0)}%` : '—'}</div>
          <div className="text-[9px] text-slate-600 truncate">광고비 {am ? compactKRW(am.totalAdSpend) : '—'}</div>
        </div>
      </div>

      <div className="col-span-2 rounded-2xl bg-[#0d1321] border border-white/10 p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Megaphone size={13} className="text-violet-400" />
            <span className="text-[11px] text-slate-500">CTR</span>
          </div>
          <MoreHorizontal size={12} className="text-slate-700" />
        </div>
        <div>
          <div className="text-[20px] font-bold leading-tight">{am ? `${am.ctr.toFixed(2)}%` : '—'}</div>
          <div className="text-[9px] text-slate-600 truncate">광고 비중 {sm ? `${sm.adRate.toFixed(1)}%` : '—'}</div>
        </div>
      </div>
    </div>
  );
}

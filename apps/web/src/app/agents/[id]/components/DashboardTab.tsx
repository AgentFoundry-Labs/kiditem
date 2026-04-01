'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Cpu,
  DollarSign,
  Activity,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { relativeTime, formatTokens, formatCost, formatDuration } from '../../lib/agent-utils';
import { SOURCE_LABELS } from '../../lib/agent-types';
import type { Agent, HeartbeatRun, AgentRuntimeState } from '../../lib/agent-types';
import { RUN_STATUS_ICONS, SOURCE_BADGE_COLORS } from '../lib/constants';

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

export function DashboardTab({
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

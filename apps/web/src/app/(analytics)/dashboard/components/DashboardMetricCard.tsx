import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { cn, formatKRW } from '@/lib/utils';
import { type DashboardMetricBasis } from './DashboardDataBasis';
import type { LucideIcon } from 'lucide-react';

export function MetricCard({
  label,
  value,
  unit,
  change,
  prevLabel,
  accentColor,
  icon: Icon,
  invertColor,
  goal,
  current,
  goalUnit,
  goalLabel,
  invertGoal,
  onClick,
  basis,
  comparisonBasis,
}: {
  label: string;
  value: string;
  unit: string;
  change: number | null;
  prevLabel: string;
  accentColor: string;
  icon: LucideIcon;
  invertColor?: boolean;
  goal?: number;
  current?: number;
  goalUnit?: string;
  goalLabel?: string;
  invertGoal?: boolean;
  onClick?: () => void;
  basis?: DashboardMetricBasis | null;
  comparisonBasis?: DashboardMetricBasis | null;
}) {
  const isUnavailable = change === null;
  const isPositive = !isUnavailable && (invertColor ? change < 0 : change > 0);
  const isNeutral = !isUnavailable && Math.abs(change) < 0.5;
  const ChangeIcon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;
  const changeColorStyle = isNeutral ? '#94a3b8' : isPositive ? '#059669' : '#ef4444';
  const changeBgStyle = isNeutral ? 'rgba(148,163,184,0.1)' : isPositive ? 'rgba(5,150,105,0.1)' : 'rgba(239,68,68,0.1)';

  const hasGoal = goal !== undefined && current !== undefined && goal > 0;
  const isPercent = goalUnit === '%';

  let achievementRate = 0;
  let progressPct = 0;
  let goalMet = false;

  if (hasGoal) {
    if (invertGoal) {
      goalMet = current <= goal;
      const maxBad = goal * 2;
      progressPct = Math.max(0, Math.min(100, ((maxBad - current) / (maxBad - goal)) * 100));
      achievementRate = goalMet ? 100 : Math.round(progressPct);
    } else {
      achievementRate = Math.min(Math.round((current / goal) * 100), 999);
      progressPct = Math.min((current / goal) * 100, 100);
      goalMet = achievementRate >= 100;
    }
  }

  const displayGoalLabel = goalLabel || (isPercent ? `목표 ${goal}%` : `목표 ${formatKRW(goal!)}원`);
  const remaining = hasGoal && !goalMet
    ? invertGoal
      ? `${(current! - goal!).toFixed(1)}%p 초과`
      : isPercent
        ? `${(goal! - current!).toFixed(1)}%p 남음`
        : `${formatKRW(goal! - current!)}원 남음`
    : null;

  return (
    <div className={cn('h-full bg-white transition-colors hover:bg-slate-50', onClick && 'cursor-pointer')} data-testid="dashboard-metric-card" onClick={onClick}>
      <div className="flex h-full flex-col px-3 py-2">
        {/* Six cells on one row are one row of one measurement each. An icon
            and an accent colour per cell made each look like its own object
            and left less room for the number, which is the point of the cell. */}
        <div>
          <p className="font-mono text-[9.5px] uppercase tracking-wider text-slate-500">{label}</p>
          <p className="flex items-baseline gap-0.5 text-xl font-bold leading-tight tracking-tight tabular-nums text-slate-900">
            {value}
            <span className="text-xs font-semibold text-slate-500">{unit}</span>
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
            {!isUnavailable && !isNeutral && (
              <span className={cn('mr-1 font-medium', change >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                {change > 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
              </span>
            )}
            {prevLabel}
          </p>
        </div>
        {hasGoal && (
          <div className="mt-auto pt-2" style={{ borderTop: `1px solid ${accentColor}20` }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium" style={{ color: `${accentColor}99` }}>{displayGoalLabel}</span>
              <span className="text-[12px] font-bold tabular-nums" style={{ color: accentColor }}>
                {invertGoal ? (goalMet ? '달성' : `${current}%`) : `${achievementRate}%`}
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: `${accentColor}15` }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progressPct}%`, background: accentColor }} />
            </div>
            {!goalMet && remaining && <div className="text-[10px] mt-0.5" style={{ color: `${accentColor}88` }}>{remaining}</div>}
            {goalMet && <div className="text-[10px] mt-0.5 font-semibold" style={{ color: accentColor }}>목표 달성!</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export function UnavailableMetricCard({
  label,
  icon: Icon,
  accentColor,
  note,
  basis,
  comparisonBasis,
}: {
  label: string;
  icon: LucideIcon;
  accentColor: string;
  note: string;
  basis?: DashboardMetricBasis | null;
  comparisonBasis?: DashboardMetricBasis | null;
}) {
  return (
    <div className="h-full bg-white" data-testid="dashboard-metric-card">
      <div className="flex h-full flex-col px-3 py-2">
        <div>
          <p className="font-mono text-[9.5px] uppercase tracking-wider text-slate-500">{label}</p>
          {/* The value slot stays a dash; the fixed vocabulary belongs to the
              reason under it, which is what the operator acts on. */}
          <p className="text-xl font-medium leading-tight tracking-tight tabular-nums text-slate-400">—</p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{note}</p>
        </div>
      </div>
    </div>
  );
}

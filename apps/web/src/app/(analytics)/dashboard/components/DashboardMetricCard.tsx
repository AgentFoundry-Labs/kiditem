import type { LucideIcon } from 'lucide-react';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { cn, formatKRW } from '@/lib/utils';

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
}: {
  label: string;
  value: string;
  unit: string;
  change: number;
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
}) {
  const isPositive = invertColor ? change < 0 : change > 0;
  const isNeutral = Math.abs(change) < 0.5;
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
    <div className={cn('rounded-2xl transition-all hover:shadow-md h-full bg-white border border-slate-100 shadow-sm', onClick && 'cursor-pointer')} onClick={onClick}>
      <div className="px-4 py-3 h-full flex flex-col">
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Icon size={16} style={{ color: accentColor }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accentColor }}>{label}</span>
            </div>
            <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-mono" style={{ background: changeBgStyle, color: changeColorStyle }}>
              <ChangeIcon size={12} />
              {!isNeutral && <span>{change > 0 ? '+' : ''}{change.toFixed(1)}%</span>}
              {isNeutral && <span>-</span>}
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg sm:text-2xl font-extrabold tabular-nums tracking-tight" style={{ color: accentColor }}>{value}</span>
            <span className="text-base font-semibold" style={{ color: accentColor, opacity: 0.6 }}>{unit}</span>
          </div>
          {prevLabel && <div className="text-xs mt-0.5 text-slate-500">{prevLabel}</div>}
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
}: {
  label: string;
  icon: LucideIcon;
  accentColor: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl transition-all h-full bg-white border border-slate-100 shadow-sm">
      <div className="px-4 py-3 h-full flex flex-col">
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Icon size={16} style={{ color: accentColor, opacity: 0.5 }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accentColor, opacity: 0.6 }}>{label}</span>
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg sm:text-2xl font-extrabold tabular-nums tracking-tight text-slate-300">—</span>
          </div>
          <div className="text-xs mt-1 text-slate-400">{note}</div>
        </div>
      </div>
    </div>
  );
}

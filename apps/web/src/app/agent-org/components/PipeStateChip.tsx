import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDot,
  Clock,
  HelpCircle,
  Lock,
  Minus,
  PieChart,
  RotateCw,
  User,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import { PIPE_STATE_LABEL, type PipeState } from '../lib/pipe-states';

/**
 * 상태 한 칸 — 아이콘 + 글 + 선 모양. 색만으로 말하지 않는다.
 *
 * 움직이는 건 '진행 중' 하나다. 전부 반짝이면 새로 생긴 문제가 보이지 않는다.
 * 재시도 중 · 모름은 점선으로, 해당 없음 · 반려는 채움 없이 흐리게 둔다.
 */
const STYLE: Readonly<Record<PipeState, { icon: LucideIcon; tone: string }>> = {
  running: { icon: CircleDot, tone: 'text-blue-400 border-blue-400/40 bg-blue-400/10' },
  queued: { icon: Clock, tone: 'text-slate-300 border-slate-400/40 bg-slate-400/10' },
  done: { icon: CheckCircle2, tone: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10' },
  partial: { icon: PieChart, tone: 'text-teal-300 border-teal-300/40 bg-teal-300/10' },
  retrying: { icon: RotateCw, tone: 'text-orange-400 border-orange-400/50 border-dashed bg-orange-400/10' },
  failed: { icon: XCircle, tone: 'text-red-400 border-red-400/45 bg-red-400/10' },
  waiting_human: { icon: User, tone: 'text-violet-400 border-violet-400/45 bg-violet-400/10' },
  blocked_external: { icon: Lock, tone: 'text-amber-400 border-amber-400/45 bg-amber-400/10' },
  stale: { icon: AlertTriangle, tone: 'text-yellow-600 border-yellow-600/45 bg-yellow-600/10' },
  unknown: { icon: HelpCircle, tone: 'text-slate-400 border-slate-500/50 border-dashed' },
  skipped: { icon: Minus, tone: 'text-slate-500 border-slate-600/50' },
  rejected: { icon: Ban, tone: 'text-rose-300 border-rose-300/40 line-through decoration-rose-300/60' },
};

export function PipeStateChip({
  state,
  label,
  count,
  className,
}: {
  state: PipeState;
  /** 상태 이름 대신 쓸 말. 없으면 상태 이름을 쓴다. */
  label?: string;
  count?: number;
  className?: string;
}) {
  const { icon: Icon, tone } = STYLE[state];
  return (
    <span
      className={cn(
        'inline-flex h-5 max-w-full items-center gap-1 whitespace-nowrap rounded-md border px-1.5 text-[11px] font-medium leading-none',
        tone,
        className,
      )}
    >
      <Icon size={11} className={cn('shrink-0', state === 'running' && 'motion-safe:animate-pulse')} aria-hidden />
      <span className="truncate">{label ?? PIPE_STATE_LABEL[state]}</span>
      {count !== undefined ? <span className="tabular-nums">{formatNumber(count)}</span> : null}
    </span>
  );
}

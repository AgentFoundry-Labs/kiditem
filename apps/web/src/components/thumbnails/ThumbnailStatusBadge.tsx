import { Loader2, Sparkles, CheckCircle, SkipForward, AlertCircle, Clock } from 'lucide-react';
import type { ThumbnailGenerationItem } from '@kiditem/shared/ai';
import { isReady, isApplied } from '@/lib/thumbnail-status';

type Props = { status: ThumbnailGenerationItem['status'] | string; phase?: string | null };

export function ThumbnailStatusBadge({ status, phase }: Props) {
  const config = deriveBadgeConfig(status, phase);
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${config.color}`}>
      <Icon size={10} className={status === 'running' ? 'animate-spin' : ''} /> {config.label}
    </span>
  );
}

function deriveBadgeConfig(status: string, phase?: string | null) {
  const sp = { status: status as ThumbnailGenerationItem['status'], phase: phase as 'ready' | 'applied' | null | undefined };
  if (status === 'running') {
    return { label: '생성중', color: 'bg-blue-100 text-blue-700', icon: Loader2 };
  }
  if (status === 'pending') {
    return { label: '대기', color: 'bg-slate-100 text-slate-600', icon: Clock };
  }
  if (isReady(sp)) {
    return { label: '후보 선택', color: 'bg-amber-100 text-amber-700', icon: Sparkles };
  }
  if (isApplied(sp)) {
    return { label: '적용 완료', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle };
  }
  if (status === 'cancelled') {
    return { label: '건너뜀', color: 'bg-slate-100 text-slate-500', icon: SkipForward };
  }
  if (status === 'failed') {
    return { label: '실패', color: 'bg-red-100 text-red-700', icon: AlertCircle };
  }
  return { label: status, color: 'bg-slate-100 text-slate-600', icon: Clock };
}

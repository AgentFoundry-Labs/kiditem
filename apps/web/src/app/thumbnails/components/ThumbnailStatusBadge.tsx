'use client';
import { Clock, Loader2, Sparkles, CheckCircle, SkipForward, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThumbnailStatusBadgeProps {
  status: string;
}

export function ThumbnailStatusBadge({ status }: ThumbnailStatusBadgeProps) {
  const config: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    pending: { label: '대기중', color: 'bg-slate-100 text-slate-600', icon: Clock },
    generating: { label: '생성중', color: 'bg-blue-100 text-blue-700', icon: Loader2 },
    ready: { label: '후보 선택', color: 'bg-amber-100 text-amber-700', icon: Sparkles },
    applied: { label: '적용 완료', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
    skipped: { label: '건너뜀', color: 'bg-slate-100 text-slate-500', icon: SkipForward },
    failed: { label: '생성 실패', color: 'bg-red-100 text-red-700', icon: XCircle },
  };
  const c = config[status] || config.pending;
  const Icon = c.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium', c.color)}>
      <Icon size={10} className={status === 'generating' ? 'animate-spin' : ''} /> {c.label}
    </span>
  );
}

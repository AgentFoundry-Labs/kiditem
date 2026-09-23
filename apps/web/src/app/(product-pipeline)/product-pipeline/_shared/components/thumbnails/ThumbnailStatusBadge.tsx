import { Loader2, Sparkles, CheckCircle, SkipForward, AlertCircle, Clock } from 'lucide-react';
import type { ThumbnailJobView } from '../../hooks/useThumbnailJobs';
import { isThumbnailJobAdopted, isThumbnailJobAwaitingAdoption } from '../../lib/thumbnail-status';

type Props = { job: Pick<ThumbnailJobView, 'status' | 'candidates' | 'adoptedCandidate'> };

/** job 한 줄의 상태. 결과가 나오면 채택 전(후보 선택)과 채택됨으로 나눈다. */
export function ThumbnailStatusBadge({ job }: Props) {
  const config = deriveBadgeConfig(job);
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${config.color}`}>
      <Icon size={10} className={job.status === 'running' ? 'animate-spin' : ''} /> {config.label}
    </span>
  );
}

function deriveBadgeConfig(job: Props['job']) {
  if (job.status === 'running') return { label: '생성중', color: 'bg-blue-100 text-blue-700', icon: Loader2 };
  if (job.status === 'pending') return { label: '대기', color: 'bg-slate-100 text-slate-600', icon: Clock };
  if (isThumbnailJobAdopted(job)) return { label: '채택됨', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle };
  if (isThumbnailJobAwaitingAdoption(job)) return { label: '후보 선택', color: 'bg-amber-100 text-amber-700', icon: Sparkles };
  if (job.status === 'cancelled') return { label: '건너뜀', color: 'bg-slate-100 text-slate-500', icon: SkipForward };
  if (job.status === 'failed') return { label: '실패', color: 'bg-red-100 text-red-700', icon: AlertCircle };
  return { label: job.status, color: 'bg-slate-100 text-slate-600', icon: Clock };
}

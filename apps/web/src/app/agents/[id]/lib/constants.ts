import { CheckCircle2, XCircle, Clock, Timer, Loader2, Slash } from 'lucide-react';

export const RUN_STATUS_ICONS: Record<string, { icon: typeof CheckCircle2; colorClass: string }> = {
  succeeded: { icon: CheckCircle2, colorClass: 'text-green-600' },
  failed: { icon: XCircle, colorClass: 'text-red-600' },
  running: { icon: Loader2, colorClass: 'text-cyan-600' },
  queued: { icon: Clock, colorClass: 'text-yellow-600' },
  cancelled: { icon: Slash, colorClass: 'text-gray-500' },
};

export const FAILURE_TYPE_ICONS: Record<string, { icon: typeof Timer; colorClass: string }> = {
  timeout: { icon: Timer, colorClass: 'text-orange-600' },
};

export const SOURCE_BADGE_COLORS: Record<string, string> = {
  timer: 'bg-blue-100 text-blue-700',
  assignment: 'bg-violet-100 text-violet-700',
  on_demand: 'bg-cyan-100 text-cyan-700',
  automation: 'bg-amber-100 text-amber-700',
};

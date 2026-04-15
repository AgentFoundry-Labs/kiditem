export const statusBadge: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  running: 'bg-blue-100 text-blue-700',
  paused: 'bg-orange-100 text-orange-700',
  idle: 'bg-gray-100 text-gray-600',
  error: 'bg-red-100 text-red-700',
  terminated: 'bg-red-100 text-red-700',
  queued: 'bg-violet-100 text-violet-700',
  succeeded: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
};
export const statusBadgeDefault = 'bg-gray-100 text-gray-600';

export const agentStatusDot: Record<string, string> = {
  running: 'bg-blue-400 animate-pulse',
  active: 'bg-green-400',
  paused: 'bg-orange-400',
  idle: 'bg-gray-400',
  error: 'bg-red-400',
  queued: 'bg-violet-400',
  succeeded: 'bg-green-400',
  failed: 'bg-red-400',
};
export const agentStatusDotDefault = 'bg-gray-400';

export function statusColor(status: string, failureType?: string | null): string {
  if (failureType === 'timeout') return 'bg-orange-100 text-orange-700';
  return statusBadge[status] ?? statusBadgeDefault;
}

export function agentStatusDotColor(status: string, failureType?: string | null): string {
  if (failureType === 'timeout') return 'bg-orange-400';
  return agentStatusDot[status] ?? agentStatusDotDefault;
}

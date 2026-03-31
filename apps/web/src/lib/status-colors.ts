'use client';

export const statusBadge: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  running: 'bg-cyan-100 text-cyan-700',
  paused: 'bg-orange-100 text-orange-700',
  idle: 'bg-yellow-100 text-yellow-700',
  error: 'bg-red-100 text-red-700',
  terminated: 'bg-red-100 text-red-700',
  queued: 'bg-yellow-100 text-yellow-700',
  succeeded: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  timed_out: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-gray-100 text-gray-600',
};
export const statusBadgeDefault = 'bg-gray-100 text-gray-600';

export const agentStatusDot: Record<string, string> = {
  running: 'bg-cyan-400 animate-pulse',
  active: 'bg-green-400',
  paused: 'bg-yellow-400',
  idle: 'bg-yellow-400',
  error: 'bg-red-400',
};
export const agentStatusDotDefault = 'bg-gray-400';

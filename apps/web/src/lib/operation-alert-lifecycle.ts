export interface BatchScrapeStatusLike {
  status?: 'idle' | 'running' | 'done' | 'error' | 'cancelled' | 'starting';
  current?: number;
  completed?: number;
  failed?: number;
  total?: number;
}

export type BatchScrapeTerminalStatus =
  | 'succeeded'
  | 'warning'
  | 'failed'
  | 'cancelled';

export interface BatchScrapeProgressSummary {
  ok: number;
  fail: number;
  total: number;
  progress: number | null;
}

export function summarizeBatchScrapeProgress(
  status: BatchScrapeStatusLike | null | undefined,
  fallbackTotal: number,
): BatchScrapeProgressSummary {
  const ok = Math.max(0, status?.completed ?? 0);
  const fail = Math.max(0, status?.failed ?? 0);
  const total = Math.max(0, status?.total ?? fallbackTotal);
  if (total === 0) {
    return { ok, fail, total, progress: null };
  }

  const currentInFlight = Math.max(0, (status?.current ?? 0) - 1);
  const observed = Math.max(ok + fail, currentInFlight);
  const progress = Math.max(0, Math.min(1, observed / total));
  return { ok, fail, total, progress };
}

export function classifyBatchScrapeStatus(
  status: BatchScrapeStatusLike | null | undefined,
): BatchScrapeTerminalStatus | null {
  if (status?.status === 'cancelled') return 'cancelled';
  if (status?.status === 'error') return 'failed';
  if (status?.status === 'done' || status?.status === 'idle') {
    return (status.failed ?? 0) > 0 ? 'warning' : 'succeeded';
  }
  return null;
}

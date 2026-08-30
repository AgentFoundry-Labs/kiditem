export type WholesaleCollectionUnit =
  | 'pending'
  | 'changed'
  | 'unchanged'
  | 'failed';

export interface WholesaleCollectionSummary {
  status: 'idle' | 'running' | 'failed' | 'partial' | 'no_change' | 'complete';
  total: number;
  finished: number;
  succeeded: number;
  failed: number;
  changed: number;
}

export function summarizeWholesaleCollection(
  started: boolean,
  units: readonly WholesaleCollectionUnit[],
): WholesaleCollectionSummary {
  let succeeded = 0;
  let failed = 0;
  let changed = 0;
  for (const unit of units) {
    if (unit === 'failed') {
      failed += 1;
    } else if (unit === 'changed' || unit === 'unchanged') {
      succeeded += 1;
      if (unit === 'changed') changed += 1;
    }
  }

  const total = units.length;
  const finished = succeeded + failed;
  let status: WholesaleCollectionSummary['status'] = 'idle';
  if (started && total > 0) {
    if (finished < total) status = 'running';
    else if (failed === total) status = 'failed';
    else if (failed > 0) status = 'partial';
    else if (changed === 0) status = 'no_change';
    else status = 'complete';
  }

  return { status, total, finished, succeeded, failed, changed };
}

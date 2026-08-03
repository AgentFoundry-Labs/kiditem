import type { PanelRunItem } from '@kiditem/shared/panel';
import type { OperationRunRecord } from '../../../application/port/out/repository/operation.repository.port';

const STATUS: Record<OperationRunRecord['status'], PanelRunItem['status']> = {
  queued: 'pending',
  // A browser worker claiming the run is implementation detail. The operator
  // has already started the task, so keep its visible state consistent with a
  // claimed browser run.
  waiting_runtime: 'running',
  waiting_dependency: 'running',
  running: 'running',
  attention_required: 'pending',
  succeeded: 'succeeded',
  failed: 'failed',
  cancelled: 'cancelled',
  skipped: 'cancelled',
};

function subtitle(run: OperationRunRecord): string {
  if (run.status === 'waiting_runtime') return '실행 중';
  if (run.status === 'waiting_dependency') return '하위 작업 실행 중';
  if (run.status === 'attention_required') return '확인 필요';
  if (run.status === 'queued') return '대기열';
  if (run.status === 'running') return '실행 중';
  if (run.status === 'succeeded') return '완료';
  return run.errorMessage ?? (run.status === 'cancelled' ? '취소됨' : '실패');
}

export function mapOperationRunToPanelItem(
  run: OperationRunRecord,
): Omit<PanelRunItem, 'seq' | 'updatedAt'> {
  return {
    id: `operation:${run.id}`,
    kind: 'run',
    source: 'operation',
    sourceId: run.id,
    status: STATUS[run.status],
    phase: run.status,
    title: run.title,
    subtitle: subtitle(run),
    progress: run.progress ?? undefined,
    deepLink: `/dashboard?tab=agent-os&operationRunId=${encodeURIComponent(run.id)}`,
    errorMessage: run.errorMessage ?? undefined,
    actorUserId: run.requestedBy?.id ?? null,
    visibility: 'organization',
    createdAt: run.createdAt.toISOString(),
  };
}

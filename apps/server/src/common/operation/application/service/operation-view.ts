import type { OperationView } from '@kiditem/shared/operation';
import type { OperationRecord } from '../port/out/repository/operation.repository.port';

/** 화면·확장이 보는 실행. 토큰·멱등 키·지문은 싣지 않는다. lockKeys는 지금 잡고 있는 키(끝난 실행은 빈 목록). */
export function toOperationView(record: OperationRecord): OperationView {
  return {
    id: record.id,
    kind: record.kind,
    status: record.status,
    lockKeys: [...record.lockKeys].sort(),
    plan: record.plan,
    progress: record.progress,
    result: record.result,
    window: record.window,
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
    startedAt: record.startedAt.toISOString(),
    finishedAt: record.finishedAt?.toISOString() ?? null,
    expiresAt: record.expiresAt.toISOString(),
    attempts: record.attempts,
    maxAttempts: record.maxAttempts,
    scheduledFor: record.scheduledFor?.toISOString() ?? null,
  };
}

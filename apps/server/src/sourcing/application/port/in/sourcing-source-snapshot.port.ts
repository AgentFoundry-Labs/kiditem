/**
 * Sourcing이 다른 owner(supply 발주 게이트 등)에 내주는 "현재 완결 스냅샷" capability (KID-360).
 * 옛 `sourcing_evidence_ingestion_runs.is_current_complete`를 직접 읽던 코드를 대체한다:
 * 호출자는 실행 표도 run 표도 모르고, (sourceKey, scopeKey, targetKey)마다 하나뿐인 현재 스냅샷만 본다.
 */
export const SOURCING_SOURCE_SNAPSHOT_PORT = Symbol('SOURCING_SOURCE_SNAPSHOT_PORT');

export interface SourcingSourceSnapshotView {
  /** 이 스냅샷을 만든 실행(operations.id, 스칼라). 옛 run으로 만든 행은 옛 run id를 그대로 가진다. */
  operationId: string;
  sourceKey: string;
  scopeKey: string;
  targetKey: string;
  /** 원천 관측 창(timestamptz — 실행 계약의 업무일 window와 다르다). */
  windowStartAt: string | null;
  windowEndAt: string | null;
  completedAt: string;
  coverage: { numerator: number; denominator: number } | null;
}

export interface SourcingSourceSnapshotPort {
  currentSourceSnapshot(input: {
    organizationId: string;
    sourceKey: string;
    scopeKey: string;
    targetKey: string;
  }): Promise<SourcingSourceSnapshotView | null>;
}

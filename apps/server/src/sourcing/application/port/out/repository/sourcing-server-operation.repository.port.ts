export const SOURCING_SERVER_OPERATION_REPOSITORY_PORT = Symbol('SOURCING_SERVER_OPERATION_REPOSITORY_PORT');

/** 서버 구동 소싱 실행 한 줄(KID-389). 상태는 계약의 만료 규칙으로 비춘 값이다. */
export interface SourcingServerOperationRecord {
  id: string;
  kind: string;
  status: string;
  plan: Record<string, unknown>;
  result: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  expiresAt: Date;
}

/** 원천·대상의 현재 발행(`isCurrent`). 옛 run 시절 발행은 `operationId`가 run id다. */
export interface SourcingCurrentSourcePublication {
  operationId: string;
  sourceKey: string;
  scopeKey: string;
  targetKey: string;
  plan: Record<string, unknown>;
  windowStartAt: Date | null;
  windowEndAt: Date | null;
  acceptedCount: number;
  contentChecksum: string | null;
  qualityReport: Record<string, unknown>;
  completedAt: Date;
}

export interface SourcingSourceTarget {
  organizationId: string;
  sourceKey: string;
  scopeKey: string;
  targetKey: string;
}

/**
 * 서버 구동 소싱 kind(KID-389)의 읽기: 실행은 `common/operation/transaction` 리더로, 현재 완결은 발행 표로 읽는다.
 * 쓰기는 없다 — 실행 행은 계약이, 원장·발행은 owner finalize가 쓴다.
 */
export interface SourcingServerOperationRepositoryPort {
  /** 이 원천·범위(대상을 주면 그 대상)의 가장 최근 실행(실패·진행 중 포함). */
  latestForTarget(input: Omit<SourcingSourceTarget, 'targetKey'> & { targetKey?: string; kinds: readonly string[] }): Promise<SourcingServerOperationRecord | null>;
  /** 같은 요청 멱등 키로 이미 연 실행(재전송이면 같은 실행을 돌려준다). */
  findByRequestKey(input: { organizationId: string; kind: string; sourceKey: string; requestIdempotencyKey: string }): Promise<SourcingServerOperationRecord | null>;
  currentPublication(input: SourcingSourceTarget): Promise<SourcingCurrentSourcePublication | null>;
}

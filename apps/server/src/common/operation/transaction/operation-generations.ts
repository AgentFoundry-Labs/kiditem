import type { Prisma } from '@prisma/client';
import { decideFailure } from '../domain/operation-attempt';
import { isLeaseExpired, OPERATION_EXPIRED_ERROR_CODE, OPERATION_EXPIRED_ERROR_MESSAGE } from '../domain/operation-fence';

/*
 * owner 트랜잭션 안의 실행 읽기 계약(KID-361). 실행 표는 common/operation만 읽고(ADR-0025,
 * `check:operation-owner-boundary`), 원장 사실을 실행과 같은 트랜잭션·스냅샷에서 골라야 하는 owner(셀피아 상품 손익 세대)는
 * `OperationPort` 대신 이 함수들을 자기 트랜잭션 클라이언트로 부른다. 쓰지 않는다 — 임대가 끝난 실행의 처분(재예약·만료
 * 실패와 owner onFailed)은 `OperationPort`가 다음 읽기·claim에서 하고, 여기서는 그 처분 결과를 같은 규칙으로 비춰 보인다.
 */

/** 한 kind의 끝난(또는 도는) 실행 한 줄. owner가 plan·result를 자기 Zod로 읽는다. */
export interface OperationGenerationRow {
  id: string;
  kind: string;
  status: string;
  plan: Prisma.JsonValue | null;
  result: Prisma.JsonValue | null;
  windowStart: Date | null;
  windowEnd: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  expiresAt: Date;
}

const SELECT = {
  id: true,
  kind: true,
  status: true,
  plan: true,
  result: true,
  windowStart: true,
  windowEnd: true,
  errorCode: true,
  errorMessage: true,
  startedAt: true,
  finishedAt: true,
  expiresAt: true,
  attempts: true,
  maxAttempts: true,
} as const;

/**
 * 호출자 트랜잭션 안에서 도는 평범한 함수(`<owner>/transaction/` 규칙, KID-361). 한 kind의 성공한 실행을 끝난 순서의
 * 역순(최신 먼저)으로 읽는다 — 실행마다 불변 원장 한 벌을 남기는 owner(셀피아 상품 손익 세대)가 "가장 최근 발행"과
 * "정확히 그 발행"을 원장 사실과 같은 트랜잭션에서 고를 때 쓴다. `id`를 주면 그 실행 하나만(성공한 것일 때) 읽는다.
 * 실행 표를 읽는 코드는 이 모듈(common/operation)에만 둔다(ADR-0025, `check:operation-owner-boundary`).
 */
export async function readSucceededOperationGenerations(
  tx: Prisma.TransactionClient,
  input: Readonly<{ organizationId: string; kind: string; id?: string; limit?: number }>,
): Promise<OperationGenerationRow[]> {
  const rows = await tx.operation.findMany({
    where: {
      organizationId: input.organizationId,
      kind: input.kind,
      status: 'succeeded',
      finishedAt: { not: null },
      ...(input.id ? { id: input.id } : {}),
    },
    orderBy: [{ finishedAt: 'desc' }, { id: 'desc' }],
    ...(input.limit ? { take: input.limit } : {}),
    select: SELECT,
  });
  return rows.map(({ attempts: _attempts, maxAttempts: _maxAttempts, ...operation }) => operation);
}

/**
 * 한 kind의 가장 최근 실행 하나(상태 무관, 시작 순). 준비 상태 화면이 "마지막 시도가 실패했는가"를 볼 때 쓴다. 임대가
 * 끝났는데 아직 처분되지 않은 `executing`은 `OperationPort`의 만료 규칙대로 비춘다: 시도가 남으면 다시 claim될
 * `prepared`, 다 썼으면 만료 `failed`(둘 다 `OPERATION_FENCE_LOST`/`expired`).
 */
export async function readLatestOperation(
  tx: Prisma.TransactionClient,
  input: Readonly<{ organizationId: string; kind: string; now?: Date }>,
): Promise<OperationGenerationRow | null> {
  const row = await tx.operation.findFirst({
    where: { organizationId: input.organizationId, kind: input.kind },
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    select: SELECT,
  });
  if (!row) return null;
  const { attempts, maxAttempts, ...operation } = row;
  const now = input.now ?? new Date();
  if (operation.status !== 'executing' || !isLeaseExpired(operation.expiresAt, now)) return operation;
  const lapsed = { errorCode: OPERATION_EXPIRED_ERROR_CODE, errorMessage: OPERATION_EXPIRED_ERROR_MESSAGE };
  return decideFailure({ attempts, maxAttempts }, 0, now).retry
    ? { ...operation, ...lapsed, status: 'prepared' }
    : { ...operation, ...lapsed, status: 'failed', finishedAt: now };
}

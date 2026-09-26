import type { Prisma } from '@prisma/client';

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
  return tx.operation.findMany({
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
}

/**
 * 한 kind의 가장 최근 실행 하나(상태 무관, 시작 순). 준비 상태 화면이 "마지막 시도가 실패했는가"를 볼 때 쓴다. 임대가
 * 끝난 도는 실행은 만료 처분 전이라 `executing`으로 남아 있을 수 있다 — 호출자가 `expiresAt`으로 판단한다.
 */
export async function readLatestOperation(
  tx: Prisma.TransactionClient,
  input: Readonly<{ organizationId: string; kind: string }>,
): Promise<OperationGenerationRow | null> {
  return tx.operation.findFirst({
    where: { organizationId: input.organizationId, kind: input.kind },
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    select: SELECT,
  });
}

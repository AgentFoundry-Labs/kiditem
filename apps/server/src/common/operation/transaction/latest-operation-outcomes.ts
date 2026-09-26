import type { Prisma } from '@prisma/client';

/**
 * 한 원천 정체성(kind + 범위)의 가장 최근 성공 또는 가장 최근 실패 실행 하나. `scope`는 plan의 `channelAccountId`,
 * 없으면 `mallKey`, 둘 다 없으면 빈 문자열(조직 하나에 원천 하나)이다 — 끝난 실행은 잠금 키를 남기지 않으므로
 * (`close`가 `operation_locks`를 지운다) owner가 잠금에 쓰던 범위를 plan에서 다시 읽는다.
 */
export interface OperationOutcomeRow {
  id: string;
  kind: string;
  scope: string;
  outcome: 'succeeded' | 'failed';
  errorCode: string | null;
  finishedAt: Date;
}

/**
 * 호출자 클라이언트(트랜잭션이든 아니든)로 도는 평범한 읽기(`<owner>/transaction/` 규칙, KID-355 정책 B).
 * 주어진 kind들의 끝난 실행을 (kind, scope, 결과)마다 가장 최근 것 하나씩 읽는다. 결과는 `succeeded`와 `failed`
 * 둘이고, 운영자가 멈춘 실행(`cancelled` 상태, 또는 `*_CANCELLED` 코드로 끝난 실패)은 실패로 세지 않는다 — 옛 알림
 * writer(`recordTerminalOutcome`)가 취소를 알림으로 남기지 않던 규칙과 같다. 임대가 끝났는데 아직 처분되지 않은
 * `executing`은 끝난 실행이 아니므로 읽지 않는다(다음 읽기·claim이 만료 실패로 닫으면 그때 보인다).
 * 실행 표를 읽는 코드는 이 모듈(common/operation)에만 둔다(ADR-0025, `check:operation-owner-boundary`).
 */
export async function readLatestOperationOutcomes(
  client: Prisma.TransactionClient,
  input: Readonly<{ organizationId: string; kinds: readonly string[] }>,
): Promise<OperationOutcomeRow[]> {
  if (input.kinds.length === 0) return [];
  const rows = await client.$queryRaw<Array<{
    id: string;
    kind: string;
    scope: string;
    outcome: 'succeeded' | 'failed';
    error_code: string | null;
    finished_at: Date;
  }>>`
    SELECT DISTINCT ON (kind, scope, outcome) id, kind, scope, outcome, error_code, finished_at
    FROM (
      SELECT o.id::text AS id, o.kind, o.error_code, o.finished_at,
        COALESCE(o.plan ->> 'channelAccountId', o.plan ->> 'mallKey', '') AS scope,
        o.status AS outcome
      FROM operations o
      WHERE o.organization_id = ${input.organizationId}::uuid
        AND o.kind = ANY(${[...input.kinds]}::text[])
        AND o.finished_at IS NOT NULL
        AND (
          o.status = 'succeeded'
          OR (o.status = 'failed' AND (o.error_code IS NULL OR right(o.error_code, 10) <> '_CANCELLED'))
        )
    ) finished
    ORDER BY kind, scope, outcome, finished_at DESC, id DESC
  `;
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    scope: row.scope,
    outcome: row.outcome,
    errorCode: row.error_code,
    finishedAt: row.finished_at,
  }));
}

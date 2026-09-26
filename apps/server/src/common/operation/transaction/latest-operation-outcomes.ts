import { Prisma } from '@prisma/client';
import { OPERATION_EXPIRED_ERROR_CODE } from '../domain/operation-fence';

/**
 * 한 원천 정체성(kind + 범위)의 가장 최근 성공 또는 가장 최근 실패 실행 하나. `scope`는 호출자가 kind마다 고른 plan
 * 필드의 값(없으면 빈 문자열 — 조직 하나에 원천 하나)이다. 끝난 실행은 잠금 키를 남기지 않으므로(`close`가
 * `operation_locks`를 지운다) owner가 잠금·원천 구분에 쓰던 범위를 plan에서 다시 읽는다.
 */
export interface OperationOutcomeRow {
  id: string;
  kind: string;
  scope: string;
  outcome: 'succeeded' | 'failed';
  errorCode: string | null;
  startedAt: Date;
  finishedAt: Date;
  /** 호출자가 `planFields`로 청한 plan 최상위 필드의 문자열 값(없으면 null). */
  fields: Record<string, string | null>;
}

/**
 * 호출자 클라이언트(트랜잭션이든 아니든)로 도는 평범한 읽기(`<owner>/transaction/` 규칙, KID-355 정책 B).
 * 주어진 kind들의 끝난 실행을 (kind, scope, 결과)마다 가장 최근 것 하나씩 읽는다. 결과는 `succeeded`와 `failed`
 * 둘이고, 운영자가 멈춘 실행(`cancelled` 상태, 또는 `*_CANCELLED` 코드로 끝난 실패)은 실패로 세지 않는다 — 옛 알림
 * writer(`recordTerminalOutcome`)가 취소를 알림으로 남기지 않던 규칙과 같다. `ignoredErrorCodes`로 끝난 실패도 세지
 * 않는다(원천이 실패한 것이 아닌 owner 거절, 예 이미 수집한 원본).
 *
 * 임대가 끝났는데 아직 처분되지 않은 `executing`은 `readLatestOperation`(operation-generations)과 같은 규칙으로 비춘다:
 * 시도가 남지 않았으면 만료 실패(`OPERATION_FENCE_LOST`, 끝난 시각 = 임대 만료 시각), 남았으면 다시 claim될
 * 실행이라 실패가 아니다.
 * 실행 표를 읽는 코드는 이 모듈(common/operation)에만 둔다(ADR-0025, `check:operation-owner-boundary`).
 */
export async function readLatestOperationOutcomes(
  client: Prisma.TransactionClient,
  input: Readonly<{
    organizationId: string;
    kinds: readonly string[];
    /** kind → 정체성을 가르는 plan 최상위 필드. 없는 kind는 kind 하나가 정체성이다. */
    scopeFields?: Readonly<Record<string, string>>;
    ignoredErrorCodes?: readonly string[];
    planFields?: readonly string[];
    now?: Date;
  }>,
): Promise<OperationOutcomeRow[]> {
  if (input.kinds.length === 0) return [];
  const now = input.now ?? new Date();
  const scopeCases = Object.entries(input.scopeFields ?? {})
    .filter(([kind]) => input.kinds.includes(kind))
    .map(([kind, field]) => Prisma.sql`WHEN ${kind} THEN o.plan ->> ${field}`);
  const scope = scopeCases.length > 0
    ? Prisma.sql`COALESCE(CASE o.kind ${Prisma.join(scopeCases, ' ')} END, '')`
    : Prisma.sql`''`;
  const planFields = input.planFields ?? [];
  const fields = planFields.length > 0
    ? Prisma.sql`jsonb_build_object(${Prisma.join(planFields.map((field) => Prisma.sql`${field}::text, o.plan ->> ${field}`))})`
    : Prisma.sql`'{}'::jsonb`;
  const expired = Prisma.sql`(o.status = 'executing' AND o.expires_at <= ${now} AND o.attempts >= o.max_attempts)`;
  const rows = await client.$queryRaw<Array<{
    id: string;
    kind: string;
    scope: string;
    outcome: 'succeeded' | 'failed';
    error_code: string | null;
    started_at: Date;
    finished_at: Date;
    fields: Record<string, string | null> | null;
  }>>`
    SELECT DISTINCT ON (kind, scope, outcome) id, kind, scope, outcome, error_code, started_at, finished_at, fields
    FROM (
      SELECT o.id::text AS id, o.kind, o.started_at,
        ${scope} AS scope,
        ${fields} AS fields,
        CASE WHEN o.status = 'succeeded' THEN 'succeeded' ELSE 'failed' END AS outcome,
        CASE WHEN ${expired} THEN ${OPERATION_EXPIRED_ERROR_CODE} ELSE o.error_code END AS error_code,
        CASE WHEN ${expired} THEN o.expires_at ELSE o.finished_at END AS finished_at
      FROM operations o
      WHERE o.organization_id = ${input.organizationId}::uuid
        AND o.kind = ANY(${[...input.kinds]}::text[])
        AND (
          (o.status = 'succeeded' AND o.finished_at IS NOT NULL)
          OR (o.status = 'failed' AND o.finished_at IS NOT NULL AND (o.error_code IS NULL OR (
            right(o.error_code, 10) <> '_CANCELLED' AND NOT (o.error_code = ANY(${[...(input.ignoredErrorCodes ?? [])]}::text[]))
          )))
          OR ${expired}
        )
    ) finished
    ORDER BY kind, scope, outcome, finished_at DESC, started_at DESC, id DESC
  `;
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    scope: row.scope,
    outcome: row.outcome,
    errorCode: row.error_code,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    fields: row.fields ?? {},
  }));
}

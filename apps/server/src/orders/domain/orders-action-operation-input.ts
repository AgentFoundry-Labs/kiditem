import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import type { z } from 'zod';

/**
 * Orders 작업 실행 kind 6종(KID-355 wave8b)이 scope·plan·청크·운영자 확인을 읽는 공통 규칙. 모양이 틀리면 모두
 * `VALIDATION_FAILED`(details.reason)다 — 확장·운영자 입력은 신뢰 경계 밖이다.
 */
export function parseActionInput<S extends z.ZodTypeAny>(schema: S, value: unknown, reason: string): z.output<S> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw invalidActionInput(reason, {
    errors: parsed.error.issues.slice(0, 5).map((issue) => ({ field: issue.path.join('.'), reason: issue.message })),
  });
}

/** 청크는 모두 `chunkKind`여야 하고, 항목마다 `itemSchema`를 지켜야 한다. 순서(sequence)대로 이어 붙인다. */
export function readActionChunkItems<S extends z.ZodTypeAny>(
  chunks: readonly OperationStagedChunk[],
  chunkKind: string,
  itemSchema: S,
): z.output<S>[] {
  const items: z.output<S>[] = [];
  for (const chunk of [...chunks].sort((left, right) => left.sequence - right.sequence)) {
    if (chunk.chunkKind !== chunkKind) throw invalidActionInput('unexpected_chunk_kind', { chunkKind: chunk.chunkKind });
    items.push(...parseActionInput(itemSchema.array(), chunk.payload, `invalid_${chunkKind}`));
  }
  return items;
}

export function invalidActionInput(reason: string, details: Record<string, unknown> = {}): KiditemInvalidValueError {
  return new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason, ...details } });
}

/** 공백을 뗀 주문번호를 처음 나온 순서로 한 번씩. */
export function uniqueOrderNumbers(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/** `values`가 모두 `allowed` 안인가. 아니면 대상 밖 번호로 거절한다(비가역 단계가 대상 밖을 건드리지 않게). */
export function assertWithinTargets(values: readonly string[], allowed: readonly string[], reason: string): void {
  const allowedSet = new Set(allowed);
  const outside = values.filter((value) => !allowedSet.has(value));
  if (outside.length > 0) throw invalidActionInput(reason, { outside: outside.slice(0, 20), outsideCount: outside.length });
}

/**
 * 운영자 확인 표시. 확인 서비스만 `operations.resolve`의 result에 이 심볼 칸으로 확인 본문을 싣는다 — 계약은 그 result를
 * 메모리에서 그대로 finalize에 넘기고, 저장되는 result는 owner finalize가 새로 만든다. 심볼은 JSON에 실리지 않으므로 확장
 * finish result(같은 이름의 문자열 칸 포함)는 운영자 확인이 될 수 없다.
 */
const OPERATOR_CONFIRMATION: unique symbol = Symbol('orders.operatorConfirmation');

/** 확인 서비스가 resolve result로 넘길 값. */
export function withOperatorConfirmation(confirmation: unknown): Record<string, unknown> {
  return { [OPERATOR_CONFIRMATION]: confirmation } as Record<string, unknown>;
}

/** 운영자 확인(`resolve` succeeded)으로 불린 finalize면 그 확인 본문을 `schema`로 읽는다. 아니면 null. */
export function readOperatorConfirmation<S extends z.ZodTypeAny>(result: unknown, schema: S): z.output<S> | null {
  if (!result || typeof result !== 'object' || !(OPERATOR_CONFIRMATION in result)) return null;
  return parseActionInput(schema, (result as { [OPERATOR_CONFIRMATION]: unknown })[OPERATOR_CONFIRMATION], 'invalid_operator_confirmation');
}

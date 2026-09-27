import { KiditemError } from '@kiditem/shared/errors';
import { findChannel } from '@kiditem/shared/channel-registry';
import {
  REGISTRATION_KIND,
  RegistrationPlanSchema,
  type RegistrationPlan,
} from '@kiditem/shared/channels-operations';
import { THUMBNAIL_UPDATE_EXECUTION_KIND } from '@kiditem/shared/thumbnail-execution';
import type { Prisma } from '@prisma/client';
import { readOperationsByPlan, type OperationByPlanRow } from '../../../../common/operation/transaction/operations-by-plan';
import { countFrozenSalesProductOptionReferences } from '../../../domain/registration/registration-execution-state';
import { ChannelIntegrityAdapter } from '../integrity/channel-integrity.adapter';
import { hashRegistrationSubmissionPayload } from '../../../domain/registration/registration-submission-payload';

const channelIntegrity = new ChannelIntegrityAdapter();

/**
 * 등록 실행(`channels.registration`, KID-364)에서 fence 밖 Channels 어댑터가 쓰는 좁은 사실 질의. 실행 행은 실행 계약의
 * 읽기 함수(`common/operation/transaction/operations-by-plan`)로만 보고 plan 을 등록 실행 Zod 로 읽는다 — 옛 등록 실행 표는
 * 읽지 않는다. 등록 상태는 여기서 읽지 않는다(등록 상태 reader 하나). 호출자의 클라이언트로 도는 읽기 전용 함수다.
 */

export const LIVE_OPERATION_STATUSES = ['prepared', 'executing', 'reconciling'] as const;

export interface RegistrationOperationFact {
  id: string;
  status: string;
  plan: RegistrationPlan;
  result: Record<string, unknown>;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

/** 등록 실행 중 plan 이 조건 하나를 품은 것(시작 역순). plan 이 등록 실행 모양이 아니면 무결성 오류다. */
export async function readRegistrationOperations(
  client: Prisma.TransactionClient,
  input: { organizationId: string; planContainsAny: readonly Record<string, unknown>[]; statuses?: readonly string[] },
): Promise<RegistrationOperationFact[]> {
  const rows = await readOperationsByPlan(client, {
    organizationId: input.organizationId,
    kinds: [REGISTRATION_KIND],
    planContainsAny: input.planContainsAny,
    ...(input.statuses ? { statuses: input.statuses } : {}),
  });
  return rows.map(toFact);
}

function toFact(row: OperationByPlanRow): RegistrationOperationFact {
  const plan = RegistrationPlanSchema.safeParse(row.plan);
  if (!plan.success) throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'REGISTRATION_PLAN_INVALID' } });
  return {
    id: row.id,
    status: row.status,
    plan: plan.data,
    result: record(row.result) ?? {},
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

/**
 * 폼만 채우고 [등록]을 누르지 않은 문서 실행(빠른 등록, ADR-0019 관문이 거른 등록). 성공이어도 몰에 올린 사실이 아니라
 * 등록 상태 · 중복 차단 · 재전송 기준에 들어가지 않는다.
 */
export function isFillOnly(operation: Pick<RegistrationOperationFact, 'status' | 'result'>): boolean {
  return operation.status === 'succeeded' && operation.result.mallOutcome === 'not_submitted';
}

/** 등록 대상 문서 실행이 얼린 스냅샷(빠른 등록 · 품절 · 대표이미지는 null). */
export function frozenSnapshot(plan: RegistrationPlan): Record<string, unknown> | null {
  return record(record(plan.payload)?.snapshot);
}

/** 판매 상품 하나의 등록 실행이 얼린 옵션 참조 수. 옵션을 지우거나 바꿀 수 있는지 볼 때 쓴다. */
export async function readSalesProductOptionExecutionCounts(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; salesProductId: string },
): Promise<ReadonlyMap<string, number>> {
  const operations = await readRegistrationOperations(tx, {
    organizationId: input.organizationId,
    planContainsAny: [{ salesProductId: input.salesProductId }],
  });
  return countFrozenSalesProductOptionReferences(operations.map((operation) => ({ submissionPayloadJson: frozenSnapshot(operation.plan) })));
}

/** 살아 있는 구성 전환은 그 전환이 가리킨 몰 옵션만 불확실하게 만든다. */
export async function readUnresolvedCompositionOptionIds(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; channelListingIds: readonly string[] },
): Promise<ReadonlySet<string>> {
  if (input.channelListingIds.length === 0) return new Set();
  const operations = await readRegistrationOperations(tx, {
    organizationId: input.organizationId,
    planContainsAny: input.channelListingIds.map((channelListingId) => ({ executionKind: 'composition_change', channelListingId })),
    statuses: ['executing', 'reconciling'],
  });
  const ids = new Set<string>();
  for (const operation of operations) {
    const transitions = frozenSnapshot(operation.plan)?.optionTransitions;
    if (!Array.isArray(transitions) || transitions.length === 0) {
      throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'COMPOSITION_TRANSITIONS_MISSING' } });
    }
    for (const transition of transitions) {
      const id = record(transition)?.channelListingOptionId;
      if (typeof id !== 'string' || !id) throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'COMPOSITION_OPTION_IDENTITY_INVALID' } });
      ids.add(id);
    }
  }
  return ids;
}

/**
 * 성공한 `register` 실행 가운데 채널 어댑터가 셀피아 레시피를 얼린 것(KID-321) — 등록 뒤에 카탈로그로 들어온 몰 옵션에도
 * 같은 레시피를 건다. 연결된 리스팅은 finalize 가 `result.channelListingId` 에 남긴다. 얼린 문서는 plan 의 `payloadHash`
 * 와 다시 맞춰 본 뒤에만 돌려준다.
 */
export async function readPreparedRegistrationRecipes(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; channelListingIds: readonly string[] },
): Promise<Array<{ channelListingId: string; snapshot: Record<string, unknown> }>> {
  if (input.channelListingIds.length === 0) return [];
  const wanted = new Set(input.channelListingIds);
  const operations = await readRegistrationOperations(tx, {
    organizationId: input.organizationId,
    planContainsAny: [{ executionKind: 'register' }],
    statuses: ['succeeded'],
  });
  return operations.flatMap((operation) => {
    const channelListingId = typeof operation.result.channelListingId === 'string' ? operation.result.channelListingId : null;
    const snapshot = frozenSnapshot(operation.plan);
    if (!channelListingId || !wanted.has(channelListingId) || !snapshot) return [];
    if (hashRegistrationSubmissionPayload(operation.plan.payload, channelIntegrity.sha256) !== operation.plan.payloadHash) {
      throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'REGISTERED_RECIPE_HASH_MISMATCH' } });
    }
    return [{ channelListingId, snapshot }];
  });
}

/** 몰별 실패한 등록 실행 수. 대표이미지 반영은 상품 등록이 아니라 세지 않는다. */
export async function readRegistrationFailureCounts(
  tx: Prisma.TransactionClient,
  input: { organizationId: string },
): Promise<Array<{ channel: string; mallName: string; count: number }>> {
  const failed = (await readRegistrationOperations(tx, {
    organizationId: input.organizationId,
    planContainsAny: [{}],
    statuses: ['failed'],
  })).filter((operation) => operation.plan.executionKind !== THUMBNAIL_UPDATE_EXECUTION_KIND);
  const counts = new Map<string, { channel: string; mallName: string; count: number }>();
  for (const operation of failed) {
    const channel = operation.plan.mallKey;
    const previous = counts.get(channel);
    counts.set(channel, { channel, mallName: findChannel(channel)?.name ?? channel, count: (previous?.count ?? 0) + 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.channel.localeCompare(b.channel));
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

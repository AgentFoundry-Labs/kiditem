import { KiditemError } from '@kiditem/shared/errors';
import { findChannel } from '@kiditem/shared/channel-registry';
import { countFrozenSalesProductOptionReferences } from '../../../domain/registration/registration-execution-state';
import type { Prisma } from '@prisma/client';

/**
 * `ProductRegistrationExecution` 원장의 owner 로컬 읽기(ADR-0009, `scripts/ledger-readers.json` 등록). 조합
 * 옵션 · 등록 레시피 · 실패 수 · 얼린 옵션 참조처럼 fence 밖 Channels 어댑터가 쓰는 좁은 질의만 둔다. 등록
 * 상태는 여기서 읽지 않는다 — 그것은 등록 상태 reader(`registration-state.repository.adapter.ts`) 하나다.
 * 호출자의 트랜잭션을 받는 읽기 전용 함수라 잠금도, 쓰기도 없다.
 */

/** The only execution column needed when a caller checks option identity use. */
export const REGISTRATION_EXECUTION_OPTION_SNAPSHOT_SELECT = {
  submissionPayloadJson: true,
} satisfies Prisma.ProductRegistrationExecutionSelect;

/**
 * Read execution references for one selling product through the registered
 * Channels ledger reader. The caller owns the transaction and any product
 * lock; this function only reads the frozen JSON and never mutates the ledger.
 */
export async function readSalesProductOptionExecutionCounts(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; salesProductId: string },
): Promise<ReadonlyMap<string, number>> {
  const rows = await tx.productRegistrationExecution.findMany({
    where: {
      organizationId: input.organizationId,
      preparation: { salesProductId: input.salesProductId },
    },
    select: REGISTRATION_EXECUTION_OPTION_SNAPSHOT_SELECT,
  });
  return countFrozenSalesProductOptionReferences(rows);
}

/** A started composition change makes only its selected external options uncertain. */
export async function readUnresolvedCompositionOptionIds(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; channelListingIds: readonly string[] },
): Promise<ReadonlySet<string>> {
  if (input.channelListingIds.length === 0) return new Set();
  const rows = await tx.productRegistrationExecution.findMany({
    where: {
      organizationId: input.organizationId,
      channelListingId: { in: [...input.channelListingIds] },
      executionKind: 'composition_change',
      status: { in: ['executing', 'reconciling'] },
      providerOutcome: 'uncertain',
    },
    select: REGISTRATION_EXECUTION_OPTION_SNAPSHOT_SELECT,
  });
  const ids = new Set<string>();
  for (const row of rows) {
    const transitions = record(row.submissionPayloadJson)?.optionTransitions;
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

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Successful immutable `register` executions whose channel adapter froze a Sellpia recipe (KID-321), for
 * catalog options that arrive after the registration.
 */
export async function readPreparedRegistrationRecipes(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; channelListingIds: readonly string[] },
) {
  if (input.channelListingIds.length === 0) return [];
  return tx.productRegistrationExecution.findMany({
    where: {
      organizationId: input.organizationId,
      channelListingId: { in: [...input.channelListingIds] },
      status: 'succeeded', providerOutcome: 'succeeded', executionKind: 'register',
    },
    select: { channelListingId: true, submissionPayloadJson: true, submissionPayloadHash: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}

/** One execution per preparation is enforced by the ledger's unique key. */
export async function readRegistrationFailureCounts(
  tx: Prisma.TransactionClient,
  input: { organizationId: string },
): Promise<Array<{ channel: string; mallName: string; count: number }>> {
  const failed = await tx.productRegistrationExecution.findMany({
    // 대표이미지 반영(thumbnail_update)은 상품 등록이 아니라 등록 실패로 세지 않는다.
    where: { organizationId: input.organizationId, status: 'failed', executionKind: { not: 'thumbnail_update' } },
    select: { channelAccountId: true },
  });
  if (failed.length === 0) return [];
  const accounts = await tx.channelAccount.findMany({
    where: { organizationId: input.organizationId, id: { in: [...new Set(failed.map((row) => row.channelAccountId))] } },
    select: { id: true, channel: true },
  });
  const counts = new Map<string, { channel: string; mallName: string; count: number }>();
  for (const row of failed) {
    const account = accounts.find(({ id }) => id === row.channelAccountId);
    if (!account) continue;
    const previous = counts.get(account.channel);
    counts.set(account.channel, { channel: account.channel, mallName: findChannel(account.channel)?.name ?? account.channel, count: (previous?.count ?? 0) + 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.channel.localeCompare(b.channel));
}

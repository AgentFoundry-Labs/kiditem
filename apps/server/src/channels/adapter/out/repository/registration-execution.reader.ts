import { findChannel } from '@kiditem/shared/channel-registry';
import {
  countFrozenSalesProductOptionReferences,
  type RegistrationExecutionFact,
} from '../../../domain/registration/registration-execution-state';
import type { Prisma } from '@prisma/client';

/**
 * `ProductRegistrationExecution` 원장의 등록 리더(ADR-0021).
 *
 * 울타리는 Channels 것이고([ADR-0014](../../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md))
 * 쓰기는 Channels 저장소 어댑터만 한다. 울타리 밖 — 수집후보의 등록 상태를 비추는
 * Sourcing 을 포함해 — 에서는 이 파일로만 읽는다. 호출자의 트랜잭션을 받는 순수
 * 함수라 잠금도, 어댑터 의존도 없다.
 */

export const REGISTRATION_EXECUTION_FACT_SELECT = {
  id: true,
  registrationTargetId: true,
  channelAccountId: true,
  channelListingId: true,
  executionKind: true,
  status: true,
  providerOutcome: true,
  providerSubmissionId: true,
  externalListingId: true,
  resultJson: true,
  reviewPayloadHash: true,
  approvedAt: true,
  approvedByUserId: true,
  createdAt: true,
} satisfies Prisma.ProductRegistrationExecutionSelect;

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
      throw new Error('Unresolved composition execution is missing its frozen option transitions.');
    }
    for (const transition of transitions) {
      const id = record(transition)?.channelListingOptionId;
      if (typeof id !== 'string' || !id) throw new Error('Invalid frozen composition option identity.');
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
 * 초안 id 로 실행을 읽는다. 초안은 다른 owner 의 행이라 관계 join 이 없다
 * (ADR-0013) — 호출자가 자기 초안 id 를 넘긴다.
 */
export async function readRegistrationExecutionFacts(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; registrationTargetIds: readonly string[] },
): Promise<readonly RegistrationExecutionFact[]> {
  if (input.registrationTargetIds.length === 0) return [];
  const rows = await tx.productRegistrationExecution.findMany({
    where: {
      organizationId: input.organizationId,
      registrationTargetId: { in: [...input.registrationTargetIds] },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: REGISTRATION_EXECUTION_FACT_SELECT,
  });
  return rows.flatMap((row) => row.registrationTargetId === null ? [] : [{
    executionId: row.id,
    registrationTargetId: row.registrationTargetId,
    channelAccountId: row.channelAccountId,
    channelListingId: row.channelListingId,
    executionKind: row.executionKind,
    status: row.status,
    providerOutcome: row.providerOutcome,
    providerSubmissionId: row.providerSubmissionId,
    externalListingId: row.externalListingId,
    hasResult: row.resultJson !== null,
    reviewPayloadHash: row.reviewPayloadHash,
    approvedAt: row.approvedAt,
    approvedByUserId: row.approvedByUserId,
    createdAt: row.createdAt,
  }]);
}

/** Successful immutable registration recipes awaiting their real catalog option identities. */
export async function readPreparedRegistrationRecipes(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; channelListingIds: readonly string[] },
) {
  if (input.channelListingIds.length === 0) return [];
  return tx.productRegistrationExecution.findMany({
    where: {
      organizationId: input.organizationId,
      channelListingId: { in: [...input.channelListingIds] },
      status: 'succeeded', providerOutcome: 'succeeded', executionKind: 'external_wing',
    },
    select: { channelListingId: true, submissionPayloadJson: true, submissionPayloadHash: true, requestHash: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}

/** One execution per preparation is enforced by the ledger's unique key. */
export async function readRegistrationFailureCounts(
  tx: Prisma.TransactionClient,
  input: { organizationId: string },
): Promise<Array<{ channel: string; mallName: string; count: number }>> {
  const failed = await tx.productRegistrationExecution.findMany({
    where: { organizationId: input.organizationId, status: 'failed' },
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

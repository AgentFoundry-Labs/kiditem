import type { Prisma } from '@prisma/client';
import { LIVE_REGISTRATION_EXECUTION_STATUSES } from '../domain/registration-execution-state';

/**
 * `ProductRegistrationExecution` 원장의 등록 리더(ADR-0009).
 *
 * 울타리는 Channels 것이고([ADR-0014](../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md))
 * 쓰기는 Channels 저장소 어댑터만 한다. 울타리 밖 — 수집후보의 등록 상태를 비추는
 * Sourcing 을 포함해 — 에서는 이 파일로만 읽는다. 호출자의 트랜잭션을 받는 순수
 * 함수라 잠금도, 어댑터 의존도 없다.
 */

export type RegistrationExecutionFact = Readonly<{
  executionId: string;
  productPreparationId: string;
  channelAccountId: string;
  channelListingId: string | null;
  executionKind: string;
  status: string;
  providerOutcome: string;
  providerSubmissionId: string | null;
  externalListingId: string | null;
  hasResult: boolean;
  createdAt: Date;
}>;

/** 수집후보 하나가 지금 어떤 등록 상태인지. 후보 행이 아니라 울타리가 근거다. */
export type CandidateRegistrationState =
  | 'none'
  | 'preparing'
  | 'confirming'
  | 'failed'
  | 'registered';

export const REGISTRATION_EXECUTION_FACT_SELECT = {
  id: true,
  productPreparationId: true,
  channelAccountId: true,
  channelListingId: true,
  executionKind: true,
  status: true,
  providerOutcome: true,
  providerSubmissionId: true,
  externalListingId: true,
  resultJson: true,
  createdAt: true,
} satisfies Prisma.ProductRegistrationExecutionSelect;

/**
 * 초안 id 로 실행을 읽는다. 초안은 다른 owner 의 행이라 관계 join 이 없다
 * (ADR-0013) — 호출자가 자기 초안 id 를 넘긴다.
 */
export async function readRegistrationExecutionFacts(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; productPreparationIds: readonly string[] },
): Promise<readonly RegistrationExecutionFact[]> {
  if (input.productPreparationIds.length === 0) return [];
  const rows = await tx.productRegistrationExecution.findMany({
    where: {
      organizationId: input.organizationId,
      productPreparationId: { in: [...input.productPreparationIds] },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: REGISTRATION_EXECUTION_FACT_SELECT,
  });
  return rows.map((row) => ({
    executionId: row.id,
    productPreparationId: row.productPreparationId,
    channelAccountId: row.channelAccountId,
    channelListingId: row.channelListingId,
    executionKind: row.executionKind,
    status: row.status,
    providerOutcome: row.providerOutcome,
    providerSubmissionId: row.providerSubmissionId,
    externalListingId: row.externalListingId,
    hasResult: row.resultJson !== null,
    createdAt: row.createdAt,
  }));
}

/**
 * 울타리가 후보의 종료(거절·삭제)를 막는가.
 *
 * 살아 있는 실행이 하나라도 있거나, 끝난 실행에 공급자 식별자가 남아 있으면 막는다 —
 * 그 후보는 마켓에 무언가 올라갔을 수 있고, 후보를 지워도 그 사실은 사라지지 않는다.
 */
export function blocksCandidateTerminalTransition(
  facts: readonly RegistrationExecutionFact[],
): boolean {
  return facts.some((fact) =>
    (LIVE_REGISTRATION_EXECUTION_STATUSES as readonly string[]).includes(fact.status)
    || fact.providerSubmissionId !== null
    || fact.externalListingId !== null
    || fact.hasResult);
}

/**
 * 초안 하나의 등록 상태. 수집후보 화면이 "등록됨 / 확인중 / 실패"를 이 값으로 비춘다.
 *
 * `confirming` 은 제출 여부를 모르는 상태다(`reconciling`, 또는 시작됐지만 결과가
 * 아직 없는 `executing`). 그 구분이 사라지면 사람이 같은 상품을 한 번 더 올린다.
 */
export function candidateRegistrationState(
  facts: readonly RegistrationExecutionFact[],
): CandidateRegistrationState {
  if (facts.length === 0) return 'none';
  const [latest] = facts;
  if (!latest) return 'none';
  if (latest.status === 'succeeded') return 'registered';
  if (latest.status === 'reconciling') return 'confirming';
  if (latest.status === 'executing') {
    return latest.providerOutcome === 'succeeded' ? 'registered' : 'confirming';
  }
  if (latest.status === 'failed') return 'failed';
  if (latest.status === 'prepared') return 'preparing';
  return 'none';
}

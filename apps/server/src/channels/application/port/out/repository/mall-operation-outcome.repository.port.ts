export const MALL_OPERATION_OUTCOME_REPOSITORY_PORT = Symbol('MALL_OPERATION_OUTCOME_REPOSITORY_PORT');

/** 관찰 기록 한 줄. Prisma 타입이 아니라 이 레인의 모양이다. */
export interface MallOperationOutcomeRow {
  id: string;
  mallKey: string;
  operation: string;
  outcome: string;
  reasonCode: string | null;
  message: string | null;
  itemCount: number | null;
  failedCount: number | null;
  warningCount: number | null;
  occurredAt: Date;
}

export interface RecordMallOperationOutcomeInput {
  organizationId: string;
  actorUserId: string | null;
  idempotencyKey: string;
  mallKey: string;
  operation: string;
  outcome: string;
  reasonCode: string | null;
  message: string | null;
  itemCount: number | null;
  failedCount: number | null;
  warningCount: number | null;
}

export interface MallOperationOutcomeCountRow {
  mallKey: string;
  operation: string;
  outcome: string;
  count: number;
}

export interface MallOperationOutcomeRepositoryPort {
  /** 같은 (조직, idempotencyKey) 는 한 번만 쓴다. 이미 있으면 있던 줄을 돌려준다. */
  record(input: RecordMallOperationOutcomeInput): Promise<MallOperationOutcomeRow>;
  /** 기간 안의 (몰, 작업, 결과)별 건수와 (몰, 작업)마다 가장 최근 한 줄. 원장 리더를 거친다. */
  readSummary(input: { organizationId: string; since: Date }): Promise<{
    counts: readonly MallOperationOutcomeCountRow[];
    latest: readonly MallOperationOutcomeRow[];
  }>;
}
